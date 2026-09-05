import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check, Minus } from "lucide-react";
import { useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/preturi")({
  head: () => ({
    meta: [
      { title: "Preturi — IMMapp" },
      {
        name: "description",
        content:
          "Planuri IMMapp pentru IMM-uri din Romania: e-Factura, Document AI si rapoarte financiare. Incepe gratuit, treci la un plan platit cand ai nevoie.",
      },
    ],
  }),
  component: PricingPage,
});

type BillingCycle = "monthly" | "annual";

type Plan = {
  name: string;
  tagline: string;
  // Must match the real Stripe Price IDs (STRIPE_PRICE_*_MONTHLY/ANNUAL in
  // .env, see STRIPE_SETUP.md) -- these are display-only numbers, not read
  // from Stripe, so they can silently drift from what checkout actually
  // charges if the Stripe prices ever change without updating this file too.
  monthlyPrice: number;
  annualTotal: number;
  featured?: boolean;
  cta: string;
  ctaTo: "/register" | "/login";
  features: string[];
};

const plans: Plan[] = [
  {
    name: "Start",
    tagline: "Pentru un IMM care abia incepe cu e-Factura.",
    monthlyPrice: 0,
    annualTotal: 0,
    cta: "Incepe gratuit",
    ctaTo: "/register",
    features: [
      "Pana la 20 facturi procesate / luna",
      "Import si export e-Factura (UBL 2.1 / CIUS-RO)",
      "1 utilizator",
      "Cash-flow si TVA de baza",
      "Document AI (extractie standard)",
    ],
  },
  {
    name: "Business",
    tagline: "Pentru firme cu activitate lunara constanta si contabil extern.",
    monthlyPrice: 124,
    annualTotal: 1240,
    featured: true,
    cta: "Incepe gratuit",
    ctaTo: "/register",
    features: [
      "Facturi nelimitate",
      "Document AI complet, cu corectii care imbunatatesc extractia",
      "Toate rapoartele (cash-flow, venituri, cheltuieli, TVA, profitabilitate)",
      "Pana la 5 utilizatori (rolurile Admin si Contabil incluse)",
      "Jurnal de activitate (cine a modificat ce)",
      "Autentificare in doi pasi (TOTP)",
    ],
  },
  {
    name: "Companie",
    tagline: "Pentru firme cu mai multi colaboratori si nevoi de conformitate.",
    monthlyPrice: 291,
    annualTotal: 2910,
    cta: "Contacteaza-ne",
    ctaTo: "/register",
    features: [
      "Tot ce include planul Business",
      "Utilizatori nelimitati si roluri per companie",
      "Mai multe companii sub acelasi cont",
      "Predictii financiare AI (Forecast)",
      "Suport prioritar",
    ],
  },
];

const faqs = [
  {
    question: "Ce se intampla dupa perioada gratuita?",
    answer:
      "Contul ramane activ pe planul Start. Poti trece la Business sau Companie oricand, direct din Setari, fara sa pierzi datele sau istoricul facturilor.",
  },
  {
    question: "Datele companiei mele sunt izolate de ale altor clienti?",
    answer:
      "Da. Fiecare companie are datele separate la nivel de baza de date (row-level security), nu doar la nivel de interfata — nimeni din afara companiei tale nu poate vedea facturile, documentele sau rapoartele tale.",
  },
  {
    question: "Pot colabora cu contabilul meu extern?",
    answer:
      "Da, din planul Business in sus. Contabilul primeste rol dedicat, cu acces la facturi si rapoarte, fara sa fie nevoie de un cont partajat.",
  },
  {
    question: "Trimiteti facturi automat catre SPV ANAF?",
    answer:
      "Generarea XML UBL 2.1 / CIUS-RO este inclusa in toate planurile. Trimiterea live catre SPV ANAF necesita un certificat digital calificat pe care il configurezi tu — momentan nu este inclus in platforma.",
  },
];

