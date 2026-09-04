import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin.server";
import { getPlanFromPriceId, getStripeClient, getStripeWebhookSecret } from "@/lib/stripe.server";

// Stripe -> IMMapp webhook. This is the ONLY place subscription status is
// ever written -- never trust a client-reported "I paid", always trust
// Stripe's own signed event. See supabase/migrations/20260904_add_subscriptions.sql
// for why the table itself also refuses any client-side write.
//
// LIVE-VERIFIED end-to-end on 2026-09-04 (API version 2026-08-26.dahlia,
// via `stripe listen` against a real Stripe test-mode account, not just
// written to the docs): checkout.session.completed, a real checkout, the
// cancel-at-period-end path, a real Customer Portal PLAN SWITCH (Business ->
// Companie, confirmed the DB picked up the new plan from the subscription's
// live price -- see getPlanFromPriceId in stripe.server.ts, not from
// checkout-time metadata, which goes stale exactly on a portal-initiated
// switch), and a real immediate cancellation (customer.subscription.deleted,
// confirmed the company reverts to the free "start" plan with no stale
// current_period_end left behind).

export const Route = createFileRoute("/api/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const signature = request.headers.get("stripe-signature");

        if (!signature) {
          return new Response("Missing stripe-signature header", { status: 400 });
        }

        const rawBody = await request.text();
        const stripe = getStripeClient();

        let event: Stripe.Event;

        try {
          event = stripe.webhooks.constructEvent(rawBody, signature, getStripeWebhookSecret());
        } catch (error) {
          console.error("Stripe webhook signature verification failed", error);
          return new Response("Invalid signature", { status: 400 });
        }

        try {
          await handleStripeEvent(event);
        } catch (error) {
          // Return 500 so Stripe retries -- swallowing this would silently
          // desync billing state from what the customer actually paid for.
          console.error(`Stripe webhook handler failed for ${event.type}`, error);
          return new Response("Webhook handler error", { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.mode !== "subscription" || !session.subscription) {
        return;
      }

      const companyId = session.metadata?.company_id ?? session.client_reference_id;

      if (!companyId) {
        console.error("checkout.session.completed missing company_id metadata", session.id);
        return;
      }

      const stripe = getStripeClient();
      const subscription = await stripe.subscriptions.retrieve(
        typeof session.subscription === "string" ? session.subscription : session.subscription.id,
      );

      await upsertSubscriptionFromStripe(companyId, subscription, {
        plan: session.metadata?.plan,
        billingCycle: session.metadata?.billing_cycle,
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : session.customer?.id,
      });
      return;
    }

    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      const companyId = subscription.metadata?.company_id;

      if (!companyId) {
        console.error(`${event.type} missing company_id metadata`, subscription.id);
        return;
      }

      await upsertSubscriptionFromStripe(companyId, subscription, {
        plan: subscription.metadata?.plan,
        billingCycle: subscription.metadata?.billing_cycle,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const companyId = subscription.metadata?.company_id;

      if (!companyId) {
        console.error("customer.subscription.deleted missing company_id metadata", subscription.id);
        return;
      }

      const admin = getSupabaseAdminClient();
      const { error } = await admin
        .from("subscriptions")
        .update({
          plan: "start",
          status: "canceled",
          stripe_subscription_id: null,
          // LIVE-VERIFIED (2026-09-04): leaving the previous paid
          // subscription's current_period_end in place made the billing
          // page show "Se reinnoieste pe <old date>" for a company that had
          // just reverted to the free plan -- found by triggering a real
          // subscription.deleted event and checking the UI, not by
          // inspection.
          current_period_end: null,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);

      if (error) {
        throw new Error(`Failed to revert subscription to free plan: ${error.message}`);
      }
      return;
    }

    default:
      // Unhandled event types are expected and fine to ignore -- Stripe
      // sends far more event types than this integration needs to react to.
      return;
  }
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "incomplete":
    case "unpaid":
      return status;
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "past_due";
    default:
      return "incomplete";
  }
}

async function upsertSubscriptionFromStripe(
  companyId: string,
  subscription: Stripe.Subscription,
  extra: { plan?: string; billingCycle?: string; stripeCustomerId?: string },
): Promise<void> {
  const admin = getSupabaseAdminClient();

  // Source of truth for plan/cycle is the price actually on the subscription
  // right now, not extra.plan/billingCycle (checkout-time metadata). Metadata
  // only reflects what was chosen at the original checkout -- if the
  // customer later switches plans from the Customer Portal (see
  // ensurePortalPlanSwitchingEnabled in stripe.server.ts), that happens
  // entirely on Stripe's side and never touches our metadata, so relying on
  // it would silently keep showing the old plan after a real portal switch.
  const livePriceId = subscription.items.data[0]?.price?.id;
  const livePlan = getPlanFromPriceId(livePriceId);

  // Fallback path for metadata is defensive only (e.g. a price ID that
  // somehow isn't one of the 4 configured ones) -- expected to never
  // actually trigger in normal operation.

  // LIVE-VERIFIED 2026-09-04: on API version 2026-08-26.dahlia, the top-level
  // `current_period_end` is what's actually present (confirmed via a real
  // checkout: the row landed with the correct one-year-out timestamp).
  // Kept the subscription-items fallback for older/different API versions,
  // since Stripe has moved this field around across versions before.
  const currentPeriodEndSeconds =
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    subscription.items.data[0]?.current_period_end;

  const { error } = await admin.from("subscriptions").upsert(
    {
      company_id: companyId,
      stripe_customer_id:
        extra.stripeCustomerId ??
        (typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id),
      stripe_subscription_id: subscription.id,
      plan:
        livePlan?.plan ??
        (extra.plan && ["business", "companie"].includes(extra.plan) ? extra.plan : "business"),
      billing_cycle:
        livePlan?.cycle ??
        (extra.billingCycle && ["monthly", "annual"].includes(extra.billingCycle)
          ? extra.billingCycle
          : null),
      status: mapStripeStatus(subscription.status),
      current_period_end: currentPeriodEndSeconds
        ? new Date(currentPeriodEndSeconds * 1000).toISOString()
        : null,
      // LIVE-VERIFIED (2026-09-04, API version 2026-08-26.dahlia): canceling
      // via the Customer Portal sets `cancel_at` to the period-end
      // timestamp, NOT the legacy `cancel_at_period_end` boolean, which
      // stayed false throughout. Checking both so a real cancellation is
      // never missed regardless of which field Stripe actually sets.
      cancel_at_period_end:
        Boolean(subscription.cancel_at_period_end) || subscription.cancel_at != null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert subscription: ${error.message}`);
  }
}
