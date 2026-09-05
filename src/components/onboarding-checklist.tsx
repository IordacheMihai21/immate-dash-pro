import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useOnboardingStatus } from "@/hooks/use-onboarding-status";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "immapp:onboarding-dismissed";

export function OnboardingChecklist() {
  const { data, isLoading } = useOnboardingStatus();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  function handleDismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // localStorage unavailable -- dismissal just won't persist across reloads
    }
    setDismissed(true);
  }

  if (isLoading || !data || dismissed || data.completedCount === data.totalCount) {
    return null;
  }

  const progress = Math.round((data.completedCount / data.totalCount) * 100);

  return (
    <Card className="border-primary/20 bg-primary/[0.03]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">Primii pasi in IMMapp</p>
              <p className="text-xs text-muted-foreground">
                {data.completedCount} din {data.totalCount} finalizati
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-1 -mt-1 h-7 w-7 shrink-0"
            onClick={handleDismiss}
            aria-label="Ascunde acest panou"
            title="Ascunde"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Progress value={progress} className="mt-3 h-1.5" />

        <div className="mt-4 space-y-1">
          {data.steps.map((step) => (
            <Link
              key={step.id}
              to={step.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-muted",
                step.done && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                  step.done
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-transparent",
                )}
              >
                <Check className="h-3 w-3" />
              </span>
              <span className="flex-1">
                <span
                  className={cn(
                    "font-medium text-foreground",
                    step.done && "line-through decoration-muted-foreground/60",
                  )}
                >
                  {step.label}
                </span>
                <span className="block text-xs text-muted-foreground">{step.description}</span>
              </span>
              {!step.done ? (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : null}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
