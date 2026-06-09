import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type AppUser = {
  id?: string;
  auth_user_id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  created_at?: string;
  updated_at?: string;
};

export const DEFAULT_APP_ROLE = "Administrator";

const appUserColumns = `
  id,
  auth_user_id,
  email,
  full_name,
  role,
  created_at,
  updated_at
`;

function isMissingAppUsersTable(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  const code = error.code ?? "";

  return (
    code === "42P01" ||
    code === "42703" ||
    ["PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    (message.includes("app_users") &&
      message.includes("relation") &&
      message.includes("does not exist")) ||
    (message.includes("app_users") && message.includes("schema cache")) ||
    (message.includes("auth_user_id") && message.includes("schema cache"))
  );
}

function getStringMetadata(
  metadata: SupabaseUser["user_metadata"],
  key: string,
) {
  const value = metadata?.[key];

  return typeof value === "string" ? value.trim() : "";
}

export function getAuthUserMetadataName(authUser: SupabaseUser | null) {
  if (!authUser) {
    return "";
  }

  const metadata = authUser.user_metadata ?? {};
  const fullName = getStringMetadata(metadata, "full_name");
  const name = getStringMetadata(metadata, "name");
  const firstName =
    getStringMetadata(metadata, "first_name") ||
    getStringMetadata(metadata, "firstName");
  const lastName =
    getStringMetadata(metadata, "last_name") ||
    getStringMetadata(metadata, "lastName");
  const combinedName = `${firstName} ${lastName}`.trim();

  return fullName || name || combinedName;
}

export function getAuthUserDisplayName(authUser: SupabaseUser | null) {
  return (
    getAuthUserMetadataName(authUser) ||
    authUser?.email?.trim().split("@")[0] ||
    "Utilizator IMMapp"
  );
}

export async function getCurrentAuthUser(): Promise<SupabaseUser | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    return null;
  }

  return data.user ?? null;
}

async function getExistingAppUser(authUser: SupabaseUser): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select(appUserColumns)
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (error) {
    if (isMissingAppUsersTable(error)) {
      return null;
    }

    throw new Error(`Utilizatorul aplicatiei nu a putut fi citit: ${error.message}`);
  }

  return (data as AppUser | null) ?? null;
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    return null;
  }

  const existingUser = await getExistingAppUser(authUser);

  return existingUser ?? ensureAppUser();
}

async function ensureAppUserRow(): Promise<AppUser | null> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    return null;
  }

  const existingUser = await getExistingAppUser(authUser);
  const email = authUser.email?.trim() || "";
  const fullName = getAuthUserDisplayName(authUser);

  if (existingUser) {
    const shouldUpdate =
      (email && existingUser.email !== email) ||
      (fullName && existingUser.full_name !== fullName) ||
      !existingUser.role;

    if (!shouldUpdate) {
      return existingUser;
    }

    const { data, error } = await supabase
      .from("app_users")
      .update({
        email,
        full_name: fullName,
        role: existingUser.role || DEFAULT_APP_ROLE,
        updated_at: new Date().toISOString(),
      })
      .eq("auth_user_id", authUser.id)
      .select(appUserColumns)
      .single();

    if (error) {
      throw new Error(`Utilizatorul aplicatiei nu a putut fi actualizat: ${error.message}`);
    }

    return data as AppUser;
  }

  const { data, error } = await supabase
    .from("app_users")
    .insert({
      auth_user_id: authUser.id,
      email,
      full_name: fullName,
      role: DEFAULT_APP_ROLE,
    })
    .select(appUserColumns)
    .single();

  if (error) {
    if (isMissingAppUsersTable(error)) {
      return null;
    }

    throw new Error(`Utilizatorul aplicatiei nu a putut fi salvat: ${error.message}`);
  }

  return data as AppUser;
}

export async function ensureAppUser(): Promise<AppUser | null> {
  try {
    return await ensureAppUserRow();
  } catch (error) {
    console.warn("App user sync failed.", error);
    return null;
  }
}
