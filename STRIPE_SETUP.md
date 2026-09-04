# Activarea facturarii (Stripe)

Tot codul e scris si testat cat s-a putut fara un cont real (vezi mai jos
"Ce am putut verifica"). Ramane doar configurarea din Stripe Dashboard si
completarea `.env`. Pasii de mai jos folosesc **test mode** -- niciun card
real nu e taxat pana nu comuti explicit pe live mode in Stripe.

## 1. Cont Stripe

Creeaza un cont pe [stripe.com](https://stripe.com) (necesita detalii firma
si cont bancar pentru payouts, dar acelea pot fi completate mai tarziu --
test mode functioneaza imediat dupa inregistrare, fara ele).

## 2. Produse si preturi

In Stripe Dashboard (test mode activ, comutator sus-dreapta) -> **Product
catalog** -> **+ Add product**, de doua ori:

- **Business** -- adauga doua preturi recurente: unul lunar (124 RON) si
  unul anual (1.240 RON, echivalent cu ~17% reducere fata de 12 luni la
  pret lunar -- ajusteaza dupa cum vrei sa arate reducerea reala).
- **Companie** -- la fel, lunar (291 RON) si anual (2.910 RON).

Dupa ce salvezi fiecare pret, Stripe iti arata un ID de forma `price_...`.
Copiaza toate cele patru in `.env`:

```
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_ANNUAL=price_...
STRIPE_PRICE_COMPANIE_MONTHLY=price_...
STRIPE_PRICE_COMPANIE_ANNUAL=price_...
```

## 3. Chei API

**Developers -> API keys** -> copiaza **Secret key** (test mode,
`sk_test_...`) in `.env` ca `STRIPE_SECRET_KEY`.

## 4. Webhook

**Developers -> Webhooks -> Add endpoint.**

- **Local (dezvoltare):** foloseste Stripe CLI in loc de un URL public --
  `stripe listen --forward-to localhost:8082/api/webhooks/stripe`. Comanda
  iti da un `whsec_...` pe care il pui in `.env` ca `STRIPE_WEBHOOK_SECRET`.
- **Productie:** endpoint URL = `https://domeniul-tau.ro/api/webhooks/stripe`.
  Selecteaza evenimentele: `checkout.session.completed`,
  `customer.subscription.updated`, `customer.subscription.deleted`. Dupa ce
  salvezi endpoint-ul, Stripe iti arata **Signing secret** -- acela merge in
  `STRIPE_WEBHOOK_SECRET` pe mediul de productie.

## 5. Customer Portal

**Settings -> Billing -> Customer portal.** Activeaza-l. Pentru inceput,
**dezactiveaza** optiunea de schimbare a planului direct din portal ("Allow
customers to switch plans") -- codul actual nu recunoaste inca o schimbare
de plan facuta din portal (doar cele facute prin checkout-ul din aplicatie).
Poti lasa active: actualizare card, anulare abonament, facturi trecute.

## 6. Restul `.env`

```
SUPABASE_URL=<acelasi ca VITE_SUPABASE_URL>
SUPABASE_ANON_KEY=<acelasi ca VITE_SUPABASE_ANON_KEY>
SUPABASE_SERVICE_ROLE_KEY=<Supabase Studio -> Project Settings -> API -> service_role>
APP_BASE_URL=http://localhost:8082
```

`SUPABASE_SERVICE_ROLE_KEY` ocoleste complet RLS -- e folosita doar de
webhook-ul Stripe, niciodata trimisa catre client. Un leak al acestei chei
inseamna acces total la toate datele tuturor companiilor.

## 7. Testare (inainte sa consideri asta gata)

Cu `stripe listen` rulat intr-un terminal si `npm run dev` in altul:

```bash
stripe trigger checkout.session.completed
```

Verifica in Supabase (tabelul `subscriptions`) ca randul companiei tale
s-a actualizat. Apoi testeaza fluxul real din aplicatie: `/app/setari/facturare`
-> alege un plan -> card de test `4242 4242 4242 4242`, orice data viitoare,
orice CVC -> confirma ca revii pe pagina cu planul actualizat.

Testeaza si anularea: din `/app/setari/facturare` -> "Gestioneaza
abonamentul" -> anuleaza -> confirma ca planul revine la "Start" dupa ce
webhook-ul `customer.subscription.deleted` ajunge.

## Ce am putut verifica fara cont Stripe

- Toata plomberia client -> server function -> guard-ul `STRIPE_SECRET_KEY`
  functioneaza corect end-to-end (verificat live: butonul de upgrade trimite
  cererea, primeste eroarea clara asteptata, arata un toast -- nu se blocheaza).
- Migratia bazei de date (tabelul `subscriptions`, RLS, trigger-ul de
  bootstrap) -- testata intr-o tranzactie cu rollback si aplicata live.
- Pagina de facturare afiseaza corect planul real al companiei.

## Ce NU e inca verificat (motiv real, nu presupunere)

- Formatul exact al campului `current_period_end` pe obiectul Stripe
  Subscription difera intre versiuni de API (a fost mutat pe subscription
  items in versiuni recente). Codul incearca ambele forme, dar care dintre
  ele chiar se potriveste contului tau nu poate fi confirmat fara un
  eveniment real -- verifica dupa primul `checkout.session.completed`.
- Comportamentul exact al `customer.subscription.updated` la schimbari de
  plan facute din Customer Portal (motiv pentru care e recomandat sa
  dezactivezi acea optiune la pasul 5, cel putin pana se adauga suport
  explicit pentru ea).
