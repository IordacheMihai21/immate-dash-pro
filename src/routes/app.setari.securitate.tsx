import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import {
  cancelTotpEnrollment,
  disableMfaFactor,
  listVerifiedTotpFactors,
  startTotpEnrollment,
  verifyTotpCode,
  type MfaEnrollment,
  type MfaFactor,
} from "@/lib/mfaService";

export const Route = createFileRoute("/app/setari/securitate")({
  head: () => ({ meta: [{ title: "Securitate - IMMapp" }] }),
  component: SecurityPage,
});

type ViewState = "loading" | "disabled" | "enrolling" | "enabled";

function SecurityPage() {
  const [view, setView] = useState<ViewState>("loading");
  const [factor, setFactor] = useState<MfaFactor | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const refreshFactors = async () => {
    try {
      const factors = await listVerifiedTotpFactors();
      setFactor(factors[0] ?? null);
      setView(factors[0] ? "enabled" : "disabled");
    } catch {
      // The session may have ended (e.g. sign-out mid-flight) between this
      // page mounting and the request resolving -- nothing to show for it.
      setView("disabled");
    }
  };

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const factors = await listVerifiedTotpFactors();

        if (isMounted) {
          setFactor(factors[0] ?? null);
          setView(factors[0] ? "enabled" : "disabled");
        }
      } catch {
        if (isMounted) {
          setView("disabled");
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleStartEnrollment = async () => {
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const result = await startTotpEnrollment();
      setEnrollment(result);
      setView("enrolling");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Eroare necunoscuta.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelEnrollment = async () => {
    if (enrollment) {
      await cancelTotpEnrollment(enrollment.factorId);
    }
    setEnrollment(null);
    setCode("");
    setErrorMessage("");
    setView("disabled");
  };

  const handleVerifyEnrollment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!enrollment) {
      return;
    }

    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await verifyTotpCode(enrollment.factorId, code);
      toast.success("Autentificarea in doi pasi este activa.");
      setEnrollment(null);
      setCode("");
      await refreshFactors();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Cod incorect. Incearca din nou.");
      setCode("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async () => {
    if (!factor) {
      return;
    }

    setIsSubmitting(true);

    try {
      await disableMfaFactor(factor.id);
      toast.success("Autentificarea in doi pasi a fost dezactivata.");
      await refreshFactors();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Eroare necunoscuta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Securitate"
        description="Adauga un nivel suplimentar de protectie pentru contul tau IMMapp."
      />

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="border-b border-border p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-secondary p-3 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Autentificare in doi pasi
              </CardTitle>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Cere un cod din aplicatia de autentificare (Google Authenticator, Authy, 1Password
                etc.) la fiecare autentificare noua, pe langa parola.
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-5">
          {view === "loading" ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se verifica starea contului...
            </div>
          ) : null}

          {view === "disabled" ? (
            <div className="flex flex-col items-start gap-4 rounded-2xl bg-muted p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Neactivata</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Contul tau foloseste doar email si parola momentan.
                </p>
              </div>
              <Button onClick={handleStartEnrollment} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Activeaza
              </Button>
            </div>
          ) : null}

          {view === "enabled" && factor ? (
            <div className="flex flex-col items-start gap-4 rounded-2xl bg-success/10 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Activa</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Activata pe {new Date(factor.createdAt).toLocaleDateString("ro-RO")}.
                  </p>
                </div>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" disabled={isSubmitting}>
                    <ShieldOff className="h-4 w-4" />
                    Dezactiveaza
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Dezactivezi autentificarea in doi pasi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Contul tau va putea fi accesat doar cu email si parola. Poti reactiva oricand
                      din aceasta pagina.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Anuleaza</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDisable}>Dezactiveaza</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : null}

          {view === "enrolling" && enrollment ? (
            <div className="grid gap-6 md:grid-cols-[minmax(0,220px)_1fr]">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl border border-border bg-white p-3">
                  <img
                    src={enrollment.qrCode}
                    alt="Cod QR pentru configurare"
                    className="h-40 w-40"
                  />
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  Scaneaza codul cu aplicatia de autentificare
                </p>
              </div>

              <form onSubmit={handleVerifyEnrollment} className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
                  <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>Nu poti scana codul? Introdu manual aceasta cheie in aplicatie:</p>
                    <code className="mt-1 block break-all rounded bg-card px-2 py-1 font-mono text-foreground">
                      {enrollment.secret}
                    </code>
                  </div>
                </div>

                {errorMessage ? (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="enroll-code">Cod de 6 cifre din aplicatie</Label>
                  <Input
                    id="enroll-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    className="text-center text-lg tracking-[0.5em]"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                    disabled={isSubmitting}
                    autoFocus
                    required
                  />
                </div>

                <div className="flex gap-2">
                  <Button type="submit" disabled={isSubmitting || code.length !== 6}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Confirma si activeaza
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleCancelEnrollment}
                    disabled={isSubmitting}
                  >
                    Anuleaza
                  </Button>
                </div>
              </form>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