function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>("annual");

  return (
    <div className="immapp-landing min-h-screen overflow-x-hidden bg-background text-foreground">
      <SiteNav />

      <main>
        <section className="px-4 pb-4 pt-14 sm:px-6 sm:pt-20">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Preturi</p>
            <h1 className="mt-3 text-balance text-4xl font-semibold leading-tight sm:text-5xl">
              Un pret simplu, care creste odata cu firma ta.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Incepe gratuit. Treci la un plan platit doar cand ai nevoie de mai multe facturi sau
              de mai multi colaboratori.
            </p>

            <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
              <button
                type="button"
                onClick={() => setCycle("monthly")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition",
                  cycle === "monthly"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Lunar
              </button>
              <button
                type="button"
                onClick={() => setCycle("annual")}
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                  cycle === "annual"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Anual
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    cycle === "annual"
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-success/15 text-success",
                  )}
                >
                  -17%
                </span>
              </button>
            </div>
          </div>
        </section>

        <section className="px-4 py-10 sm:px-6">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <PricingCard key={plan.name} plan={plan} cycle={cycle} />
            ))}
          </div>

          <p className="mx-auto mt-6 max-w-6xl text-center text-xs text-muted-foreground">
            Preturile includ TVA. Plata online cu cardul, recurenta, direct din aplicatie — fara
            interventie manuala.
          </p>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl border border-border bg-card p-6 sm:p-10">
            <h2 className="text-2xl font-semibold">Comparatie rapida</h2>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-3 pr-4 font-medium">Functionalitate</th>
                    {plans.map((plan) => (
                      <th key={plan.name} className="px-4 py-3 text-center font-semibold">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow
                    label="Facturi procesate / luna"
                    values={["20", "Nelimitat", "Nelimitat"]}
                  />
                  <ComparisonRow label="Utilizatori" values={["1", "5", "Nelimitat"]} />
                  <ComparisonRow label="Document AI" values={[true, true, true]} />
                  <ComparisonRow label="Jurnal de activitate" values={[false, true, true]} />
                  <ComparisonRow label="Autentificare in doi pasi" values={[false, true, true]} />
                  <ComparisonRow label="Predictii financiare AI" values={[false, false, true]} />
                  <ComparisonRow label="Mai multe companii" values={[false, false, true]} />
                  <ComparisonRow label="Suport" values={["Comunitate", "Email", "Prioritar"]} />
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-semibold">Intrebari frecvente</h2>
            <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
              {faqs.map((faq) => (
                <div key={faq.question} className="p-5">
                  <p className="font-semibold text-foreground">{faq.question}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-4xl rounded-3xl bg-primary px-6 py-12 text-center text-primary-foreground sm:px-12">
            <h2 className="text-3xl font-semibold text-balance">
              Gata sa lasi IMMapp sa citeasca facturile in locul tau?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-primary-foreground/80">
              Cont gratuit, fara card bancar. Treci la un plan platit cand firma ta creste.
            </p>
            <Button size="lg" variant="secondary" asChild className="mt-6">
              <Link to="/register">
                Incepe gratuit
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function PricingCard({ plan, cycle }: { plan: Plan; cycle: BillingCycle }) {
  const displayPrice = cycle === "annual" ? Math.round(plan.annualTotal / 12) : plan.monthlyPrice;

  return (
    <div
      className={cn(
        "flex flex-col rounded-3xl border p-6 sm:p-8",
        plan.featured
          ? "border-primary bg-card shadow-[0_20px_60px_rgba(37,86,224,0.15)]"
          : "border-border bg-card",
      )}
    >
      {plan.featured ? (
        <span className="mb-4 inline-flex w-fit items-center rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
          Cel mai popular
        </span>
      ) : null}

      <h3 className="text-lg font-semibold">{plan.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>

      <div className="mt-6 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight">
          {displayPrice === 0 ? "Gratuit" : `${displayPrice} RON`}
        </span>
        {displayPrice > 0 ? <span className="text-sm text-muted-foreground">/ luna</span> : null}
      </div>
      {displayPrice > 0 && cycle === "annual" ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Facturat anual, {plan.annualTotal} RON / an
        </p>
      ) : null}

      <Button className="mt-6 w-full" variant={plan.featured ? "default" : "outline"} asChild>
        <Link to={plan.ctaTo}>{plan.cta}</Link>
      </Button>

      <ul className="mt-8 space-y-3 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComparisonRow({ label, values }: { label: string; values: (string | boolean)[] }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3 pr-4 text-foreground">{label}</td>
      {values.map((value, index) => (
        <td key={index} className="px-4 py-3 text-center">
          {typeof value === "boolean" ? (
            value ? (
              <Check className="mx-auto h-4 w-4 text-primary" />
            ) : (
              <Minus className="mx-auto h-4 w-4 text-muted-foreground/50" />
            )
          ) : (
            <span className="text-foreground">{value}</span>
          )}
        </td>
      ))}
    </tr>
  );
}
