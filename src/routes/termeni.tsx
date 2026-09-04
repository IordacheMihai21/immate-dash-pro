import { createFileRoute } from "@tanstack/react-router";
import { LegalHeader, LegalSection } from "@/components/legal-page";

export const Route = createFileRoute("/termeni")({
  head: () => ({
    meta: [
      { title: "Termeni și condiții — IMMapp" },
      {
        name: "description",
        content: "Termenii și condițiile de utilizare a platformei IMMapp.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalHeader />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Termeni și condiții</h1>
        <p className="mt-2 text-sm text-muted-foreground">Ultima actualizare: 31 august 2026.</p>

        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          Acest document este un draft funcțional, generat pentru lansarea IMMapp, și nu constituie
          consultanță juridică. Câmpurile marcate cu <code>[…]</code> trebuie completate cu datele
          reale ale operatorului înainte de publicare, iar documentul final ar trebui revizuit de un
          avocat înainte de a fi considerat obligatoriu din punct de vedere legal.
        </div>

        <LegalSection title="1. Obiectul contractului">
          <p>
            Acești termeni guvernează utilizarea platformei IMMapp (denumită în continuare
            „Serviciul”), operată de{" "}
            <strong>[denumirea juridică a operatorului, CUI, sediu social]</strong>. Prin crearea
            unui cont, confirmi că ai citit și accepți acești termeni.
          </p>
        </LegalSection>

        <LegalSection title="2. Ce este IMMapp">
          <p>
            IMMapp este o platformă software-as-a-service pentru IMM-uri din România, care oferă:
          </p>
          <ul>
            <li>import și creare de e-Facturi (format UBL 2.1 / CIUS-RO);</li>
            <li>extragere automată de date din documente financiare (Document AI);</li>
            <li>rapoarte financiare: cash-flow, TVA, venituri, cheltuieli, profitabilitate;</li>
            <li>colaborare firmă–contabil pe bază de roluri, în interiorul aceluiași cont.</li>
          </ul>
          <p>
            Trimiterea/sincronizarea live cu SPV ANAF necesită un certificat digital calificat al
            utilizatorului și nu este disponibilă implicit pentru toate conturile.
          </p>
        </LegalSection>

        <LegalSection title="3. Contul tău">
          <p>
            Ești responsabil pentru acuratețea datelor introduse la înregistrare (inclusiv datele
            firmei: CUI, denumire, adresă) și pentru păstrarea confidențialității parolei. Ești
            responsabil pentru orice activitate care are loc din contul tău, inclusiv pentru
            persoanele pe care le inviți și cărora le atribui un rol (administrator, contabil,
            vizualizator).
          </p>
        </LegalSection>

        <LegalSection title="4. Limitele Document AI">
          <p>
            Document AI extrage automat câmpuri din facturi și documente, cu un scor de încredere
            afișat pentru fiecare câmp. Extragerea automată poate conține erori, în special pentru
            documente de calitate scăzută sau formate neobișnuite.{" "}
            <strong>
              Responsabilitatea verificării și corectării câmpurilor înainte de utilizarea lor în
              raportare sau declarații fiscale îți revine ție.
            </strong>{" "}
            IMMapp nu oferă consultanță fiscală sau contabilă și nu înlocuiește un contabil
            autorizat.
          </p>
        </LegalSection>

        <LegalSection title="5. Prețul serviciului">
          <p>
            La data acestui document, IMMapp este oferit fără o structură de abonament activă; orice
            model de prețuri viitor va fi comunicat cu preaviz rezonabil înainte de a deveni
            aplicabil, iar continuarea utilizării serviciului după acel moment presupune acceptarea
            noilor condiții de preț.
          </p>
        </LegalSection>

        <LegalSection title="6. Disponibilitatea serviciului">
          <p>
            Depunem eforturi rezonabile pentru ca Serviciul să fie disponibil continuu, dar nu
            garantăm o disponibilitate neîntreruptă. Pot exista perioade de mentenanță planificată
            sau întreruperi neplanificate. Serviciul este oferit „ca atare” („as is”), fără garanții
            explicite privind funcționarea neîntreruptă sau lipsa totală de erori.
          </p>
        </LegalSection>

        <LegalSection title="7. Proprietate intelectuală">
          <p>
            Codul, designul și marca IMMapp rămân proprietatea operatorului. Datele pe care le
            încarci (facturi, documente, informații despre firmă) rămân proprietatea ta; ni le
            încredințezi doar în scopul furnizării Serviciului, conform{" "}
            <a href="/confidentialitate" className="text-primary underline underline-offset-2">
              Politicii de confidențialitate
            </a>
            .
          </p>
        </LegalSection>

        <LegalSection title="8. Suspendare și reziliere">
          <p>
            Poți închide oricând contul tău. Ne rezervăm dreptul de a suspenda sau închide conturi
            care încalcă acești termeni, care sunt folosite fraudulos sau care pun în pericol
            securitatea platformei sau a altor utilizatori.
          </p>
        </LegalSection>

        <LegalSection title="9. Limitarea răspunderii">
          <p>
            În limita maximă permisă de lege, IMMapp nu răspunde pentru pierderi indirecte, pierderi
            de profit sau daune rezultate din decizii de business luate pe baza rapoartelor sau
            datelor extrase automat, fără verificarea prealabilă a acestora de către tine.
          </p>
        </LegalSection>

        <LegalSection title="10. Legea aplicabilă">
          <p>
            Acești termeni sunt guvernați de legislația română. Orice litigiu se supune instanțelor
            competente din România, cu excepția cazului în care legea prevede altfel.
          </p>
        </LegalSection>

        <LegalSection title="11. Contact">
          <p>
            Pentru întrebări legate de acești termeni, ne poți scrie la{" "}
            <strong>[adresă de email de contact]</strong>.
          </p>
        </LegalSection>
      </main>
    </div>
  );
}
