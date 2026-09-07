-- URGENT: elimina o scurgere reala de date catre orice utilizator anonim.
--
-- Descoperit intr-un audit de securitate pre-lansare: tabelele `companies`
-- si `financial_indicators` aveau policy-uri ramase dintr-o faza demo
-- timpurie ("demo_access_companies" / "demo_access_financial_indicators"),
-- cu `using (true)` / `with_check (true)` pentru rolul `anon` -- adica
-- ORICINE, fara autentificare, putea citi/scrie/sterge orice rand din
-- aceste tabele. Confirmat live prin curl neautentificat (citire + scriere
-- reusite, HTTP 200/201), inainte de acest fix.
--
-- Ambele tabele s-au dovedit complet neconectate la aplicatia curenta
-- (zero referinte in frontend sau in backend-ul Python) -- ramasite dintr-o
-- arhitectura anterioara inlocuita ulterior de calculul on-the-fly din
-- dashboardService.ts. `companies` si `financial_indicators` nu mai sunt
-- folosite de niciun cod viu, deci acces implicit (fara nicio policy) e
-- corect -- daca vor fi reactivate vreodata, au nevoie de RLS proiectat
-- constient, nu mostenit dintr-o policy de demo.
--
-- `prediction_results` si `ai_model_training_runs` (care refera
-- companies.id, nu company_profiles.id, ca foreign key) au deja RLS corect
-- structurat (is_company_member), dar sunt in practica inaccesibile oricui
-- pentru ca is_company_member() verifica impotriva company_members.company_id,
-- care e mereu un company_profiles.id -- niciodata nu poate coincide cu un
-- companies.id real. Raman neatinse -- esueaza deja inchis (fail-closed),
-- nu reprezinta o scurgere, doar date orfane dintr-o migrare veche.

drop policy if exists demo_access_companies on public.companies;
drop policy if exists demo_access_financial_indicators on public.financial_indicators;
