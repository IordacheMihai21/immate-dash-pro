import { getActiveCompanyId } from "./companyService";
import { supabase } from "./supabaseClient";

export type CompanyPreferences = {
  companyId: string;
  documentNotifications: boolean;
  forecastNotifications: boolean;
  riskNotifications: boolean;
  showTechnicalMetrics: boolean;
  tableDensity: "comfortable" | "compact";
};

export const DEFAULT_COMPANY_PREFERENCES: Omit<CompanyPreferences, "companyId"> = {
  documentNotifications: true,
  forecastNotifications: true,
  riskNotifications: true,
  showTechnicalMetrics: false,
  tableDensity: "comfortable",
};

type PreferencesRow = {
  company_id: string;
  document_notifications: boolean;
  forecast_notifications: boolean;
  risk_notifications: boolean;
  show_technical_metrics: boolean;
  table_density: string;
};

function fromRow(row: PreferencesRow): CompanyPreferences {
  return {
    companyId: row.company_id,
    documentNotifications: row.document_notifications,
    forecastNotifications: row.forecast_notifications,
    riskNotifications: row.risk_notifications,
    showTechnicalMetrics: row.show_technical_metrics,
    tableDensity: row.table_density === "compact" ? "compact" : "comfortable",
  };
}

const preferencesColumns =
  "company_id, document_notifications, forecast_notifications, risk_notifications, show_technical_metrics, table_density";

export async function getCompanyPreferences(): Promise<CompanyPreferences> {
  const companyId = await getActiveCompanyId();

  const { data, error } = await supabase
    .from("company_preferences")
    .select(preferencesColumns)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error(`Preferintele companiei nu au putut fi citite: ${error.message}`);
  }

  // A row is created automatically when a company is created (see the
  // 20260904b_add_company_preferences.sql trigger + backfill), but fall
  // back to defaults defensively rather than throwing if it's ever missing.
  return data ? fromRow(data as PreferencesRow) : { companyId, ...DEFAULT_COMPANY_PREFERENCES };
}

export async function updateCompanyPreferences(
  updates: Partial<Omit<CompanyPreferences, "companyId">>,
): Promise<CompanyPreferences> {
  const companyId = await getActiveCompanyId();
  const patch: Record<string, unknown> = {};

  if (updates.documentNotifications !== undefined) {
    patch.document_notifications = updates.documentNotifications;
  }
  if (updates.forecastNotifications !== undefined) {
    patch.forecast_notifications = updates.forecastNotifications;
  }
  if (updates.riskNotifications !== undefined) {
    patch.risk_notifications = updates.riskNotifications;
  }
  if (updates.showTechnicalMetrics !== undefined) {
    patch.show_technical_metrics = updates.showTechnicalMetrics;
  }
  if (updates.tableDensity !== undefined) {
    patch.table_density = updates.tableDensity;
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("company_preferences")
    .update(patch)
    .eq("company_id", companyId)
    .select(preferencesColumns)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error(
        "Doar proprietarul sau un administrator poate modifica preferintele companiei.",
      );
    }

    throw new Error(`Preferintele companiei nu au putut fi salvate: ${error.message}`);
  }

  return fromRow(data as PreferencesRow);
}
