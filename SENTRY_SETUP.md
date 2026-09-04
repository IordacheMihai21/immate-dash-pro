# Activarea monitorizarii erorilor (Sentry)

## 1. Cont si DSN

1. Creeaza un cont pe [sentry.io](https://sentry.io/signup/) (planul gratuit
   acopera confortabil un proiect ca acesta).
2. Creeaza un proiect nou, platforma **React**.
3. Sentry iti arata un **DSN** de forma
   `https://xxxxx@xxxxx.ingest.us.sentry.io/xxxxx`.
4. Pune-l in `.env`:

   ```
   VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.us.sentry.io/xxxxx
   ```

5. Reporneste `npm run dev`. Gata -- erorile client-side ajung acum in
   Sentry (verifica in tabul Issues din proiectul tau dupa ce declansezi
   o eroare, de exemplu navigand pe o ruta care arunca intentionat).

Un DSN nu e un secret in sensul clasic (e menit sa fie inclus in codul
livrat browserului), dar tot merge in `.env`, nu hardcodat in cod, ca sa
poti avea proiecte Sentry diferite per mediu (dev/staging/productie) fara
sa umbli in cod.

## Ce e acoperit acum

- Erori JS neprinse si respingeri de promisiuni in browser (automat, prin
  SDK-ul `@sentry/tanstackstart-react`).
- Erori de randare React prinse de `errorComponent`-ul din `__root.tsx`
  (trimise explicit prin `Sentry.captureException`).
- Urmarirea navigarii intre rute (browser tracing), utila pentru breadcrumbs
  cand se investigheaza o eroare raportata.

## Ce NU e acoperit inca -- si de ce

Instrumentarea server-side (erori intamplate in timpul SSR, pe Cloudflare
Workers) necesita un entry point de server personalizat si un fisier de
configurare `wrangler` cu flag-urile `nodejs_compat` si `compatibility_date`
setate corect. Acest proiect nu are un `wrangler.toml` vizibil -- target-ul
Cloudflare e generat automat de `@lovable.dev/vite-tanstack-config`, deci nu
exista un loc sigur, verificabil, unde sa adaug acea configurare fara riscul
sa intre in conflict cu ce genereaza deja Lovable la deploy.

Daca la un moment dat aplicatia trece pe un deploy Cloudflare gestionat
direct (`wrangler.toml` propriu, nu prin Lovable), pasii sunt documentati
aici: https://docs.sentry.io/platforms/javascript/guides/cloudflare/frameworks/tanstack-start/
-- practic inseamna sa inlocuiesti `src/server.ts` cu varianta impachetata
in `Sentry.withSentry(...)` din `@sentry/cloudflare`.

Pana atunci, monitorizarea client-side de mai sus acopera marea majoritate
a erorilor reale pe care le vede un utilizator (crash-uri de UI, erori de
retea, exceptii neprinse) -- doar erorile care apar exclusiv in timpul
randarii server-side, inainte ca pagina sa ajunga in browser, raman
neacoperite.
