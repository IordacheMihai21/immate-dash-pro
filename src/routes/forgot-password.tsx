import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, Loader2, MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Resetare parolă — IMMapp" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        const message = "Nu am putut trimite emailul de resetare. Incearca din nou.";
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      setSent(true);
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
            {sent ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <MailCheck className="h-6 w-6" />
                </div>
                <h1 className="text-xl font-semibold">Verifica-ti emailul</h1>
                <p className="text-sm text-muted-foreground">
                  Daca exista un cont asociat acestei adrese, ti-am trimis un link de resetare a
                  parolei. Linkul este valabil o perioada limitata.
                </p>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold">Resetare parolă</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Introdu emailul contului și îți vom trimite instrucțiunile.
                </p>
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
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Trimite link de resetare
                  </Button>
                </form>
              </>
            )}
            <p className="mt-6 text-center text-sm text-muted-foreground">
              <Link to="/login" className="font-medium text-primary hover:underline">
                Înapoi la autentificare
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
