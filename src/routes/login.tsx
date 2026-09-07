import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MfaVerifyForm } from "@/components/mfa-verify-form";
import { ensureAppUser } from "@/lib/appUserService";
import { clearAuthSessionCookie, syncCurrentAuthSessionCookie } from "@/lib/authCookieClient";
import { claimPendingCompanyInvite } from "@/lib/companyMembersService";
import { needsMfaChallenge } from "@/lib/mfaService";
import { supabase } from "@/lib/supabaseClient";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Autentificare — IMMapp" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [awaitingMfa, setAwaitingMfa] = useState(false);

  function getLoginErrorMessage(message: string) {
    const normalizedMessage = message.toLowerCase();

    if (normalizedMessage.includes("email not confirmed")) {
      return "Contul nu este activ pentru autentificare. Verifica setarile de confirmare email.";
    }

    if (
      normalizedMessage.includes("invalid login credentials") ||
      normalizedMessage.includes("invalid credentials")
    ) {
      return "Email sau parola incorecta.";
    }

    return "Autentificarea nu a reusit. Incearca din nou.";
  }

  const completeLogin = async () => {
    await syncCurrentAuthSessionCookie().catch((error) => {
      console.warn("Server auth cookie sync failed after login.", error);
    });

    try {
      await ensureAppUser();
    } catch (error) {
      console.warn("App user sync failed after login.", error);
    }

    const claimedInvite = await claimPendingCompanyInvite();

    if (claimedInvite) {
      toast.success("Te-ai alaturat companiei la care ai fost invitat.");
    } else {
      toast.success("Autentificare reusita.");
    }

    await navigate({ to: "/app", replace: true });
  };

  const handleMfaCancelled = () => {
    setAwaitingMfa(false);
    void supabase.auth.signOut().finally(() => {
      void clearAuthSessionCookie().catch(() => undefined);
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const message = getLoginErrorMessage(error.message);
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      if (await needsMfaChallenge()) {
        setAwaitingMfa(true);
        return;
      }

      await completeLogin();
    } catch {
      const message = "Autentificarea nu a reusit. Incearca din nou.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (awaitingMfa) {
    return <MfaVerifyForm onVerified={completeLogin} onCancel={handleMfaCancelled} />;
  }

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
            <h1 className="text-xl font-semibold">Autentificare</h1>
            <p className="mt-1 text-sm text-muted-foreground">Conectează-te la contul IMMapp.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="nume@firma.ro"
                  disabled={isSubmitting}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Parolă</Label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                    Ai uitat parola?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  disabled={isSubmitting}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Autentificare
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Nu ai cont?{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">
                Creează cont
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
