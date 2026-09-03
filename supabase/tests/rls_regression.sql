-- RLS regression check for multi-tenant isolation and the write paths that
-- have actually broken in production before:
--   1) 2026-07-25: a stray permissive policy let the anon key read every
--      company's data (see 20260725b_urgent_fix_public_data_exposure.sql).
--   2) 2026-09-02: upsertCompanyProfile()'s INSERT ... ON CONFLICT DO UPDATE
--      required BOTH the INSERT and UPDATE policies' WITH CHECK to pass
--      simultaneously, which Postgres does not guarantee even when each
--      passes alone -- it silently rejected every save (see companyService.ts
--      fix, "Repara salvarea profilului companiei").
--
-- This script creates two throwaway users + companies, exercises the real
-- application write pattern (select-then-insert-or-update, not upsert), and
-- asserts cross-company reads/writes are denied. Everything runs inside one
-- transaction that is always rolled back -- safe to run anytime, including
-- against production, and requires no cleanup.
--
-- How to run: paste into the Supabase SQL editor and execute, or ask Claude
-- to run it via the Supabase MCP execute_sql tool. A clean run prints
-- "RLS REGRESSION CHECK: all N assertions passed." and rolls back. Any
-- failure raises an exception naming exactly which guarantee broke.

begin;

create or replace function pg_temp.as_user(user_id uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$ language sql;

create or replace function pg_temp.assert(condition boolean, message text) returns void as $$
begin
  if not condition then
    raise exception 'RLS REGRESSION: %', message;
  end if;
end;
$$ language plpgsql;

-- Fixtures -------------------------------------------------------------
reset role;

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-aaaa-4aaa-8aaa-000000000a01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-regression-a@example.invalid'),
  ('00000000-bbbb-4bbb-8bbb-000000000b01', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-regression-b@example.invalid');

-- Test 1: a user can create their own company profile via a plain INSERT
-- (the app's real code path after today's fix -- never ON CONFLICT DO UPDATE).
set local role authenticated;
select pg_temp.as_user('00000000-aaaa-4aaa-8aaa-000000000a01');

insert into public.company_profiles
  (auth_user_id, company_name, cui, registration_number, address, city, county, email, phone, contact_person)
values
  ('00000000-aaaa-4aaa-8aaa-000000000a01', 'RLS Regression Co A', 'RO00000001', '', '', '', '', '', '', '');

reset role;
select pg_temp.as_user('00000000-bbbb-4bbb-8bbb-000000000b01');
set local role authenticated;

insert into public.company_profiles
  (auth_user_id, company_name, cui, registration_number, address, city, county, email, phone, contact_person)
values
  ('00000000-bbbb-4bbb-8bbb-000000000b01', 'RLS Regression Co B', 'RO00000002', '', '', '', '', '', '', '');

reset role;

do $$
declare
  company_a uuid;
  company_b uuid;
  visible_count int;
begin
  select id into company_a from public.company_profiles where auth_user_id = '00000000-aaaa-4aaa-8aaa-000000000a01';
  select id into company_b from public.company_profiles where auth_user_id = '00000000-bbbb-4bbb-8bbb-000000000b01';

  perform pg_temp.assert(company_a is not null, 'user A insert of their own company_profiles row did not succeed');
  perform pg_temp.assert(company_b is not null, 'user B insert of their own company_profiles row did not succeed');

  -- The trigger that bootstraps the owner's company_members row must have fired.
  perform pg_temp.assert(
    exists (select 1 from public.company_members where company_id = company_a and auth_user_id = '00000000-aaaa-4aaa-8aaa-000000000a01' and role = 'owner' and status = 'active'),
    'handle_new_company_profile trigger did not create an active owner membership for user A'
  );

  -- Test 2 (the fix from 2026-09-02): the app's real update path -- a plain
  -- UPDATE, never ON CONFLICT DO UPDATE -- must still work for the owner.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-4aaa-8aaa-000000000a01', 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.company_profiles set company_name = 'RLS Regression Co A (renamed)' where auth_user_id = '00000000-aaaa-4aaa-8aaa-000000000a01';
  get diagnostics visible_count = row_count;
  perform pg_temp.assert(visible_count = 1, 'owner could not update their own company_profiles row (regression of the 2026-09-02 upsert/RLS fix)');

  select count(*) into visible_count from public.company_profiles where id = company_b;
  perform pg_temp.assert(visible_count = 0, 'user A can see company B''s profile -- cross-company read leak (regression of the 2026-07-25 anon-key leak class)');

  update public.company_profiles set company_name = 'hijacked' where id = company_b;
  get diagnostics visible_count = row_count;
  perform pg_temp.assert(visible_count = 0, 'user A was able to update company B''s profile -- cross-company write');

  reset role;

  -- Test 3: same isolation guarantee on a company-scoped table (documents),
  -- representative of the shared is_company_member() policy used by
  -- documents/suppliers/customers/invoices/document_ai_corrections/etc.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-aaaa-4aaa-8aaa-000000000a01', 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.documents (company_id, file_name, file_type, document_type, original_content)
  values (company_a, 'rls-regression.pdf', 'pdf', 'invoice', 'rls-regression-placeholder');

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-bbbb-4bbb-8bbb-000000000b01', 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into visible_count from public.documents where company_id = company_a;
  perform pg_temp.assert(visible_count = 0, 'user B can see company A''s documents -- cross-company read leak on documents');

  reset role;

  raise notice 'RLS REGRESSION CHECK: all assertions passed.';
end $$;

rollback;
