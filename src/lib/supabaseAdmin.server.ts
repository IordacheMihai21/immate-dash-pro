import { createClient } from "@supabase/supabase-js";

// Server-only, service-role Supabase client. Bypasses RLS entirely --
// this is intentional and required for the Stripe webhook handler (which
// has no user session context, since Stripe calls it directly) to write
// subscription status. Never import this from client code or a component;
// the .server.ts suffix keeps it out of the browser bundle, but treat the
// key itself as the most sensitive secret in this project regardless --
// a leak grants full read/write on every table, in every company.
//
// Used ONLY by the Stripe webhook handler. Every other server function
// (checkout, billing portal) must instead use a request-scoped client
// (anon key + the caller's access token) so RLS enforces who can act on
// which company -- see src/lib/api/billing.functions.ts.

export function getSupabaseAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nu sunt configurate. Vezi .env.example.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
