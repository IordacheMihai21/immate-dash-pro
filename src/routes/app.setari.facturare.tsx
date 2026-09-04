import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CreditCard, Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSubscription } from "@/hooks/use-subscription";
import { cn } from "@/lib/utils";
import { openBillingPortal, startCheckout, type Plan } from "@/lib/subscriptionService";

export const Route = createFileRoute("/app/setari/facturare")({
  head: () => ({ meta: [{ title: "Facturare - IMMapp" }] }),
  component: BillingPage,
});

const planLabels: Record<Plan, string> = {
  start: "Start (gratuit)",
  business: "Business",
  companie: "Companie",
};

const paidPlans: { plan: "business" | "companie"; name: string; monthlyPrice: number }[] = [
  { plan: "business", name: "Business", monthlyPrice: 149 },
  { plan: "companie", name: "Companie", monthlyPrice: 349 },
];

function BillingPage() {
  const { data: subscription, isLoading, refetch } = useSubscription();
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [cycle, setCycle] = useState<"monthly" | "annual">("annual");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");

    if (checkout === "success") {
      toast.success("Plata a fost procesata. Planul tau se actualizeaza in cateva secunde.");
      void refetch();
    } else if (checkout === "anulat") {
      toast.info("Checkout anulat. Planul tau nu s-a schimbat.");
    }

    if (checkout) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refetch]);

  async function handleUpgrade(plan: "business" | "companie") {
    setPendingPlan(plan);

    try {
      await startCheckout(plan, cycle);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Checkout-ul nu a putut fi pornit.");
      setPendingPlan(null);
    }
  }

  async function handleManageBilling() {
    setIsOpeningPortal(true);

    try {
      await openBillingPortal();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Portalul de facturare nu a putut fi deschis.",
      );
      setIsOpeningPortal(false);
    }
  }

  const isPaid = subscription && subscription.plan !== "start";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturare"
        description="Planul curent al companiei si gestionarea abonamentului."
      />

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-secondary p-3 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">Plan curent</CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Vezi planul activ si gestioneaza metoda de plata.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-5">
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se incarca abonamentul...
            </div>
          ) : subscription ? (
            <div className="flex flex-col items-start gap-4 rounded-2xl bg-muted p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {planLabels[subscription.plan]}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {subscription.status === "past_due"
                    ? "Plata a esuat -- actualizeaza metoda de plata."
                    : subscription.plan !== "start" &&
                        subscription.cancelAtPeriodEnd &&
                        subscription.currentPeriodEnd
                      ? `Se anuleaza pe ${new Date(subscription.currentPeriodEnd).toLocaleDateString("ro-RO")}.`
                      : subscription.plan !== "start" && subscription.currentPeriodEnd
                        ? `Se reinnoieste pe ${new Date(subscription.currentPeriodEnd).toLocaleDateString("ro-RO")}.`
                        : "Fara costuri, fara card bancar."}
                </p>
              </div>

              {isPaid ? (
                <Button variant="outline" onClick={handleManageBilling} disabled={isOpeningPortal}>
                  {isOpeningPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Gestioneaza abonamentul
                </Button>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!isPaid ? (
        <Card className="border-border bg-card shadow-sm">
          <CardHeader className="border-b border-border p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-secondary p-3 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">
                    Treci la un plan platit
                  </CardTitle>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Facturi nelimitate, jurnal de activitate, autentificare in doi pasi.
                  </p>
                </div>
              </div>

              <div className="inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setCycle("monthly")}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    cycle === "monthly"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  Lunar
                </button>
                <button
                  type="button"
                  onClick={() => setCycle("annual")}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition",
                    cycle === "annual"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  Anual (-17%)
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            {paidPlans.map((plan) => {
              const price =
                cycle === "annual" ? Math.round(plan.monthlyPrice * 0.833) : plan.monthlyPrice;

              return (
                <div key={plan.plan} className="rounded-2xl border border-border p-5">
                  <p className="font-semibold text-foreground">{plan.name}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {price} RON<span className="text-sm text-muted-foreground"> / luna</span>
                  </p>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => handleUpgrade(plan.plan)}
                    disabled={pendingPlan !== null}
                  >
                    {pendingPlan === plan.plan ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Alege {plan.name}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
