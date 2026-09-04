-- Preferinte per companie (notificari, afisare metrici tehnice). Spre
-- deosebire de activity_log/subscriptions, astea NU sunt date sensibile de
-- audit/billing -- sunt setari de UI pe care un proprietar/admin trebuie sa
-- le poata schimba direct din client, deci au policy normala de INSERT/UPDATE
-- (nu doar prin trigger SECURITY DEFINER).

create table public.company_preferences (
  company_id uuid primary key references public.company_profiles(id) on delete cascade,
  document_notifications boolean not null default true,
  forecast_notifications boolean not null default true,
  risk_notifications boolean not null default true,
  show_technical_metrics boolean not null default false,
  table_density text not null default 'comfortable' check (table_density in ('comfortable', 'compact')),
  updated_at timestamptz not null default now()
);

alter table public.company_preferences enable row level security;

create policy company_preferences_select_members
  on public.company_preferences
  for select
  using (is_company_member(company_id));

-- Doar owner/admin schimba setarile companiei, la fel ca la facturare.
create policy company_preferences_insert_admins
  on public.company_preferences
  for insert
  with check (is_company_admin(company_id));

create policy company_preferences_update_admins
  on public.company_preferences
  for update
  using (is_company_admin(company_id))
  with check (is_company_admin(company_id));

-- Fiecare companie porneste cu preferinte implicite, creat de acelasi
-- trigger care bootstrap-eaza deja compania la inregistrare (acelasi tipar
-- ca la subscriptions).
create or replace function public.handle_new_company_preferences() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_preferences (company_id)
  values (new.id)
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_company_profile_created_preferences on public.company_profiles;

create trigger on_company_profile_created_preferences
  after insert on public.company_profiles
  for each row execute function public.handle_new_company_preferences();

revoke execute on function public.handle_new_company_preferences() from public, anon, authenticated;

-- Backfill: companiile existente primesc si ele un rand cu valorile implicite.
insert into public.company_preferences (company_id)
select id from public.company_profiles
on conflict (company_id) do nothing;
