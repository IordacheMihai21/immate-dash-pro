import type { User as SupabaseUser } from "@supabase/supabase-js";
import {
  DEFAULT_APP_ROLE,
  ensureAppUser,
  getAuthUserMetadataName,
  getCurrentAuthUser,
  type AppUser,
} from "./appUserService";

export type CurrentUserProfile = {
  displayName: string;
  email: string;
  initials: string;
  role: string;
};

const fallbackUserProfile: CurrentUserProfile = {
  displayName: "Utilizator IMMapp",
  email: "",
  initials: "UI",
  role: DEFAULT_APP_ROLE,
};

function getInitials(displayName: string, email: string) {
  const source = displayName || email || fallbackUserProfile.displayName;
  const parts = source
    .split(/[\s.@_-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  return source.slice(0, 2).toUpperCase();
}

export function buildCurrentUserProfile(
  user: SupabaseUser | null,
  appUser?: AppUser | null,
): CurrentUserProfile {
  const email = user?.email?.trim() || appUser?.email?.trim() || "";
  const displayName =
    getAuthUserMetadataName(user) ||
    appUser?.full_name?.trim() ||
    email ||
    fallbackUserProfile.displayName;
  const role = appUser?.role?.trim() || DEFAULT_APP_ROLE;

  return {
    displayName,
    email,
    initials: getInitials(displayName, email),
    role,
  };
}

export async function getCurrentUserProfile(): Promise<CurrentUserProfile> {
  const authUser = await getCurrentAuthUser();

  if (!authUser) {
    return fallbackUserProfile;
  }

  try {
    const appUser = await ensureAppUser();

    return buildCurrentUserProfile(authUser, appUser);
  } catch {
    return buildCurrentUserProfile(authUser);
  }
}
