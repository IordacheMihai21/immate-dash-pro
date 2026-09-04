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
