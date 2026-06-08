import { createFileRoute } from "@tanstack/react-router";
import { ProfitabilityReportPage } from "./app.rapoarte.profitabilitate";

export const Route = createFileRoute("/app/rapoarte/profitability")({
  head: () => ({ meta: [{ title: "Raport profitabilitate - IMMapp" }] }),
  component: ProfitabilityReportPage,
});
