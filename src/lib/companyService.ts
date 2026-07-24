import { getAuthUserDisplayName, getCurrentAuthUser } from "./appUserService";
import { supabase } from "./supabaseClient";

export type CompanyProfile = {
  id?: string;
  auth_user_id: string;
  company_name: string;
  cui: string;
  registration_number: string;
  address: string;
  city: string;
  county: string;
  email: string;
  phone: string;
  contact_person: string;
  created_at?: string;
  updated_at?: string;
};

export type CompanyProfileInput = Omit<
  CompanyProfile,
  "id" | "auth_user_id" | "created_at" | "updated_at"
>;

export const EMPTY_COMPANY_PROFILE: CompanyProfileInput = {
  company_name: "",
  cui: "",
  registration_number: "",
  address: "",
  city: "",
  county: "",
  email: "",
  phone: "",
  contact_person: "",
};

const profileColumns = `
  id,
  auth_user_id,
  company_name,
  cui,
  registration_number,
  address,
  city,
  county,
  email,
  phone,
  contact_person,
  created_at,
  updated_at
`;

function getStringMetadata(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];

  return typeof value === "string" ? value.trim() : "";
}

function isMissingCompanyProfileSchema(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() ?? "";
  const code = error.code ?? "";

  return (
    code === "42P01" ||
    code === "42703" ||
    ["PGRST200", "PGRST202", "PGRST204", "PGRST205"].includes(code) ||
    (message.includes("company_profiles") &&
      message.includes("relation") &&
      message.includes("does not exist")) ||
    (message.includes("company_profiles") && message.includes("schema cache")) ||
    (message.includes("auth_user_id") && message.includes("does not exist")) ||
    (message.includes("auth_user_id") && message.includes("schema cache")) ||
    (message.includes("id") && message.includes("schema cache"))
  );
}

function cleanProfile(profile: CompanyProfileInput): CompanyProfileInput {
  return {
    company_name: profile.company_name.trim(),
    cui: profile.cui.trim(),
    registration_number: profile.registration_number.trim(),
    address: profile.address.trim(),
    city: profile.city.trim(),
    county: profile.county.trim(),
    email: profile.email.trim(),
    phone: profile.phone.trim(),
    contact_person: profile.contact_person.trim(),
  };
}

export async function getCompanyProfile(): Promise<CompanyProfile | null> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    return null;
  }

  const { data, error } = await supabase
    .from("company_profiles")
    .select(profileColumns)
    .eq("auth_user_id", authUser.id)
    .maybeSingle();

  if (error) {
    if (isMissingCompanyProfileSchema(error)) {
      return null;
    }

    throw new Error(`Profilul companiei nu a putut fi citit: ${error.message}`);
  }

  return (data as CompanyProfile | null) ?? null;
}

export async function upsertCompanyProfile(profile: CompanyProfileInput): Promise<CompanyProfile> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    throw new Error("Trebuie sa fii autentificat pentru a salva profilul companiei.");
  }

  const payload = {
    auth_user_id: authUser.id,
    ...cleanProfile(profile),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("company_profiles")
    .upsert(payload, { onConflict: "auth_user_id" })
    .select(profileColumns)
    .single();

  if (error) {
    throw new Error(`Profilul companiei nu a putut fi salvat: ${error.message}`);
  }

  return data as CompanyProfile;
}

export const updateCompanyProfile = upsertCompanyProfile;

export async function getOrCreateCompanyProfile(): Promise<CompanyProfile> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    throw new Error("Trebuie sa fii autentificat pentru a importa documente.");
  }

  const existingProfile = await getCompanyProfile();

  if (existingProfile) {
    return existingProfile;
  }

  const metadata = authUser.user_metadata ?? {};
  const companyName =
    getStringMetadata(metadata, "company_name") ||
    getStringMetadata(metadata, "companyName") ||
    "Compania mea";
  const contactPerson = getAuthUserDisplayName(authUser);

  return upsertCompanyProfile({
    company_name: companyName,
    cui: getStringMetadata(metadata, "cui"),
    registration_number:
      getStringMetadata(metadata, "registration_number") ||
      getStringMetadata(metadata, "registrationNumber"),
    address: getStringMetadata(metadata, "address"),
    city: getStringMetadata(metadata, "city"),
    county: getStringMetadata(metadata, "county"),
    email: authUser.email?.trim() ?? "",
    phone: getStringMetadata(metadata, "phone"),
    contact_person: contactPerson,
  });
}

export async function getActiveCompanyId(): Promise<string> {
  const profile = await getOrCreateCompanyProfile();

  if (!profile.id) {
    throw new Error("Profilul companiei nu a putut fi pregatit pentru contul curent.");
  }

  return profile.id;
}
