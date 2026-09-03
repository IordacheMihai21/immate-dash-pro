import { ShieldCheck, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listVerifiedTotpFactors, verifyTotpCode } from "@/lib/mfaService";
import { supabase } from "@/lib/supabaseClient";

/**
 * Full-screen TOTP challenge, shown after password login (when the account
 * requires MFA) and as a gate in the app shell (when an existing session
 * has not completed a challenge yet, e.g. after a page refresh).
 */
export function MfaVerifyForm({
  onVerified,
  onCancel,
}: {
  onVerified: () => void;
  onCancel?: () => void;
}) {
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [isLoadingFactor, setIsLoadingFactor] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const factors = await listVerifiedTotpFactors();

        if (!isMounted) {
          return;
        }

        if (factors.length === 0) {
          setErrorMessage(
            "Contul asteapta o verificare in doi pasi, dar niciun factor activ nu a fost gasit. Contacteaza suportul.",
          );
          return;
        }

        setFactorId(factors[0].id);
      } catch (error) {
        if (isMounted) {
          setErrorMessage(error instanceof Error ? error.message : "Eroare necunoscuta.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingFactor(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      await verifyTotpCode(factorId, code);
      onVerified();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Cod incorect. Incearca din nou.");
      setCode("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="p-6">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="mt-4 text-xl font-semibold">Verificare in doi pasi</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Introdu codul din aplicatia de autentificare pentru a continua.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="mfa-code">Cod de 6 cifre</Label>
                <Input
                  id="mfa-code"
                  name="mfa-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  className="text-center text-lg tracking-[0.5em]"
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  disabled={isLoadingFactor || isSubmitting}
                  autoFocus
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoadingFactor || isSubmitting || code.length !== 6 || !factorId}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirma
              </Button>

              {onCancel ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={onCancel}
                  disabled={isSubmitting}
                >
                  Inapoi la autentificare
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => void supabase.auth.signOut()}
                  disabled={isSubmitting}
                >
                  Deconectare
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
