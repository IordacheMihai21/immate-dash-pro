-- Consistenta cu restul functiilor trigger SECURITY DEFINER din schema
-- (handle_new_company_preferences, handle_new_company_subscription,
-- log_*): revoca EXECUTE pentru anon/authenticated pe handle_new_company_profile.
--
-- Nu era o vulnerabilitate reala -- Postgres refuza sa apeleze o functie
-- "returns trigger" in afara unui context de trigger (NEW/OLD nu exista),
-- deci /rest/v1/rpc/handle_new_company_profile ar fi esuat oricum. E totusi
-- singura functie trigger din schema fara acest revoke explicit -- inchisa
-- acum pentru aparare in profunzime, nu doar protectie incidentala.

revoke execute on function public.handle_new_company_profile() from public, anon, authenticated;
