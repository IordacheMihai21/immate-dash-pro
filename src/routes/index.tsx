import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FileCode2,
  FileText,
  LayoutDashboard,
  Percent,
  Truck,
  Users,
  ArrowRight,
  Check,
  Building2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IMMapp — Business Intelligence pentru IMM-uri" },
      {
        name: "description",
        content:
          "Platformă SaaS pentru IMM-uri din România: importă e-Facturi XML, procesează documente financiare și urmărește indicatorii companiei într-un dashboard interactiv.",
      },
      { property: "og:title", content: "IMMapp — Business Intelligence pentru IMM-uri" },
      {
        property: "og:description",
        content:
          "Importă documente financiare, extrage automat informații și urmărește indicatorii companiei.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  {
    icon: FileCode2,
    title: "Import e-Factură XML",
    desc: "Încarcă fișiere XML conforme ANAF și extrage automat toate datele.",
  },
  {
    icon: FileText,
    title: "Procesare documente financiare",
    desc: "PDF, XLSX, CSV — toate documentele firmei într-un singur loc.",
  },
  {
    icon: LayoutDashboard,
    title: "Dashboard financiar",
    desc: "Indicatori și grafice actualizate în timp real, pentru deciziile tale.",
  },
  {
    icon: Percent,
    title: "Analiză TVA",
    desc: "Evidență clară a TVA colectată și deductibilă, lunar și anual.",
  },
  {
    icon: Truck,
    title: "Monitorizare furnizori și clienți",
    desc: "Top parteneri, volume, valori și istoric pentru fiecare entitate.",
  },
  {
    icon: Users,
    title: "Rapoarte pentru management",
    desc: "Rapoarte exportabile, gata pentru contabil sau pentru board.",
  },
];

const steps = [
  { n: 1, title: "Creezi cont", desc: "Înregistrare rapidă pentru utilizator." },
  { n: 2, title: "Adaugi firma", desc: "Date complete IMM, validare CUI." },
  { n: 3, title: "Încarci documente", desc: "XML, PDF, XLSX sau CSV." },
  { n: 4, title: "Analizezi indicatorii", desc: "Dashboard BI cu KPI și grafice." },
];

const plans = [
  {
    name: "Basic",
    price: "49 RON",
    per: "/ lună",
    features: ["1 firmă", "100 documente / lună", "Dashboard standard", "Suport email"],
    cta: "Începe gratuit",
  },
  {
    name: "Professional",
    price: "149 RON",
    per: "/ lună",
    popular: true,
    features: [
      "3 firme",
      "1.000 documente / lună",
      "Rapoarte avansate",
      "Integrare e-Factură ANAF",
      "Suport prioritar",
    ],
    cta: "Alege Professional",
  },
  {
    name: "Enterprise",
    price: "Personalizat",
    per: "",
    features: [
      "Firme nelimitate",
      "Documente nelimitate",
      "API & integrări custom",
      "Manager dedicat",
      "SLA garantat",
    ],
    cta: "Contactează-ne",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Building2 className="h-4 w-4" />
            </div>
            <span className="text-lg font-semibold tracking-tight">IMMapp</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <a href="#functionalitati" className="text-muted-foreground hover:text-foreground">
              Funcționalități
            </a>
            <a href="#cum-functioneaza" className="text-muted-foreground hover:text-foreground">
              Cum funcționează
            </a>
            <a href="#preturi" className="text-muted-foreground hover:text-foreground">
              Prețuri
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">Autentificare</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/register">Începe acum</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-secondary via-background to-background" />
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              SaaS pentru IMM-uri din România
            </span>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
              Platformă SaaS de Business Intelligence pentru IMM-uri
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
              Importă documente financiare, extrage automat informații și urmărește indicatorii
              companiei într-un dashboard interactiv.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link to="/register">
                  Începe acum <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <a href="#functionalitati">Vezi funcționalitățile</a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="functionalitati" className="border-b border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Funcționalități cheie</h2>
            <p className="mt-3 text-muted-foreground">
              Tot ce are nevoie un IMM pentru a-și înțelege și controla situația financiară.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card key={f.title} className="border-border/60">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-md bg-secondary text-primary">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="cum-functioneaza" className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Cum funcționează</h2>
            <p className="mt-3 text-muted-foreground">
              4 pași simpli până la primul tău raport BI.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="rounded-lg border border-border bg-card p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                  {s.n}
                </div>
                <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="preturi" className="border-b border-border bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Planuri simple, fără surprize</h2>
            <p className="mt-3 text-muted-foreground">
              Alege planul potrivit dimensiunii firmei tale.
            </p>
          </div>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {plans.map((p) => (
              <Card
                key={p.name}
                className={
                  p.popular
                    ? "relative border-primary/40 shadow-lg ring-1 ring-primary/20"
                    : "border-border/60"
                }
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                    Recomandat
                  </span>
                )}
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold">{p.name}</h3>
                  <div className="mt-3 flex items-end gap-1">
                    <span className="text-3xl font-semibold">{p.price}</span>
                    <span className="pb-1 text-sm text-muted-foreground">{p.per}</span>
                  </div>
                  <ul className="mt-6 space-y-2 text-sm">
                    {p.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-success" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={p.popular ? "default" : "outline"}
                    className="mt-6 w-full"
                    asChild
                  >
                    <Link to="/register">{p.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold">IMMapp</span>
            </div>
            <p className="text-xs text-sidebar-foreground/60">
              © {new Date().getFullYear()} IMMapp. Toate drepturile rezervate.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
