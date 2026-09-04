# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Administratorul/proprietarul unui IMM din România, fără contabil intern — gestionează singur facturarea și vrea să înțeleagă rapid situația financiară a firmei, fără jargon contabil. Contabilul este de obicei extern și colaborează cu firma prin rolul "Contabil" din aplicație (acces la facturi/rapoarte, nu neapărat utilizator zilnic principal).

## Product Purpose

Platformă SaaS de management financiar pentru IMM-uri din România: facturare, e-Factura (import, creare, export UBL 2.1/CIUS-RO), extragere automată de date din documente financiare via Document AI, cash-flow, rapoarte și predicții financiare. Succesul înseamnă timp redus petrecut cu introducerea manuală de date și o imagine financiară clară, la zi.

## Positioning

Diferențiere pe două axe pe care jucătorii consacrați din piața românească (SmartBill, Oblio) nu le au: (1) un Document AI care se îmbunătățește din corecțiile reale ale utilizatorilor, nu doar reguli fixe de extragere; (2) un spațiu de colaborare reală firmă–contabil (roluri, acces partajat), în direcția "financial OS" (reper: Pennylane), nu doar un program de emis facturi.

## Operating Context

Context legal/fiscal românesc: e-Factura este obligatorie prin SPV ANAF (B2B din 2024, B2C din 2025), format UBL 2.1 / profil CIUS-RO, CUI cu prefix RO, TVA cu cote reale 19/9/5/0%. Flux tipic: încarcă document (XML e-Factura sau PDF/imagine) → extragere automată (Document AI) → verificare/corectare câmpuri → salvare → apare în rapoarte (cash-flow, venituri, cheltuieli, TVA, profitabilitate). Trimiterea/primirea live către SPV ANAF necesită certificat digital calificat + înregistrare OAuth pe care utilizatorul nu le are încă la data acestui document.

## Capabilities and Constraints

- **Document AI**: model LayoutXLM fine-tunat (cu fallback layout-aware când modelul nu e disponibil), corecțiile utilizatorilor se salvează în Supabase (`document_ai_corrections`) pentru re-antrenare viitoare.
- **e-Factura**: import XML existent, creare manuală de factură nouă (formular complet), export XML UBL 2.1/CIUS-RO. Trimiterea/sincronizarea live cu SPV ANAF e blocată pe certificat digital al utilizatorului — cod netestat până atunci.
- **Multi-tenancy**: o companie poate avea mai mulți utilizatori cu roluri (owner, admin, contabil, vizualizator); invitație pe email, RLS pe toate tabelele.
- **Billing**: nu există încă (Stripe planificat, explicit ultimul pe listă de priorități).
- **Rapoarte financiare** (cash-flow, venituri, cheltuieli, TVA, profitabilitate, activitate lunară): statistică clasică per-companie (regresie liniară, medie mobilă, netezire exponențială cu backtesting), nu modele ML antrenate.
- **Backend Document AI**: serviciu Python/FastAPI separat de restul aplicației (React/TanStack Start + Supabase).
- Nedecis: model concret de prețuri/planuri de abonament.

## Brand Commitments

Numele produsului este "IMMapp" ("Sistem financiar"). Interfața este integral în limba română. Paletă vizuală existentă: sidebar bleumarin/navy închis, accente albastru pentru acțiuni primare, verde/roșu/portocaliu pentru stări (activ/eroare/atenție).

## Evidence on Hand

Cont de test cu date reale în producție (Supabase): 121 de facturi (mix import e-Factura + generate sintetic pentru demo), profil de companie real. Nu există testimoniale, studii de caz sau date de clienți reali publicate — nimic de acest fel nu trebuie inventat în lucrările viitoare.

## Product Principles

1. AI-ul trebuie să se îmbunătățească din uzul real al utilizatorilor (corecții), nu doar din date sintetice generate offline.
2. Colaborarea firmă–contabil este un spațiu de produs de sine stătător, nu un adaos peste facturare.
3. Conformitatea legală românească (e-Factura/SPV ANAF, TVA) este o cerință de bază a produsului, nu un "nice-to-have" de fază târzie.
4. Izolarea datelor între companii (multi-tenancy) este nenegociabilă — orice tabel nou primește RLS de la început.
5. Prioritizează claritatea pentru un owner fără pregătire contabilă, nu completitudinea pentru un contabil profesionist.
