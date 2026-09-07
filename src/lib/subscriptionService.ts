import { createCheckoutSession, createBillingPortalSession } from "@/lib/api/billing.functions";
import { getActiveCompanyId } from "@/lib/companyService";
import { supabase } from "@/lib/supabaseClient";

export type Plan = "start" | "business" | "companie";
export type BillingCycle = "monthly" | "annual" | null;
export type SubscriptionStatus =
  "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid";

export type Subscription = {
  plan: Plan;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

const planColumns = "plan, billing_cycle, status, current_period_end, cancel_at_period_end";

export async function getSubscription(): Promise<Subscription> {
  const companyId = await getActiveCompanyId();

  const { data, error } = await supabase
    .from("subscriptions")
    .select(planColumns)
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    throw new Error(`Abonamentul nu a putut fi citit: ${error.message}`);
  }

  if (!data) {
    // Every company gets a row via a database trigger at creation time; a
    // missing row means it predates the trigger and never got a backfill.
    return {
      plan: "start",
      billingCycle: null,
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    plan: data.plan as Plan,
    billingCycle: data.billing_cycle as BillingCycle,
    status: data.status as SubscriptionStatus,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
  };
}

async function requireAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Trebuie sa fii autentificat.");
  }

  return token;
}

export async function startCheckout(
  plan: "business" | "companie",
  cycle: "monthly" | "annual",
): Promise<void> {
  const accessToken = await requireAccessToken();
  const { url } = await createCheckoutSession({ data: { accessToken, plan, cycle } });
  window.location.href = url;
}

export async function openBillingPortal(): Promise<void> {
  const accessToken = await requireAccessToken();
  const { url } = await createBillingPortalSession({ data: { accessToken } });
  window.location.href = url;
}
