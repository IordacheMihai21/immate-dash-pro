import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, BrainCircuit, FileCode2, FileText, LineChart, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/app/ghid-utilizare")({
  head: () => ({ meta: [{ title: "Ghid de utilizare - IMMapp" }] }),
  component: UserGuidePage,
});

const guideSteps = [
  {
    title: "Pasul 1: Incarca e-Facturi XML",
    text: "Acceseaza Documente financiare si incarca una sau mai multe e-Facturi XML. IMMapp extrage automat datele relevante din documente.",
    icon: UploadCloud,
  },
  {
    title: "Pasul 2: Verifica e-Facturile",
    text: "In pagina e-Facturi poti vedea facturile procesate, furnizorii, clientii, TVA-ul si valorile totale.",
    icon: FileCode2,
  },
  {
    title: "Pasul 3: Urmareste Dashboard-ul",
    text: "Dashboard-ul ofera o imagine rapida asupra veniturilor, TVA-ului, activitatii si sanatatii financiare.",
    icon: BarChart3,
  },
  {
    title: "Pasul 4: Actualizeaza AI Forecast",
    text: "AI Forecast foloseste documentele incarcate pentru a estima veniturile, cash-flow-ul si riscul financiar pentru perioada urmatoare.",
    icon: BrainCircuit,
  },
  {
    title: "Pasul 5: Analizeaza rapoartele",
    text: "Rapoartele ofera analize detaliate pentru cash-flow, TVA, profitabilitate si activitate lunara.",
    icon: LineChart,
  },
];

function UserGuidePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ghid de utilizare"
        description="Parcurge pasii principali pentru a folosi IMMapp de la importul documentelor pana la analiza predictiva."
      />

      <section className="grid gap-4 lg:grid-cols-2">
        {guideSteps.map((step, index) => {
          const Icon = step.icon;

          return (
            <Card key={step.title} className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="mb-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      Etapa {index + 1}
                    </div>
                    <h2 className="text-base font-semibold text-slate-900">{step.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{step.text}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <Card className="border-blue-100 bg-blue-50 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-xl bg-white p-3 text-blue-600">
              <FileText className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-blue-950">
              Incepe prin incarcarea unei e-Facturi XML
            </h2>
            <p className="mt-1 text-sm leading-6 text-blue-900">
              Dupa import, dashboard-ul, rapoartele si AI Forecast vor folosi documentele tale.
            </p>
          </div>
          <Button asChild>
            <Link to="/app/documente">Incarca e-Factura XML</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
