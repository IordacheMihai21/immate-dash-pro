import { getOrCreateCompanyProfile } from "@/lib/companyService";
import { supabase } from "@/lib/supabaseClient";

export type ActivityLogEntry = {
  id: string;
  actorLabel: string;
  action: string;
  entityType: string;
  summary: string;
  createdAt: string;
};

const activityLogColumns = "id, actor_label, action, entity_type, summary, created_at";

export async function getRecentActivity(limit = 6): Promise<ActivityLogEntry[]> {
  const companyProfile = await getOrCreateCompanyProfile();

  const { data, error } = await supabase
    .from("activity_log")
    .select(activityLogColumns)
    .eq("company_id", companyProfile.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Jurnalul de activitate nu a putut fi citit: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    actorLabel: row.actor_label,
    action: row.action,
    entityType: row.entity_type,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}
