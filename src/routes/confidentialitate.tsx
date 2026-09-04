import { createFileRoute } from "@tanstack/react-router";
import { LegalHeader, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/confidentialitate")({
  head: () => ({
    meta: [
      { title: "Politica de confidențialitate — IMMapp" },
      {
        name: "description",
        content:
          "Cum colectează, folosește și protejează IMMapp datele companiei și ale utilizatorilor.",
      },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Politica de confidențialitate</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ultima actualizare: 31 august 2026.</p>

        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Acest document este un draft funcțional, generat pentru lansarea IMMapp, și nu constituie
          consultanță juridică. Câmpurile marcate cu <code>[…]</code> trebuie completate cu datele
          reale ale operatorului înainte de publicare, iar documentul final ar trebui revizuit de un
          avocat/consultant GDPR.
        </div>

        <LegalSection title="1. Cine este operatorul de date">
          <p>
            Operatorul datelor cu caracter personal prelucrate prin aplicația IMMapp este{" "}
            <strong>[denumirea juridică a operatorului, CUI, sediu social]</strong>, denumit în
            continuare „IMMapp” sau „noi”. Pentru orice cerere legată de datele tale personale ne
            poți contacta la <strong>[adresă de email dedicată GDPR]</strong>.
          </p>
        </LegalSection>

        <LegalSection title="2. Ce date colectăm">
          <p>Colectăm și prelucrăm următoarele categorii de date:</p>
          <ul>
            <li>
              <strong>Date de cont:</strong> nume, prenume, adresă de email, parolă (stocată criptat
              de furnizorul de autentificare, niciodată în clar).
            </li>
            <li>
              <strong>Date despre firmă:</strong> denumire, CUI, număr de înregistrare la Registrul
              Comerțului, adresă, date de contact ale firmei.
            </li>
            <li>
              <strong>Documente financiare încărcate:</strong> facturi (XML e-Factura, PDF,
              imagini), câmpurile extrase automat de Document AI și corecțiile pe care le faci
              asupra lor.
            </li>
            <li>
              <strong>Date de colaborare:</strong> adresele de email ale persoanelor pe care le
              inviți în cont (de exemplu contabilul firmei) și rolul atribuit fiecăreia.
            </li>
            <li>
              <strong>Date tehnice:</strong> adresă IP, tip de browser, jurnale de activitate
              necesare pentru securitate și depanare.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="3. De ce prelucrăm aceste date">
          <ul>
            <li>
              Pentru a-ți furniza serviciul: cont, facturare, extragere automată de date, rapoarte
              financiare.
            </li>
            <li>
              Pentru a îmbunătăți acuratețea Document AI — corecțiile pe care le faci asupra
              câmpurilor extrase pot fi folosite pentru re-antrenarea modelului. Aceste corecții
              sunt legate de contul companiei tale, nu sunt publicate sau partajate cu alți clienți.
            </li>
            <li>
              Pentru a permite colaborarea firmă–contabil în interiorul aceluiași cont, pe baza
              rolurilor pe care le atribui.
            </li>
            <li>
              Pentru a respecta obligații legale (evidență fiscală, e-Factura/SPV ANAF,
              contabilitate).
            </li>
            <li>
              Pentru securitatea aplicației: prevenirea accesului neautorizat, depanarea erorilor.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="4. Temeiul legal al prelucrării">
          <p>Prelucrăm datele tale pe baza:</p>
          <ul>
            <li>executării contractului dintre tine și IMMapp (art. 6 alin. (1) lit. b) GDPR);</li>
            <li>
              respectării unei obligații legale, în special în zona fiscală/e-Factura (art. 6 alin.
              (1) lit. c) GDPR);
            </li>
            <li>
              interesului nostru legitim de a îmbunătăți produsul și de a preveni frauda/abuzul
              (art. 6 alin. (1) lit. f) GDPR), interes pe care îl echilibrăm întotdeauna cu
              drepturile tale.
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="5. Cui transmitem datele">
          <p>
            Nu vindem datele tale. Le partajăm doar cu furnizori strict necesari pentru a face
            aplicația să funcționeze, în calitate de persoane împuternicite:
          </p>
          <ul>
            <li>
              <strong>Supabase</strong> — găzduirea bazei de date, autentificare și stocare fișiere.
              Fiecare companie are datele izolate la nivel de bază de date (Row Level Security);
              niciun client nu poate vedea datele altei companii.
            </li>
            <li>
              <strong>Furnizorul de infrastructură/hosting</strong> al aplicației web.
            </li>
            <li>
              Autorități publice (de exemplu ANAF/SPV), atunci când legea o cere sau la cererea ta
              explicită (trimiterea e-Facturii).
            </li>
          </ul>
        </LegalSection>

        <LegalSection title="6. Cât timp păstrăm datele">
          <p>
            Păstrăm datele de cont și documentele financiare pe durata existenței contului, plus
            perioada impusă de legislația fiscală/contabilă din România pentru documente
            justificative. La cererea de ștergere a contului, datele cu caracter personal care nu
            trebuie păstrate obligatoriu prin lege sunt șterse sau anonimizate.
          </p>
        </LegalSection>

        <LegalSection title="7. Drepturile tale">
          <p>Conform GDPR, ai dreptul să:</p>
          <ul>
            <li>soliciți acces la datele tale și o copie a acestora;</li>
            <li>ceri rectificarea datelor incorecte sau incomplete;</li>
            <li>
              ceri ștergerea datelor („dreptul de a fi uitat”), în limitele impuse de obligațiile
              legale fiscale;
            </li>
            <li>ceri restricționarea sau te opui unei prelucrări;</li>
            <li>primești datele tale într-un format portabil;</li>
            <li>
              depui o plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu
              Caracter Personal (ANSPDCP).
            </li>
          </ul>
          <p>
            Pentru a exercita oricare dintre aceste drepturi, scrie-ne la{" "}
            <strong>[adresă de email dedicată GDPR]</strong>.
          </p>
        </LegalSection>

        <LegalSection title="8. Securitate">
          <p>
            Aplicăm izolare a datelor pe companie (Row Level Security) la nivel de bază de date,
            transport criptat (HTTPS/TLS) și control al accesului pe roluri. Niciun sistem nu este
            100% infailibil, dar tratăm securitatea datelor financiare ca parte a produsului, nu ca
            un detaliu opțional.
          </p>
        </LegalSection>

        <LegalSection title="9. Cookie-uri">
          <p>
            Folosim cookie-uri/stocare locală strict necesare pentru autentificare și păstrarea
            sesiunii. Nu folosim în prezent cookie-uri de marketing sau publicitate terță.
          </p>
        </LegalSection>

        <LegalSection title="10. Modificări ale acestei politici">
          <p>
            Putem actualiza această politică pe măsură ce produsul evoluează. Modificările
            importante vor fi comunicate prin aplicație sau prin email.
          </p>
        </LegalSection>

        <p className="mt-10 text-sm text-muted-foreground">
          Ai întrebări despre datele tale? Scrie-ne la{" "}
          <strong>[adresă de email dedicată GDPR]</strong>.
        </p>
      </main>
    </div>
  );
}
