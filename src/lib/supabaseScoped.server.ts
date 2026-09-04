import { createClient } from "@supabase/supabase-js";

// Server-only. Builds a Supabase client scoped to one caller's access
// token, so every query runs with that user's own RLS permissions --
// the same approach used to lock down the Document AI backend earlier.
// Use this (not the service-role client) for any server function a
// logged-in user calls directly, so a user can only ever act on data
// they're already allowed to see.

export function getScopedSupabaseClient(accessToken: string) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL/SUPABASE_ANON_KEY nu sunt configurate pe server.");
  }

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function getVerifiedUserId(accessToken: string): Promise<string> {
  const client = getScopedSupabaseClient(accessToken);
  const { data, error } = await client.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error("Sesiune invalida sau expirata.");
  }

  return data.user.id;
}
