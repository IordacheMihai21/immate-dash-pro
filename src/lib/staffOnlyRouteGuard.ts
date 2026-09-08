import { redirect } from "@tanstack/react-router";
import { checkIsStaff } from "@/lib/api/staff.functions";
import { supabase } from "@/lib/supabaseClient";

type ServerContext = { authUser?: { isStaff?: boolean } | null } | undefined;

// Gates a route to IMMapp's own team (see staffAccess.server.ts). On the
// SSR pass, serverContext.authUser.isStaff is already computed from the
// verified session cookie (see serverAuth.server.ts) -- no extra round
// trip needed. On client-side navigation there's no fresh serverContext,
// so the same check is re-run via checkIsStaff, which independently
// re-verifies the session against Supabase (mirrors app.tsx's own
// server/client split for the base login check).
export async function requireStaffAccess(serverContext: ServerContext): Promise<void> {
  if (typeof window === "undefined") {
    if (!serverContext?.authUser?.isStaff) {
      throw redirect({ to: "/app/ai-center" });
    }
    return;
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;

  if (!accessToken) {
    throw redirect({ to: "/login" });
  }

  const { isStaff } = await checkIsStaff({ data: { accessToken } });

  if (!isStaff) {
    throw redirect({ to: "/app/ai-center" });
  }
}
