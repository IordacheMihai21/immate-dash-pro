create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'Administrator',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.company_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  company_name text,
  cui text,
  registration_number text,
  address text,
  city text,
  county text,
  email text,
  phone text,
  contact_person text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.app_users
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role text default 'Administrator',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.company_profiles
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists auth_user_id uuid references auth.users(id) on delete cascade,
  add column if not exists company_name text,
  add column if not exists cui text,
  add column if not exists registration_number text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists county text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists contact_person text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

update public.app_users
set id = gen_random_uuid()
where id is null;

update public.company_profiles
set id = gen_random_uuid()
where id is null;

alter table public.app_users
  alter column id set not null;

alter table public.company_profiles
  alter column id set not null;

create unique index if not exists app_users_auth_user_id_key
  on public.app_users (auth_user_id);

create unique index if not exists company_profiles_auth_user_id_key
  on public.company_profiles (auth_user_id);

create index if not exists company_profiles_cui_idx
  on public.company_profiles (cui);

alter table public.app_users enable row level security;
alter table public.company_profiles enable row level security;

drop policy if exists app_users_select_own on public.app_users;
drop policy if exists app_users_insert_own on public.app_users;
drop policy if exists app_users_update_own on public.app_users;

create policy app_users_select_own
  on public.app_users
  for select
  using (auth.uid() = auth_user_id);

create policy app_users_insert_own
  on public.app_users
  for insert
  with check (auth.uid() = auth_user_id);

create policy app_users_update_own
  on public.app_users
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

drop policy if exists company_profiles_select_own on public.company_profiles;
drop policy if exists company_profiles_insert_own on public.company_profiles;
drop policy if exists company_profiles_update_own on public.company_profiles;

create policy company_profiles_select_own
  on public.company_profiles
  for select
  using (auth.uid() = auth_user_id);

create policy company_profiles_insert_own
  on public.company_profiles
  for insert
  with check (auth.uid() = auth_user_id);

create policy company_profiles_update_own
  on public.company_profiles
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

do $$
begin
  if to_regclass('public.documents') is not null then
    execute 'alter table public.documents enable row level security';
    execute 'drop policy if exists documents_own_company on public.documents';
    execute $policy$
      create policy documents_own_company
        on public.documents
        for all
        using (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = documents.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = documents.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.suppliers') is not null then
    execute 'alter table public.suppliers enable row level security';
    execute 'drop policy if exists suppliers_own_company on public.suppliers';
    execute $policy$
      create policy suppliers_own_company
        on public.suppliers
        for all
        using (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = suppliers.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = suppliers.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.customers') is not null then
    execute 'alter table public.customers enable row level security';
    execute 'drop policy if exists customers_own_company on public.customers';
    execute $policy$
      create policy customers_own_company
        on public.customers
        for all
        using (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = customers.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = customers.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.invoices') is not null then
    execute 'alter table public.invoices enable row level security';
    execute 'drop policy if exists invoices_own_company on public.invoices';
    execute $policy$
      create policy invoices_own_company
        on public.invoices
        for all
        using (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = invoices.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = invoices.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.invoice_lines') is not null then
    execute 'alter table public.invoice_lines enable row level security';
    execute 'drop policy if exists invoice_lines_own_company on public.invoice_lines';
    execute $policy$
      create policy invoice_lines_own_company
        on public.invoice_lines
        for all
        using (
          exists (
            select 1
            from public.invoices i
            join public.company_profiles cp on cp.id = i.company_id
            where i.id = invoice_lines.invoice_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.invoices i
            join public.company_profiles cp on cp.id = i.company_id
            where i.id = invoice_lines.invoice_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.extracted_entities') is not null then
    execute 'alter table public.extracted_entities enable row level security';
    execute 'drop policy if exists extracted_entities_own_company on public.extracted_entities';
    execute $policy$
      create policy extracted_entities_own_company
        on public.extracted_entities
        for all
        using (
          exists (
            select 1
            from public.invoices i
            join public.company_profiles cp on cp.id = i.company_id
            where i.id = extracted_entities.invoice_id
              and cp.auth_user_id = auth.uid()
          )
          or exists (
            select 1
            from public.documents d
            join public.company_profiles cp on cp.id = d.company_id
            where d.id = extracted_entities.document_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.invoices i
            join public.company_profiles cp on cp.id = i.company_id
            where i.id = extracted_entities.invoice_id
              and cp.auth_user_id = auth.uid()
          )
          or exists (
            select 1
            from public.documents d
            join public.company_profiles cp on cp.id = d.company_id
            where d.id = extracted_entities.document_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.entity_relations') is not null then
    execute 'alter table public.entity_relations enable row level security';
    execute 'drop policy if exists entity_relations_own_company on public.entity_relations';
    execute $policy$
      create policy entity_relations_own_company
        on public.entity_relations
        for all
        using (
          exists (
            select 1
            from public.documents d
            join public.company_profiles cp on cp.id = d.company_id
            where d.id = entity_relations.document_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.documents d
            join public.company_profiles cp on cp.id = d.company_id
            where d.id = entity_relations.document_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.ai_model_training_runs') is not null then
    execute 'alter table public.ai_model_training_runs enable row level security';
    execute 'drop policy if exists ai_training_runs_own_company on public.ai_model_training_runs';
    execute $policy$
      create policy ai_training_runs_own_company
        on public.ai_model_training_runs
        for all
        using (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = ai_model_training_runs.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = ai_model_training_runs.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;

  if to_regclass('public.prediction_results') is not null then
    execute 'alter table public.prediction_results enable row level security';
    execute 'drop policy if exists prediction_results_own_company on public.prediction_results';
    execute $policy$
      create policy prediction_results_own_company
        on public.prediction_results
        for all
        using (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = prediction_results.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
        with check (
          exists (
            select 1
            from public.company_profiles cp
            where cp.id = prediction_results.company_id
              and cp.auth_user_id = auth.uid()
          )
        )
    $policy$;
  end if;
end $$;
