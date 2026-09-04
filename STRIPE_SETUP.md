# Activarea facturarii (Stripe)

Verificat live end-to-end pe 2026-09-04, cu un cont Stripe real (sandbox,
test mode): checkout real (card de test 4242...4242), webhook real primit
prin `stripe listen`, portal de facturare real, anulare reala. Doua
probleme reale au fost gasite in acest proces si reparate -- vezi "Ce a
iesit la iveala din testarea reala" mai jos. Pasii de mai jos folosesc
**test mode** -- niciun card real nu e taxat pana nu comuti explicit pe
live mode in Stripe.

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

Anularea din portal **e verificata live** (vezi mai jos) si functioneaza
corect.

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

## Ce a iesit la iveala din testarea reala (2026-09-04)

Doua probleme reale, care nu puteau fi gasite fara un cont Stripe adevarat:

- **Managed Payments**: checkout-ul esua cu "product tax code is missing"
  -- Stripe activeaza implicit Managed Payments (colecteaza si remite taxe
  ca merchant of record), ceea ce cere un `tax_code` pe fiecare produs.
  IMMapp raporteaza deja TVA-ul singur (Rapoarte > TVA), asa ca dublarea ar
  fi fost gresita. Rezolvat in cod (`managed_payments: { enabled: false }`
  in `billing.functions.ts`) -- nu mai e nimic de configurat in dashboard
  pentru asta.
- **`cancel_at_period_end`**: dupa o anulare reala din Customer Portal,
  campul `cancel_at_period_end` din baza de date ramanea `false`, desi
  portalul arata clar "Cancels ...". Cauza: pe versiunea de API
  `2026-08-26.dahlia`, Stripe seteaza `cancel_at` (un timestamp), nu
  boolean-ul legacy `cancel_at_period_end`. Reparat in webhook -- acum
  verifica ambele campuri.

## Ce e verificat live (2026-09-04, cont Stripe real, test mode)

- Checkout complet, cu card de test real (4242 4242 4242 4242) --
  `checkout.session.completed` primit si procesat corect prin webhook.
- `current_period_end`: confirmat ca soseste corect la nivelul de top al
  obiectului Subscription pe versiunea de API `2026-08-26.dahlia` (randul
  din baza de date a aparut cu timestamp-ul corect, la un an distanta).
- `customer.subscription.updated`, inclusiv anularea (cancel-at-period-end)
  facuta din Customer Portal real -- confirmata dupa fix-ul de mai sus.
- Portalul de facturare (buton "Gestioneaza abonamentul") deschide sesiunea
  reala Stripe si revine corect in aplicatie.
- Plomberia client -> server function -> guard-ul `STRIPE_SECRET_KEY`.
- Migratia bazei de date (tabelul `subscriptions`, RLS, trigger-ul de
  bootstrap).
- Pagina de facturare afiseaza corect planul real al companiei.

## Ce NU e inca verificat (motiv real, nu presupunere)

- `customer.subscription.deleted` (anulare imediata / necesta programata) --
  testarea reala a acoperit doar fluxul de anulare programata (cancel at
  period end) din Customer Portal, nu o anulare imediata.
- Comportamentul exact al `customer.subscription.updated` la schimbari de
  plan facute din Customer Portal (motiv pentru care e recomandat sa
  dezactivezi acea optiune la pasul 5, cel putin pana se adauga suport
  explicit pentru ea).
