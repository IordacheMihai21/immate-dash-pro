-- URGENT: inchide o scurgere de date reala. Testele de azi au aratat ca
-- cheia publica "anon" (aceeasi care ruleaza in orice browser ce incarca
-- aplicatia) putea citi date din toate companiile -- inclusiv
-- app_users.email, company_profiles, customers, suppliers, invoice_lines
-- si chiar extracted_entities (desi RLS-ul acesteia a fost rescris azi).
--
-- Cauza: pe langa policy-urile "corecte" (create in migrarile anterioare),
-- exista cel putin o policy veche, ramasa probabil dintr-o sesiune manuala
-- de debugging in Supabase Studio, permisiva pentru oricine (de tipul
-- "Enable read access for all users" / using (true)). RLS combina toate
-- policy-urile permisive pentru o comanda prin OR -- o singura policy
-- permisiva e suficienta ca sa anuleze toate celelalte, oricat de corect
-- sunt scrise.
--
-- Fix: sterge dinamic *toate* policy-urile existente pe tabelele afectate
-- (nu ghicim nume), apoi le recream exact pe cele corecte. Nu presupunem
-- ce nume avea policy-ul gresit -- il eliminam indiferent de nume.

do $$
declare
  affected_table text;
  policy_record record;
begin
  foreach affected_table in array array[
    'company_profiles',
    'app_users',
    'documents',
    'suppliers',
    'customers',
    'invoices',
    'invoice_lines',
    'extracted_entities',
    'entity_relations',
    'ai_model_training_runs',
    'prediction_results',
    'document_ai_corrections',
    'company_members'
  ]
  loop
    if to_regclass('public.' || affected_table) is not null then
      execute format('alter table public.%I enable row level security', affected_table);

      for policy_record in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = affected_table
      loop
        execute format('drop policy if exists %I on public.%I', policy_record.policyname, affected_table);
      end loop;
    end if;
  end loop;
end $$;

-- Recreeaza policy-urile corecte (identice cu cele din migrarile
-- anterioare -- logica nu s-a schimbat, doar ne asiguram ca sunt
-- singurele policy-uri active pe tabel).

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

create policy documents_own_company
  on public.documents
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));

create policy suppliers_own_company
  on public.suppliers
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));

create policy customers_own_company
  on public.customers
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));

create policy invoices_own_company
  on public.invoices
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));

create policy ai_training_runs_own_company
  on public.ai_model_training_runs
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));

create policy prediction_results_own_company
  on public.prediction_results
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));

create policy document_ai_corrections_own_company
  on public.document_ai_corrections
  for all
  using (is_company_member(company_id))
  with check (is_company_member(company_id));

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
  );

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
  );

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
  );

create policy company_members_select
  on public.company_members
  for select
  using (is_company_member(company_id));

create policy company_members_select_own_invite
  on public.company_members
  for select
  using (
    status = 'invited'
    and auth_user_id is null
    and invited_email is not null
    and lower(invited_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

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
