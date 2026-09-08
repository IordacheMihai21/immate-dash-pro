import { isStaffEmail } from "./staffAccess.server";

export type ServerAuthUser = {
  id: string;
  email: string | null;
  isStaff: boolean;
};

export type ServerAuthSession = {
  user: ServerAuthUser | null;
  setCookieHeaders: string[];
};

const ACCESS_COOKIE = "immapp_sb_access_token";
const REFRESH_COOKIE = "immapp_sb_refresh_token";
const DEFAULT_ACCESS_MAX_AGE_SECONDS = 60 * 60;
const REFRESH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSupabaseAuthConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

function isSecureCookie() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.APP_ENV === "production" ||
    process.env.DOCUMENT_AI_ENV === "production"
  );
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (isSecureCookie()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function clearCookie(name: string) {
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  if (isSecureCookie()) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function getClearedServerAuthCookies() {
  return [clearCookie(ACCESS_COOKIE), clearCookie(REFRESH_COOKIE)];
}

export function getServerAuthCookies(
  accessToken: string,
  refreshToken: string,
  expiresInSeconds = DEFAULT_ACCESS_MAX_AGE_SECONDS,
) {
  return [
    serializeCookie(ACCESS_COOKIE, accessToken, expiresInSeconds),
    serializeCookie(REFRESH_COOKIE, refreshToken, REFRESH_MAX_AGE_SECONDS),
  ];
}

function parseCookies(cookieHeader: string | null) {
  const cookies: Record<string, string> = {};

  for (const part of (cookieHeader ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) {
      continue;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join("="));
  }

  return cookies;
}

function getAuthCookies(request: Request) {
  const cookies = parseCookies(request.headers.get("cookie"));

  return {
    accessToken: cookies[ACCESS_COOKIE] || "",
    refreshToken: cookies[REFRESH_COOKIE] || "",
  };
}

async function verifyAccessToken(accessToken: string): Promise<ServerAuthUser | null> {
  const config = getSupabaseAuthConfig();

  if (!config || !accessToken) {
    return null;
  }

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: config.anonKey,
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as { id?: string; email?: string | null };

  return data.id
    ? { id: data.id, email: data.email ?? null, isStaff: isStaffEmail(data.email) }
    : null;
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: ServerAuthUser | null;
} | null> {
  const config = getSupabaseAuthConfig();

  if (!config || !refreshToken) {
    return null;
  }

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    user?: { id?: string; email?: string | null };
  };

  if (!data.access_token || !data.refresh_token) {
    return null;
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? DEFAULT_ACCESS_MAX_AGE_SECONDS,
    user: data.user?.id
      ? {
          id: data.user.id,
          email: data.user.email ?? null,
          isStaff: isStaffEmail(data.user.email),
        }
      : null,
  };
}

export async function getServerAuthSession(request: Request): Promise<ServerAuthSession> {
  const { accessToken, refreshToken } = getAuthCookies(request);
  const verifiedUser = await verifyAccessToken(accessToken);

  if (verifiedUser) {
    return { user: verifiedUser, setCookieHeaders: [] };
  }

  const refreshed = await refreshAccessToken(refreshToken);

  if (!refreshed) {
    return {
      user: null,
      setCookieHeaders: accessToken || refreshToken ? getClearedServerAuthCookies() : [],
    };
  }

  const user = refreshed.user ?? (await verifyAccessToken(refreshed.accessToken));

  if (!user) {
    return { user: null, setCookieHeaders: getClearedServerAuthCookies() };
  }

  return {
    user,
    setCookieHeaders: getServerAuthCookies(
      refreshed.accessToken,
      refreshed.refreshToken,
      refreshed.expiresIn,
    ),
  };
}
