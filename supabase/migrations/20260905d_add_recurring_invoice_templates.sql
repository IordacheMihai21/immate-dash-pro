-- Sabloane de facturi recurente (contabilitate lunara, chirii etc.). Generarea
-- efectiva a facturii ramane un apel client catre createManualInvoice() (deja
-- singurul loc care stie sa creeze corect un document + furnizor + client +
-- factura + linii), declansat manual din UI ("Genereaza acum"). Nu exista
-- inca un job programat (pg_cron) care sa apeleze automat generarea, pentru
-- ca ar insemna fie reimplementarea logicii de creare a facturii in SQL
-- (risc real de divergenta fata de singura sursa de adevar din TypeScript),
-- fie un apel HTTP catre un mediu de dezvoltare local, inaccesibil din
-- Postgres-ul gazduit. next_run_date ramane vizibil in UI ca reminder real.

create table public.recurring_invoice_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company_profiles(id) on delete cascade,
  template_name text not null,
  customer_name text not null,
  customer_cui text not null default '',
  customer_address text not null default '',
  customer_city text not null default '',
  customer_country text not null default 'RO',
  description text not null,
  quantity numeric not null default 1,
  unit_code text not null default 'buc',
  unit_price numeric not null,
  currency text not null default 'RON',
  vat_rate_percent numeric not null default 19,
  due_days integer not null default 30,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_date date not null,
  active boolean not null default true,
  last_generated_at timestamptz,
  last_generated_invoice_id uuid references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recurring_invoice_templates enable row level security;

create policy recurring_invoice_templates_select_members
  on public.recurring_invoice_templates
  for select
  using (is_company_member(company_id));

create policy recurring_invoice_templates_insert_contributors
  on public.recurring_invoice_templates
  for insert
  with check (is_company_contributor(company_id));

create policy recurring_invoice_templates_update_contributors
  on public.recurring_invoice_templates
  for update
  using (is_company_contributor(company_id))
  with check (is_company_contributor(company_id));

create policy recurring_invoice_templates_delete_contributors
  on public.recurring_invoice_templates
  for delete
  using (is_company_contributor(company_id));
