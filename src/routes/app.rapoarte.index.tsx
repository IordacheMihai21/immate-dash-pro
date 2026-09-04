import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReportPanel } from "@/components/report-ui";

export const Route = createFileRoute("/app/rapoarte/")({
  head: () => ({ meta: [{ title: "Rapoarte - IMMapp" }] }),
  component: ReportsIndexPage,
});

function ReportsIndexPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapoarte"
        description="Selectează un raport din meniul Rapoarte pentru analiză detaliată."
      />

      <ReportPanel title="Rapoarte specializate">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-secondary p-3 text-primary">
            <BarChart3 className="h-5 w-5" />
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            Fiecare subsecțiune din meniul Rapoarte deschide o pagină separată, cu indicatori,
            grafice, filtre și tabele dedicate acelui tip de analiză.
          </p>
        </div>
      </ReportPanel>
    </div>
  );
}
