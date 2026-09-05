-- Adauga o categorie noua de notificare in company_preferences pentru
-- facturile restante, in completarea celor existente (document/forecast/risc).
-- Coloana e nullable-safe prin default true, deci companiile existente
-- primesc automat notificarea activata, la fel ca celelalte categorii.

alter table public.company_preferences
  add column payment_notifications boolean not null default true;
