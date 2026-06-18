import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, BrainCircuit, Network, Sparkles, TrendingUp } from "lucide-react";
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
    accent: "from-blue-500 to-cyan-400",
  },
  {
    title: "Layout AI",
    description: "Analizează structura documentului cu LayoutXLM și confirmă câmpurile importante.",
    to: "/app/ai-center/layout-ai" as const,
    icon: Network,
    accent: "from-indigo-500 to-blue-400",
  },
  {
    title: "Evaluare AI",
    description: "Compară extracțiile cu adnotările FATURA și calculează metrici.",
    to: "/app/ai-center/evaluare-ai" as const,
    icon: BarChart3,
    accent: "from-violet-500 to-indigo-400",
  },
  {
    title: "Predicții financiare",
    description: "Analizează evoluția financiară și generează estimări.",
    to: "/app/ai-center/predictii-financiare" as const,
    icon: TrendingUp,
    accent: "from-emerald-500 to-teal-400",
  },
];

function AiCenterPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Center"
        description="Instrumentele IMMapp pentru procesarea inteligentă a documentelor, evaluare și predicții financiare."
      />

      <section className="overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-slate-950 via-blue-950 to-blue-900 p-6 text-white shadow-lg shadow-blue-950/10 sm:p-8">
        <div className="max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-50 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            Suită inteligentă IMMapp
          </div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Un singur spațiu pentru documente, validare și previziuni
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
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
              className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-lg sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${module.accent} text-white shadow-sm`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowRight className="h-5 w-5 text-slate-300 transition group-hover:translate-x-1 group-hover:text-blue-600" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-950">{module.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">{module.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
