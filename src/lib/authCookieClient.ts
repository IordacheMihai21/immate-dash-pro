import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type SessionCookiePayload = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
};

async function requestSessionCookie(method: "POST" | "DELETE", payload?: SessionCookiePayload) {
  const response = await fetch("/api/auth/session", {
    method,
    headers: payload ? { "content-type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });

  if (!response.ok) {
    throw new Error("Sesiunea server nu a putut fi sincronizata.");
  }
}

export async function syncAuthSessionCookie(session: Session | null) {
  if (!session) {
    await requestSessionCookie("DELETE");
    return;
  }

  await requestSessionCookie("POST", {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
  });
}

export async function syncCurrentAuthSessionCookie() {
  const { data } = await supabase.auth.getSession();
  await syncAuthSessionCookie(data.session ?? null);
}

export async function clearAuthSessionCookie() {
  await requestSessionCookie("DELETE");
}
