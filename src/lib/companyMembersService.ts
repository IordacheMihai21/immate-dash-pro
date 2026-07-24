import { getActiveCompanyId } from "@/lib/companyService";
import { getCurrentAuthUser } from "@/lib/appUserService";
import { supabase } from "@/lib/supabaseClient";

export type CompanyMemberRole = "owner" | "admin" | "contabil" | "vizualizator";
export type CompanyMemberStatus = "active" | "invited" | "revoked";
export const INVITABLE_ROLES: CompanyMemberRole[] = ["admin", "contabil", "vizualizator"];

export type CompanyMember = {
  id: string;
  companyId: string;
  authUserId: string | null;
  invitedEmail: string | null;
  role: CompanyMemberRole;
  status: CompanyMemberStatus;
  createdAt: string;
};

type CompanyMemberRow = {
  id: string;
  company_id: string;
  auth_user_id: string | null;
  invited_email: string | null;
  role: CompanyMemberRole;
  status: CompanyMemberStatus;
  created_at: string;
};

const memberColumns = "id, company_id, auth_user_id, invited_email, role, status, created_at";

function isMissingCompanyMembersSchema(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  const code = error.code ?? "";

  return (
    code === "42P01" ||
    ["PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    (message.includes("company_members") && message.includes("does not exist")) ||
    (message.includes("company_members") && message.includes("schema cache"))
  );
}

function fromRow(row: CompanyMemberRow): CompanyMember {
  return {
    id: row.id,
    companyId: row.company_id,
    authUserId: row.auth_user_id,
    invitedEmail: row.invited_email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listCompanyMembers(): Promise<CompanyMember[]> {
  const companyId = await getActiveCompanyId();

  const { data, error } = await supabase
    .from("company_members")
    .select(memberColumns)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingCompanyMembersSchema(error)) {
      return [];
    }

    throw new Error(`Membrii companiei nu au putut fi cititi: ${error.message}`);
  }

  return ((data ?? []) as CompanyMemberRow[]).map(fromRow);
}

export async function getMyCompanyRole(): Promise<CompanyMemberRole | null> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    return null;
  }

  const members = await listCompanyMembers();
  const mine = members.find((member) => member.authUserId === authUser.id);

  return mine?.role ?? null;
}

export async function inviteCompanyMember({
  email,
  role,
}: {
  email: string;
  role: CompanyMemberRole;
}): Promise<CompanyMember> {
  const companyId = await getActiveCompanyId();
  const authUser = await getCurrentAuthUser();
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Adresa de email este obligatorie.");
  }

  if (!INVITABLE_ROLES.includes(role)) {
    throw new Error("Rol invalid pentru invitatie.");
  }

  const { data, error } = await supabase
    .from("company_members")
    .insert({
      company_id: companyId,
      invited_email: normalizedEmail,
      role,
      status: "invited",
      invited_by: authUser?.id ?? null,
    })
    .select(memberColumns)
    .single();

  if (error) {
    throw new Error(`Invitatia nu a putut fi trimisa: ${error.message}`);
  }

  return fromRow(data as CompanyMemberRow);
}

export async function updateCompanyMemberRole(
  memberId: string,
  role: CompanyMemberRole,
): Promise<void> {
  if (role === "owner") {
    throw new Error("Rolul de owner nu poate fi atribuit direct.");
  }

  const { error } = await supabase
    .from("company_members")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    throw new Error(`Rolul nu a putut fi actualizat: ${error.message}`);
  }
}

export async function revokeCompanyMember(memberId: string): Promise<void> {
  const { error } = await supabase
    .from("company_members")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    throw new Error(`Accesul nu a putut fi revocat: ${error.message}`);
  }
}

export async function claimPendingCompanyInvite(): Promise<{
  companyId: string;
  role: CompanyMemberRole;
} | null> {
  try {
    const { data, error } = await supabase.rpc("claim_company_invite");

    if (error) {
      if (isMissingCompanyMembersSchema(error)) {
        return null;
      }

      throw error;
    }

    const claimed = Array.isArray(data) ? data[0] : data;

    if (!claimed?.company_id) {
      return null;
    }

    return { companyId: claimed.company_id, role: claimed.role };
  } catch (error) {
    console.warn("Invitatia de echipa nu a putut fi revendicata", error);
    return null;
  }
}
