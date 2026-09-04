import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getScopedSupabaseClient, getVerifiedUserId } from "@/lib/supabaseScoped.server";
import { getStripeClient, getStripePriceId } from "@/lib/stripe.server";

const billingRoles = new Set(["owner", "admin"]);

function getAppBaseUrl(): string {
  return process.env.APP_BASE_URL || "http://localhost:8082";
}

async function getBillingMembership(accessToken: string) {
  const userId = await getVerifiedUserId(accessToken);
  const scoped = getScopedSupabaseClient(accessToken);

  const { data: membership, error } = await scoped
    .from("company_members")
    .select("company_id, role")
    .eq("auth_user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error || !membership) {
    throw new Error("Nu s-a putut identifica compania contului tau.");
  }

  if (!billingRoles.has(membership.role)) {
    throw new Error("Doar proprietarul sau un administrator poate gestiona facturarea.");
  }

  return { scoped, companyId: membership.company_id as string };
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      accessToken: z.string().min(1),
      plan: z.enum(["business", "companie"]),
      cycle: z.enum(["monthly", "annual"]),
    }),
  )
  .handler(async ({ data }) => {
    const { scoped, companyId } = await getBillingMembership(data.accessToken);

    const [{ data: subscription }, { data: companyProfile }] = await Promise.all([
      scoped
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("company_id", companyId)
        .maybeSingle(),
      scoped.from("company_profiles").select("company_name, email").eq("id", companyId).single(),
    ]);

    const stripe = getStripeClient();
    const priceId = getStripePriceId(data.plan, data.cycle);
    const baseUrl = getAppBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer: subscription?.stripe_customer_id ?? undefined,
      customer_email:
        !subscription?.stripe_customer_id && companyProfile?.email
          ? companyProfile.email
          : undefined,
      client_reference_id: companyId,
      metadata: { company_id: companyId, plan: data.plan, billing_cycle: data.cycle },
      subscription_data: {
        metadata: { company_id: companyId, plan: data.plan, billing_cycle: data.cycle },
      },
      allow_promotion_codes: true,
      // IMMapp already reports TVA itself (see Rapoarte > TVA); Stripe's
      // Managed Payments would additionally calculate and remit tax as
      // merchant of record, which would double up with that and requires
      // a tax_code on every product. Explicitly opted out.
      managed_payments: { enabled: false },
      success_url: `${baseUrl}/app/setari/facturare?checkout=success`,
      cancel_url: `${baseUrl}/app/setari/facturare?checkout=anulat`,
    });

    if (!session.url) {
      throw new Error("Sesiunea de checkout nu a putut fi creata.");
    }

    return { url: session.url };
  });

export const createBillingPortalSession = createServerFn({ method: "POST" })
  .inputValidator(z.object({ accessToken: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { scoped, companyId } = await getBillingMembership(data.accessToken);

    const { data: subscription } = await scoped
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .maybeSingle();

    if (!subscription?.stripe_customer_id) {
      throw new Error("Compania nu are inca niciun abonament platit de gestionat.");
    }

    const stripe = getStripeClient();

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${getAppBaseUrl()}/app/setari/facturare`,
    });

    return { url: portalSession.url };
  });
