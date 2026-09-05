import { getCurrentAuthUser } from "./appUserService";
import { supabase } from "./supabaseClient";

export type CompanyMembershipSummary = {
  companyId: string;
  companyName: string;
  cui: string;
  role: string;
};

type MembershipRow = {
  company_id: string;
  role: string;
  company_profiles: { company_name: string | null; cui: string | null } | null;
};

/**
 * Every active company the current user belongs to -- not just the one
 * currently "selected" in the app (see getSelectedCompanyId in
 * companyService.ts). Powers the company switcher and the client
 * portfolio page. RLS already allows a member to read any company they
 * belong to (company_profiles_select_members: is_company_member(id)), so
 * this needs no new policy -- it's the first place the app actually
 * queries across more than one company at once.
 */
export async function getUserCompanyMemberships(): Promise<CompanyMembershipSummary[]> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    return [];
  }

  const { data, error } = await supabase
    .from("company_members")
    .select("company_id, role, company_profiles(company_name, cui)")
    .eq("auth_user_id", authUser.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Companiile tale nu au putut fi citite: ${error.message}`);
  }

  return ((data ?? []) as unknown as MembershipRow[]).map((row) => ({
    companyId: row.company_id,
    companyName: row.company_profiles?.company_name?.trim() || "Companie fara nume",
    cui: row.company_profiles?.cui?.trim() || "",
    role: row.role,
  }));
}
