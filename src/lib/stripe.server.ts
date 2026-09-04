import Stripe from "stripe";

// Server-only. The .server.ts suffix keeps this out of the client bundle --
// STRIPE_SECRET_KEY must never reach the browser.

export type BillingPlan = "business" | "companie";
export type BillingCycle = "monthly" | "annual";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error(
        "STRIPE_SECRET_KEY nu este configurat. Adauga-l in .env (vezi .env.example).",
      );
    }

    stripeClient = new Stripe(secretKey, {
      typescript: true,
    });
  }

  return stripeClient;
}

/**
 * Maps a plan + billing cycle to a Stripe Price ID. Each price must be
 * created in the Stripe dashboard first (Product catalog), then its ID
 * pasted into the matching env var -- see .env.example.
 */
export function getStripePriceId(plan: BillingPlan, cycle: BillingCycle): string {
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}` as
    | "STRIPE_PRICE_BUSINESS_MONTHLY"
    | "STRIPE_PRICE_BUSINESS_ANNUAL"
    | "STRIPE_PRICE_COMPANIE_MONTHLY"
    | "STRIPE_PRICE_COMPANIE_ANNUAL";

  const priceId = process.env[envKey];

  if (!priceId) {
    throw new Error(
      `${envKey} nu este configurat. Creeaza pretul in Stripe (Product catalog) si adauga ID-ul in .env.`,
    );
  }

  return priceId;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET nu este configurat. Vezi .env.example.");
  }

  return secret;
}

const PLAN_CYCLES: Array<{ plan: BillingPlan; cycle: BillingCycle }> = [
  { plan: "business", cycle: "monthly" },
  { plan: "business", cycle: "annual" },
  { plan: "companie", cycle: "monthly" },
  { plan: "companie", cycle: "annual" },
];

/**
 * Reverse of getStripePriceId(): given a Stripe Price ID actually on a
 * subscription right now, tells you which plan/cycle it is. Needed because
 * subscription.metadata.plan is only set at checkout time -- if a customer
 * switches plans from the Customer Portal (not our checkout flow), the
 * metadata goes stale but the live price on the subscription is always
 * correct. The webhook handler uses this as the source of truth instead of
 * metadata.
 */
export function getPlanFromPriceId(
  priceId: string | null | undefined,
): { plan: BillingPlan; cycle: BillingCycle } | null {
  if (!priceId) {
    return null;
  }

  for (const { plan, cycle } of PLAN_CYCLES) {
    if (getStripePriceId(plan, cycle) === priceId) {
      return { plan, cycle };
    }
  }

  return null;
}

/**
 * Every (plan, cycle) Price ID configured in .env, paired with its Stripe
 * Product ID (fetched live -- we only store Price IDs in env). Used to
 * enable Customer Portal plan-switching restricted to exactly these prices,
 * so a customer can't "switch" to some unrelated price in the account.
 */
async function getConfiguredProductPrices(): Promise<
  Map<string, { plan: BillingPlan; cycle: BillingCycle; productId: string }>
> {
  const stripe = getStripeClient();
  const byProduct = new Map<
    string,
    { plan: BillingPlan; cycle: BillingCycle; productId: string }
  >();

  for (const { plan, cycle } of PLAN_CYCLES) {
    const priceId = getStripePriceId(plan, cycle);
    const price = await stripe.prices.retrieve(priceId);
    const productId = typeof price.product === "string" ? price.product : price.product.id;
    byProduct.set(priceId, { plan, cycle, productId });
  }

  return byProduct;
}

let portalConfiguredOnce = false;

/**
 * Enables "switch plans" in the Customer Portal, restricted to exactly the
 * 4 configured Business/Companie prices -- previously left disabled (see
 * STRIPE_SETUP.md) because the webhook didn't recognize portal-initiated
 * plan changes. Now that upsertSubscriptionFromStripe reads the live price
 * off the subscription instead of stale checkout metadata, it's safe to
 * turn on. Updates whichever configuration is currently the account
 * default, preserving its other feature settings (cancellation, invoice
 * history, etc.) rather than overwriting them. Runs once per warm process
 * -- idempotent, so a redundant run on cold start is harmless.
 */
export async function ensurePortalPlanSwitchingEnabled(): Promise<void> {
  if (portalConfiguredOnce) {
    return;
  }

  const stripe = getStripeClient();
  const priceInfo = await getConfiguredProductPrices();

  const productToPrices = new Map<string, string[]>();
  for (const [priceId, info] of priceInfo) {
    const existing = productToPrices.get(info.productId) ?? [];
    existing.push(priceId);
    productToPrices.set(info.productId, existing);
  }

  const configurations = await stripe.billingPortal.configurations.list({ limit: 100 });
  const defaultConfiguration =
    configurations.data.find((configuration) => configuration.is_default) ?? configurations.data[0];

  if (!defaultConfiguration) {
    // No portal configuration exists yet at all -- happens on a brand new
    // account that has never opened the Customer Portal in the dashboard.
    // Nothing to update against; the first real portal session will make
    // Stripe create one, and this function will configure it on the
    // following call.
    return;
  }

  await stripe.billingPortal.configurations.update(defaultConfiguration.id, {
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: Array.from(productToPrices.entries()).map(([productId, prices]) => ({
          product: productId,
          prices,
        })),
      },
    },
  });

  portalConfiguredOnce = true;
}
