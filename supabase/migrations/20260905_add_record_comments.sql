-- Discutii per inregistrare (factura, si extensibil pe viitor la documente
-- etc via entity_type) -- spatiul real de colaborare firma-contabil pe care
-- PRODUCT.md il revendica deja ca diferentiator, dar care pana acum nu
-- exista concret: rolul "Contabil" avea doar acces la citire, fara niciun
-- loc unde sa puna o intrebare legata de o factura anume.
--
-- Spre deosebire de activity_log/subscriptions, comentariile SUNT continut
-- scris direct de utilizator, deci au o policy normala de INSERT (nu doar
-- prin trigger SECURITY DEFINER) -- dar autorul si eticheta lui sunt
-- stabilite server-side de un trigger BEFORE INSERT, nu trimise de client,
-- ca nimeni sa nu poata posta un comentariu in numele altcuiva.

create table public.record_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  author_auth_user_id uuid references auth.users(id) on delete set null,
  author_label text not null default '',
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index record_comments_entity_idx
  on public.record_comments (company_id, entity_type, entity_id, created_at);

alter table public.record_comments enable row level security;

-- Rolul "vizualizator" e intentionat doar-citire in restul aplicatiei
-- (companyMembersService.ts) -- la fel si aici: poate citi discutia, dar nu
-- poate posta. owner/admin/contabil pot amandoua.
create or replace function public.is_company_contributor(target_company_id uuid)
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
      and role in ('owner', 'admin', 'contabil')
  );
$$;

create policy record_comments_select_members
  on public.record_comments
  for select
  using (is_company_member(company_id));

create policy record_comments_insert_contributors
  on public.record_comments
  for insert
  with check (is_company_contributor(company_id));

-- Fiecare isi poate sterge propriul comentariu (nu editare -- repostarea e
-- suficienta pentru o corectie, tine implementarea simpla).
create policy record_comments_delete_own
  on public.record_comments
  for delete
  using (author_auth_user_id = auth.uid());

create or replace function public.set_record_comment_author() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_label text;
begin
  select coalesce(nullif(trim(au.full_name), ''), au.email)
  into v_actor_label
  from public.app_users au
  where au.auth_user_id = v_actor;

  new.author_auth_user_id := v_actor;
  new.author_label := coalesce(v_actor_label, 'Utilizator IMMapp');
  return new;
end;
$$;

drop trigger if exists on_record_comment_insert on public.record_comments;

create trigger on_record_comment_insert
  before insert on public.record_comments
  for each row execute function public.set_record_comment_author();

revoke execute on function public.set_record_comment_author() from public, anon, authenticated;
