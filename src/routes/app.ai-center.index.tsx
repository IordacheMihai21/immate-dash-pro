import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BrainCircuit,
  MessageCircleQuestion,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/app/ai-center/")({
  head: () => ({ meta: [{ title: "AI Center - IMMapp" }] }),
  component: AiCenterPage,
});

const aiModules = [
  {
    title: "Document AI",
    description: "Extrage automat date din facturi PDF, JPG sau PNG.",
    to: "/app/ai-center/document-ai" as const,
    icon: BrainCircuit,
  },
  {
    title: "Predicții financiare",
    description: "Analizează evoluția financiară și generează estimări.",
    to: "/app/ai-center/predictii-financiare" as const,
    icon: TrendingUp,
  },
  {
    title: "Asistent AI",
    description: "Întreabă în limbaj natural despre veniturile, clienții sau riscurile companiei.",
    to: "/app/ai-center/asistent" as const,
    icon: MessageCircleQuestion,
  },
];

function AiCenterPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Center"
        description="Instrumentele IMMapp pentru procesarea inteligentă a documentelor și predicții financiare."
      />

      <section className="overflow-hidden rounded-3xl border border-sidebar-border bg-sidebar p-6 text-sidebar-foreground shadow-lg sm:p-8">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Suită inteligentă IMMapp
          </div>
          <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Un singur spațiu pentru documente, validare și previziuni
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-sidebar-foreground/80 sm:text-base">
            Alege instrumentul potrivit fluxului tău și păstrează contextul procesării între
            modulele AI.
          </p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {aiModules.map((module) => {
          const Icon = module.icon;

          return (
            <Link
              key={module.title}
              to={module.to}
              className="card-lift group rounded-3xl border border-border bg-card p-5 shadow-sm transition-colors duration-200 hover:border-primary/30 sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-secondary text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">{module.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{module.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
