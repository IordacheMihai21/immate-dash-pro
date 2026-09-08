import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getScopedSupabaseClient } from "@/lib/supabaseScoped.server";
import { isStaffEmail } from "@/lib/staffAccess.server";

// Used only for client-side route navigation (no fresh SSR pass to read the
// already-verified serverContext.authUser.isStaff from -- see app.tsx's own
// beforeLoad for the equivalent server/client split on the base login
// check). Always independently re-verifies the token against Supabase
// itself; never trusts a client-supplied email.
export const checkIsStaff = createServerFn({ method: "POST" })
  .validator(z.object({ accessToken: z.string().min(1) }))
  .handler(async ({ data }) => {
    const client = getScopedSupabaseClient(data.accessToken);
    const { data: userData, error } = await client.auth.getUser(data.accessToken);

    if (error || !userData.user) {
      return { isStaff: false };
    }

    return { isStaff: isStaffEmail(userData.user.email) };
  });
