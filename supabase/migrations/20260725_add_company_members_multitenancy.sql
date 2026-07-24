-- Multi-tenancy: o companie poate avea mai multi utilizatori cu roluri,
-- nu doar un singur auth_user_id proprietar.

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete cascade,
  invited_email text,
  role text not null check (role in ('owner', 'admin', 'contabil', 'vizualizator')),
  status text not null default 'active' check (status in ('active', 'invited', 'revoked')),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_members_identity_check check (
    auth_user_id is not null or invited_email is not null
  )
);

create unique index if not exists company_members_company_user_key
  on public.company_members (company_id, auth_user_id)
  where auth_user_id is not null;

create unique index if not exists company_members_company_invited_email_key
  on public.company_members (company_id, lower(invited_email))
  where invited_email is not null and status = 'invited';

create index if not exists company_members_company_idx
  on public.company_members (company_id);

create index if not exists company_members_auth_user_idx
  on public.company_members (auth_user_id);

-- Backfill: fiecare companie existenta primeste proprietarul ei curent
-- ca membru cu rol 'owner', ca sa nu piarda nimeni accesul la migrare.
insert into public.company_members (company_id, auth_user_id, role, status)
select id, auth_user_id, 'owner', 'active'
from public.company_profiles
where auth_user_id is not null
on conflict (company_id, auth_user_id) where auth_user_id is not null do nothing;

-- Functii helper (SECURITY DEFINER) folosite in RLS, ca sa evitam
-- recursia unei policy pe company_members care interogheaza company_members.
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = target_company_id
      and auth_user_id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.company_members
    where company_id = target_company_id
      and auth_user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'admin')
  );
$$;

-- La crearea unei companii, cel care a creat-o devine automat 'owner'.
create or replace function public.handle_new_company_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_user_id is not null then
    insert into public.company_members (company_id, auth_user_id, role, status)
    values (new.id, new.auth_user_id, 'owner', 'active')
    on conflict (company_id, auth_user_id) where auth_user_id is not null do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_company_profile_created on public.company_profiles;

create trigger on_company_profile_created
  after insert on public.company_profiles
  for each row execute function public.handle_new_company_profile();

alter table public.company_members enable row level security;

drop policy if exists company_members_select on public.company_members;
drop policy if exists company_members_insert on public.company_members;
drop policy if exists company_members_update on public.company_members;
drop policy if exists company_members_delete on public.company_members;

create policy company_members_select
  on public.company_members
  for select
  using (is_company_member(company_id));

create policy company_members_insert
  on public.company_members
  for insert
  with check (is_company_admin(company_id));

create policy company_members_update
  on public.company_members
  for update
  using (is_company_admin(company_id))
  with check (is_company_admin(company_id));

create policy company_members_delete
  on public.company_members
  for delete
  using (is_company_admin(company_id));

-- company_profiles: de la "doar proprietarul unic" la "orice membru activ
-- poate vedea, doar owner/admin pot edita".
drop policy if exists company_profiles_select_own on public.company_profiles;
drop policy if exists company_profiles_insert_own on public.company_profiles;
drop policy if exists company_profiles_update_own on public.company_profiles;

create policy company_profiles_select_members
  on public.company_profiles
  for select
  using (is_company_member(id));

create policy company_profiles_insert_own
  on public.company_profiles
  for insert
  with check (auth.uid() = auth_user_id);

create policy company_profiles_update_admins
  on public.company_profiles
  for update
  using (is_company_admin(id))
  with check (is_company_admin(id));

-- Rescrie RLS-ul tabelelor company-scoped sa foloseasca is_company_member()
-- in loc de join-ul direct pe company_profiles.auth_user_id.
do $$
begin
  if to_regclass('public.documents') is not null then
    execute 'drop policy if exists documents_own_company on public.documents';
    execute 'create policy documents_own_company on public.documents for all using (is_company_member(company_id)) with check (is_company_member(company_id))';
  end if;

  if to_regclass('public.suppliers') is not null then
    execute 'drop policy if exists suppliers_own_company on public.suppliers';
    execute 'create policy suppliers_own_company on public.suppliers for all using (is_company_member(company_id)) with check (is_company_member(company_id))';
  end if;

  if to_regclass('public.customers') is not null then
    execute 'drop policy if exists customers_own_company on public.customers';
    execute 'create policy customers_own_company on public.customers for all using (is_company_member(company_id)) with check (is_company_member(company_id))';
  end if;

  if to_regclass('public.invoices') is not null then
    execute 'drop policy if exists invoices_own_company on public.invoices';
    execute 'create policy invoices_own_company on public.invoices for all using (is_company_member(company_id)) with check (is_company_member(company_id))';
  end if;

  if to_regclass('public.ai_model_training_runs') is not null then
    execute 'drop policy if exists ai_training_runs_own_company on public.ai_model_training_runs';
    execute 'create policy ai_training_runs_own_company on public.ai_model_training_runs for all using (is_company_member(company_id)) with check (is_company_member(company_id))';
  end if;

  if to_regclass('public.prediction_results') is not null then
    execute 'drop policy if exists prediction_results_own_company on public.prediction_results';
    execute 'create policy prediction_results_own_company on public.prediction_results for all using (is_company_member(company_id)) with check (is_company_member(company_id))';
  end if;

  if to_regclass('public.document_ai_corrections') is not null then
    execute 'drop policy if exists document_ai_corrections_own_company on public.document_ai_corrections';
    execute 'create policy document_ai_corrections_own_company on public.document_ai_corrections for all using (is_company_member(company_id)) with check (is_company_member(company_id))';
  end if;

  if to_regclass('public.invoice_lines') is not null then
    execute 'drop policy if exists invoice_lines_own_company on public.invoice_lines';
    execute $policy$
      create policy invoice_lines_own_company
        on public.invoice_lines
        for all
        using (
          exists (
            select 1 from public.invoices i
            where i.id = invoice_lines.invoice_id
              and is_company_member(i.company_id)
          )
        )
        with check (
          exists (
            select 1 from public.invoices i
            where i.id = invoice_lines.invoice_id
              and is_company_member(i.company_id)
          )
        )
    $policy$;
  end if;

  if to_regclass('public.extracted_entities') is not null then
    execute 'drop policy if exists extracted_entities_own_company on public.extracted_entities';
    execute $policy$
      create policy extracted_entities_own_company
        on public.extracted_entities
        for all
        using (
          exists (
            select 1 from public.invoices i
            where i.id = extracted_entities.invoice_id
              and is_company_member(i.company_id)
          )
          or exists (
            select 1 from public.documents d
            where d.id = extracted_entities.document_id
              and is_company_member(d.company_id)
          )
        )
        with check (
          exists (
            select 1 from public.invoices i
            where i.id = extracted_entities.invoice_id
              and is_company_member(i.company_id)
          )
          or exists (
            select 1 from public.documents d
            where d.id = extracted_entities.document_id
              and is_company_member(d.company_id)
          )
        )
    $policy$;
  end if;

  if to_regclass('public.entity_relations') is not null then
    execute 'drop policy if exists entity_relations_own_company on public.entity_relations';
    execute $policy$
      create policy entity_relations_own_company
        on public.entity_relations
        for all
        using (
          exists (
            select 1 from public.documents d
            where d.id = entity_relations.document_id
              and is_company_member(d.company_id)
          )
        )
        with check (
          exists (
            select 1 from public.documents d
            where d.id = entity_relations.document_id
              and is_company_member(d.company_id)
          )
        )
    $policy$;
  end if;
end $$;
