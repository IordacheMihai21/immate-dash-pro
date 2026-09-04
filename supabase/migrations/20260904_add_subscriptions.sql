-- Abonament Stripe per companie. Scriere exclusiv de la server (webhook-ul
-- Stripe si server function-urile de checkout), niciodata direct din client
-- -- altfel orice utilizator si-ar putea seta singur planul la "companie"
-- fara sa plateasca. Nu exista nicio policy de INSERT/UPDATE/DELETE pentru
-- utilizatori normali, la fel ca la activity_log.

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.company_profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'start' check (plan in ('start', 'business', 'companie')),
  billing_cycle text check (billing_cycle in ('monthly', 'annual')),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid')),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_stripe_customer_idx on public.subscriptions (stripe_customer_id);

alter table public.subscriptions enable row level security;

create policy subscriptions_select_members
  on public.subscriptions
  for select
  using (is_company_member(company_id));

-- Fiecare companie porneste pe planul gratuit "start" fara sa fie nevoie
-- de niciun eveniment Stripe -- randul e creat de acelasi trigger care
-- deja bootstrap-eaza compania la inregistrare.
create or replace function public.handle_new_company_subscription() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (company_id, plan, status)
  values (new.id, 'start', 'active')
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_company_profile_created_subscription on public.company_profiles;

create trigger on_company_profile_created_subscription
  after insert on public.company_profiles
  for each row execute function public.handle_new_company_subscription();

revoke execute on function public.handle_new_company_subscription() from public, anon, authenticated;

-- Backfill: companiile existente, create inainte de acest trigger, primesc
-- si ele un rand de abonament pe planul gratuit.
insert into public.subscriptions (company_id, plan, status)
select id, 'start', 'active' from public.company_profiles
on conflict (company_id) do nothing;
