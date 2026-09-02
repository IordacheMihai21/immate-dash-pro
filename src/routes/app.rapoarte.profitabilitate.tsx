import { createFileRoute } from "@tanstack/react-router";
import { ProfitabilityReportPage } from "@/components/pages/profitabilitate-report-page";

export const Route = createFileRoute("/app/rapoarte/profitabilitate")({
  head: () => ({ meta: [{ title: "Raport profitabilitate - IMMapp" }] }),
  component: ProfitabilityReportPage,
});
