import type { getDashboardData } from "@/lib/dashboardService";
import type { CompanyPreferences } from "@/lib/companyPreferencesService";
import { DEFAULT_COMPANY_PREFERENCES } from "@/lib/companyPreferencesService";

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  tone: "risk" | "warning" | "info" | "success";
  href: string;
};

type NotificationPreferences = Pick<
  CompanyPreferences,
  "documentNotifications" | "forecastNotifications" | "riskNotifications"
>;

/** Set in ai-forecast-page.tsx / document-ai-upload.tsx / upload-modal.tsx /
 * app.documente.tsx whenever a document import means the AI forecast no
 * longer reflects the latest data -- read here so the forecast reminder
 * below is a real, event-backed notification, not a static placeholder. */
function isForecastOutdated(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return localStorage.getItem("immapp:ai-forecast-status") === "outdated";
}

/**
 * Derives real, per-company notifications from data already loaded for the
 * dashboard instead of showing static placeholder copy. No new data source:
 * everything here comes from fields getDashboardData() already computes.
 *
 * `preferences` gates which categories a company has opted into (Setari >
 * Preferinte) -- defaults to everything on if preferences haven't loaded yet.
 */
export function getDashboardNotifications(
  data: DashboardData | undefined,
  preferences: NotificationPreferences = DEFAULT_COMPANY_PREFERENCES,
): AppNotification[] {
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
    preferences.riskNotifications &&
    (data.riskClassification.cashFlowRiskClass === "Ridicat" ||
      data.riskClassification.paymentRiskClass === "Ridicat")
  ) {
    notifications.push({
      id: "risk-high",
      title: "Risc financiar ridicat detectat",
      description: data.riskClassification.explanation || "Verifica raportul de cash-flow.",
      tone: "risk",
      href: "/app/rapoarte/cash-flow",
    });
  }

  if (preferences.documentNotifications) {
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
  }

  if (preferences.forecastNotifications && isForecastOutdated()) {
    notifications.push({
      id: "forecast-outdated",
      title: "Predictia AI Forecast nu mai reflecta datele curente",
      description: "Au fost importate documente noi de la ultima actualizare a predictiei.",
      tone: "info",
      href: "/app/ai-center/predictii-financiare",
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
