import { createFileRoute } from "@tanstack/react-router";
import {
  getClearedServerAuthCookies,
  getServerAuthCookies,
  type ServerAuthUser,
} from "@/lib/serverAuth.server";
import { isStaffEmail } from "@/lib/staffAccess.server";

type AuthSessionPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

function jsonResponse(body: unknown, status = 200, setCookieHeaders: string[] = []) {
  const headers = new Headers({ "content-type": "application/json" });

  for (const cookie of setCookieHeaders) {
    headers.append("set-cookie", cookie);
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function readServerSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}

async function verifyAccessToken(accessToken: string): Promise<ServerAuthUser | null> {
  const config = readServerSupabaseConfig();

  if (!config) {
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

export const Route = createFileRoute("/api/auth/session")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: AuthSessionPayload;

        try {
          payload = (await request.json()) as AuthSessionPayload;
        } catch {
          return jsonResponse({ error: "Payload invalid." }, 400, getClearedServerAuthCookies());
        }

        const accessToken = payload.access_token?.trim() ?? "";
        const refreshToken = payload.refresh_token?.trim() ?? "";

        if (!accessToken || !refreshToken) {
          return jsonResponse({ error: "Sesiune incompleta." }, 400, getClearedServerAuthCookies());
        }

        const user = await verifyAccessToken(accessToken);

        if (!user) {
          return jsonResponse({ error: "Sesiune invalida." }, 401, getClearedServerAuthCookies());
        }

        return jsonResponse(
          { ok: true },
          200,
          getServerAuthCookies(accessToken, refreshToken, payload.expires_in),
        );
      },
      DELETE: async () => jsonResponse({ ok: true }, 200, getClearedServerAuthCookies()),
    },
  },
});
