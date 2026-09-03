-- Jurnal de activitate per companie: "cine a facut ce, cand" -- vizibil
-- pentru toti membrii companiei (proprietar, admin, contabil, vizualizator),
-- ca sprijin direct pentru colaborarea firma-contabil.
--
-- Scriere exclusiv prin triggere SECURITY DEFINER, niciodata direct din
-- client: RLS nu ofera nicio policy de INSERT/UPDATE/DELETE pentru
-- utilizatori normali, deci un client nu poate falsifica sau modifica o
-- intrare din jurnal -- inregistrarile reflecta ce a facut cu adevarat
-- baza de date, nu ce pretinde clientul ca a facut.
--
-- Logarea nu trebuie sa poata bloca niciodata actiunea reala a
-- utilizatorului: log_activity() prinde orice eroare interna si continua.

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  actor_auth_user_id uuid references auth.users(id) on delete set null,
  actor_label text not null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_company_created_idx
  on public.activity_log (company_id, created_at desc);

alter table public.activity_log enable row level security;

create policy activity_log_select_members
  on public.activity_log
  for select
  using (is_company_member(company_id));

-- Functie helper folosita de toate triggerele de mai jos. SECURITY DEFINER
-- ca sa poata scrie indiferent de policy-urile de INSERT (nu exista niciuna
-- pentru activity_log -- intentionat).
create or replace function public.log_activity(
  p_company_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_summary text,
  p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_label text;
begin
  -- SECURITY DEFINER functions are callable directly via
  -- /rest/v1/rpc/log_activity by any authenticated user unless EXECUTE is
  -- revoked (done below) -- this membership check is defense in depth on
  -- top of that, so a caller can never inject a fabricated entry into a
  -- company they do not belong to, even if the grant is ever restored.
  if not public.is_company_member(p_company_id) then
    return;
  end if;

  select coalesce(nullif(trim(au.full_name), ''), au.email)
  into v_actor_label
  from public.app_users au
  where au.auth_user_id = v_actor;

  insert into public.activity_log
    (company_id, actor_auth_user_id, actor_label, action, entity_type, entity_id, summary, metadata)
  values
    (p_company_id, v_actor, coalesce(v_actor_label, 'Sistem'), p_action, p_entity_type, p_entity_id, p_summary, p_metadata);
exception
  when others then
    raise warning 'log_activity failed (company_id=%, action=%): %', p_company_id, p_action, sqlerrm;
end;
$$;

-- company_profiles: doar actualizari cu schimbari reale ale campurilor
-- vizibile (nu si updated_at singur).
create or replace function public.log_company_profile_update() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_name is distinct from old.company_name
    or new.cui is distinct from old.cui
    or new.registration_number is distinct from old.registration_number
    or new.address is distinct from old.address
    or new.city is distinct from old.city
    or new.county is distinct from old.county
    or new.email is distinct from old.email
    or new.phone is distinct from old.phone
    or new.contact_person is distinct from old.contact_person
  then
    perform public.log_activity(
      new.id, 'company_profile', new.id, 'company_profile.updated',
      'A actualizat profilul companiei',
      jsonb_build_object('company_name', new.company_name)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_company_profile_updated on public.company_profiles;

create trigger on_company_profile_updated
  after update on public.company_profiles
  for each row execute function public.log_company_profile_update();

-- invoices: creare, stergere, si schimbarea statusului de plata.
create or replace function public.log_invoice_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    perform public.log_activity(
      new.company_id, 'invoice', new.id, 'invoice.created',
      'A adaugat factura ' || coalesce(new.invoice_number, ''),
      jsonb_build_object('invoice_number', new.invoice_number, 'payable_amount', new.payable_amount)
    );
    return new;
  elsif TG_OP = 'DELETE' then
    perform public.log_activity(
      old.company_id, 'invoice', old.id, 'invoice.deleted',
      'A sters factura ' || coalesce(old.invoice_number, ''),
      jsonb_build_object('invoice_number', old.invoice_number)
    );
    return old;
  elsif TG_OP = 'UPDATE' and new.payment_status is distinct from old.payment_status then
    perform public.log_activity(
      new.company_id, 'invoice', new.id, 'invoice.payment_status_changed',
      'A schimbat statusul de plata al facturii ' || coalesce(new.invoice_number, '') || ' in ' || coalesce(new.payment_status, ''),
      jsonb_build_object('invoice_number', new.invoice_number, 'payment_status', new.payment_status)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_invoice_change on public.invoices;

create trigger on_invoice_change
  after insert or update or delete on public.invoices
  for each row execute function public.log_invoice_change();

-- documents: upload.
create or replace function public.log_document_upload() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is not null then
    perform public.log_activity(
      new.company_id, 'document', new.id, 'document.uploaded',
      'A incarcat documentul ' || coalesce(new.file_name, ''),
      jsonb_build_object('file_name', new.file_name, 'document_type', new.document_type)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_document_uploaded on public.documents;

create trigger on_document_uploaded
  after insert on public.documents
  for each row execute function public.log_document_upload();

-- company_members: invitatie, schimbare de rol, revocare. Randul 'owner'
-- creat automat de handle_new_company_profile la inregistrare nu e logat
-- -- e un pas de sistem, nu o actiune de colaborare.
create or replace function public.log_company_member_change() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label text;
begin
  v_label := coalesce(new.invited_email, new.auth_user_id::text, 'membru');

  if TG_OP = 'INSERT' then
    if new.role = 'owner' then
      return new;
    end if;

    perform public.log_activity(
      new.company_id, 'company_member', new.id, 'member.invited',
      'A invitat ' || v_label || ' cu rolul ' || new.role,
      jsonb_build_object('role', new.role, 'invited_email', new.invited_email)
    );
  elsif TG_OP = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.log_activity(
        new.company_id, 'company_member', new.id,
        case when new.status = 'revoked' then 'member.removed' else 'member.status_changed' end,
        'Status pentru ' || v_label || ' schimbat in ' || new.status,
        jsonb_build_object('status', new.status)
      );
    elsif new.role is distinct from old.role then
      perform public.log_activity(
        new.company_id, 'company_member', new.id, 'member.role_changed',
        'Rol schimbat pentru ' || v_label || ' in ' || new.role,
        jsonb_build_object('role', new.role)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_company_member_change on public.company_members;

create trigger on_company_member_change
  after insert or update on public.company_members
  for each row execute function public.log_company_member_change();

-- Only triggers (running as the function owner) ever need to call these --
-- no client should call them directly via PostgREST's exposed /rpc/ API.
-- Without this, log_activity in particular would be directly callable via
-- /rest/v1/rpc/log_activity by any authenticated user with an arbitrary
-- company_id (the is_company_member() guard above is defense in depth on
-- top of this, not a substitute for it).
revoke execute on function public.log_activity(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.log_company_profile_update() from public, anon, authenticated;
revoke execute on function public.log_invoice_change() from public, anon, authenticated;
revoke execute on function public.log_document_upload() from public, anon, authenticated;
revoke execute on function public.log_company_member_change() from public, anon, authenticated;
