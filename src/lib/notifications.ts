import type { getDashboardData } from "@/lib/dashboardService";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  tone: "risk" | "warning" | "info" | "success";
  href: string;
};

/**
 * Derives real, per-company notifications from data already loaded for the
 * dashboard instead of showing static placeholder copy. No new data source:
 * everything here comes from fields getDashboardData() already computes.
 */
export function getDashboardNotifications(data: DashboardData | undefined): AppNotification[] {
  if (!data) {
    return [];
  }

  const notifications: AppNotification[] = [];

  if (data.invoiceCount === 0) {
    notifications.push({
      id: "no-invoices",
      title: "Compania asteapta prima factura",
      description: "Importa un XML e-Factura sau incarca un document pentru a incepe.",
      tone: "info",
      href: "/app/e-facturi",
    });

    return notifications;
  }

  if (
    data.riskClassification.cashFlowRiskClass === "Ridicat" ||
    data.riskClassification.paymentRiskClass === "Ridicat"
  ) {
    notifications.push({
      id: "risk-high",
      title: "Risc financiar ridicat detectat",
      description: data.riskClassification.explanation || "Verifica raportul de cash-flow.",
      tone: "risk",
      href: "/app/rapoarte/cash-flow",
    });
  }

  if (data.documentExtractionEvaluation.extractionQualityLabel === "Scazuta") {
    notifications.push({
      id: "extraction-quality-low",
      title: "Calitate scazuta a extractiei AI",
      description: `Completitudine campuri: ${data.documentExtractionEvaluation.fieldCompletenessRate.toFixed(0)}%. Verifica ultimele documente.`,
      tone: "warning",
      href: "/app/documente",
    });
  }

  if (data.unclassifiedInvoiceCount > 0) {
    notifications.push({
      id: "unclassified-invoices",
      title: `${data.unclassifiedInvoiceCount} facturi neclasificate`,
      description: "Aceste facturi nu au inca un tip clar (venit sau cheltuiala).",
      tone: "warning",
      href: "/app/e-facturi",
    });
  }

  if (notifications.length === 0) {
    notifications.push({
      id: "all-clear",
      title: "Totul este la zi",
      description: `${data.invoiceCount} facturi procesate, fara riscuri semnalate momentan.`,
      tone: "success",
      href: "/app",
    });
  }

  return notifications.slice(0, 4);
}
