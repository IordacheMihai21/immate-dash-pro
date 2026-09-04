import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Loader2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Parolă nouă — IMMapp" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [readyForReset, setReadyForReset] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted && data.session) {
        setReadyForReset(true);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!isMounted) return;
      if (event === "PASSWORD_RECOVERY") {
        setReadyForReset(true);
      }
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (password.length < 8) {
      setErrorMessage("Parola trebuie sa aiba cel putin 8 caractere.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Parolele nu coincid.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const message = "Nu am putut actualiza parola. Cere un nou link de resetare.";
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      toast.success("Parola a fost actualizata.");
      await navigate({ to: "/app", replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold">IMMapp</span>
        </Link>
        <Card>
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold">Alege o parolă nouă</h1>

            {readyForReset ? (
              <>
                <p className="mt-1 text-sm text-muted-foreground">
                  Introdu noua parolă pentru contul tău.
                </p>
                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  {errorMessage ? (
                    <Alert variant="destructive">
                      <AlertDescription>{errorMessage}</AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="space-y-2">
                    <Label htmlFor="password">Parolă nouă</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      disabled={isSubmitting}
                      required
                      minLength={8}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmă parola</Label>
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      disabled={isSubmitting}
                      required
                      minLength={8}
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Actualizează parola
                  </Button>
                </form>
              </>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">
                Acest link de resetare este invalid sau a expirat.{" "}
                <Link to="/forgot-password" className="font-medium text-primary hover:underline">
                  Cere unul nou
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
