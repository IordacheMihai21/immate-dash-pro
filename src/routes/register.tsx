import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Building2, CheckCircle2, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { verifyCuiWithAnaf } from "@/lib/api/anaf.functions";
import { ensureAppUser } from "@/lib/appUserService";
import { syncAuthSessionCookie } from "@/lib/authCookieClient";
import { claimPendingCompanyInvite } from "@/lib/companyMembersService";
import { upsertCompanyProfile } from "@/lib/companyService";
import { supabase } from "@/lib/supabaseClient";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Înregistrare — IMMapp" }] }),
  component: RegisterPage,
});

function getSignupErrorMessage(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("already registered") ||
    normalizedMessage.includes("already exists")
  ) {
    return "Exista deja un cont cu acest email. Incearca sa te autentifici in schimb.";
  }

  if (normalizedMessage.includes("password")) {
    return "Parola nu indeplineste cerintele minime (cel putin 6 caractere).";
  }

  if (normalizedMessage.includes("email") && normalizedMessage.includes("invalid")) {
    return "Adresa de email nu este valida.";
  }

  if (normalizedMessage.includes("rate limit")) {
    return "Prea multe incercari intr-un timp scurt. Asteapta cateva minute si incearca din nou.";
  }

  return `Contul nu a putut fi creat: ${message}`;
}

function RegisterPage() {
  const navigate = useNavigate();
  const [cuiVerified, setCuiVerified] = useState(false);
  const [isVerifyingCui, setIsVerifyingCui] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const verifyCui = async () => {
    const cuiInput = document.getElementById("cui") as HTMLInputElement | null;
    const cui = cuiInput?.value.trim() ?? "";

    if (!cui) {
      toast.error("Introdu CUI-ul firmei inainte de verificare.");
      return;
    }

    setCuiVerified(false);
    setIsVerifyingCui(true);

    try {
      const result = await verifyCuiWithAnaf({ data: { cui } });

      const companyNameInput = document.getElementById("companyName") as HTMLInputElement | null;
      const regComInput = document.getElementById("regCom") as HTMLInputElement | null;
      const addressInput = document.getElementById("address") as HTMLInputElement | null;

      if (companyNameInput && result.companyName) {
        companyNameInput.value = result.companyName;
      }

      if (regComInput && result.registrationNumber) {
        regComInput.value = result.registrationNumber;
      }

      if (addressInput && result.address) {
        addressInput.value = result.address;
      }

      setCuiVerified(true);
      toast.success(
        result.vatPayer
          ? "CUI valid. Datele companiei au fost preluate de la ANAF (platitor de TVA)."
          : "CUI valid. Datele companiei au fost preluate de la ANAF.",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "CUI-ul nu a putut fi verificat. Incearca din nou.";
      toast.error(message);
    } finally {
      setIsVerifyingCui(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");
    setStatusMessage("");

    const formData = new FormData(event.currentTarget);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const companyName = String(formData.get("companyName") ?? "").trim();
    const cui = String(formData.get("cui") ?? "").trim();
    const registrationNumber = String(formData.get("registrationNumber") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const fullName = `${firstName} ${lastName}`.trim();

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            name: fullName,
            company_name: companyName,
            cui,
            registration_number: registrationNumber,
            address,
          },
        },
      });

      if (error) {
        const message = getSignupErrorMessage(error.message);
        setErrorMessage(message);
        toast.error(message);
        return;
      }

      if (!data.session) {
        const message =
          "Contul a fost creat, dar autentificarea automata nu a pornit. Incearca autentificarea cu emailul si parola.";
        setStatusMessage(message);
        toast.success(message);
        return;
      }

      await syncAuthSessionCookie(data.session).catch((error) => {
        console.warn("Server auth cookie sync failed after registration.", error);
      });

      await ensureAppUser();

      const claimedInvite = await claimPendingCompanyInvite();

      if (claimedInvite) {
        toast.success("Cont creat cu succes. Te-ai alaturat companiei la care ai fost invitat.");
      } else {
        try {
          await upsertCompanyProfile({
            company_name: companyName,
            cui,
            registration_number: registrationNumber,
            address,
            city: "",
            county: "",
            email,
            phone: "",
            contact_person: fullName,
          });
        } catch (error) {
          console.warn("Company profile sync failed after registration.", error);
          toast.warning("Contul a fost creat, dar datele companiei nu au putut fi salvate.");
        }

        toast.success("Cont creat cu succes.");
      }

      await navigate({ to: "/app", replace: true });
    } catch (error) {
      const message =
        error instanceof Error
          ? `Contul nu a putut fi creat: ${error.message}`
          : "Contul nu a putut fi creat. Incearca din nou.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/40 px-4 py-12">
      <div className="w-full max-w-2xl">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          <span className="text-lg font-semibold">IMMapp</span>
        </Link>
        <Card>
          <CardContent className="p-6">
            <h1 className="text-xl font-semibold">Creează cont IMM</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Înregistrează firma ta în câteva minute.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-6">
              {errorMessage ? (
                <Alert variant="destructive">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              ) : null}

              {statusMessage ? (
                <Alert className="border-primary/20 bg-secondary text-primary">
                  <AlertDescription>{statusMessage}</AlertDescription>
                </Alert>
              ) : null}

              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Date utilizator
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Prenume</Label>
                    <Input id="firstName" name="firstName" disabled={isSubmitting} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nume</Label>
                    <Input id="lastName" name="lastName" disabled={isSubmitting} required />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" disabled={isSubmitting} required />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="password">Parolă</Label>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Date firmă
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="cui">CUI</Label>
                    <div className="flex gap-2">
                      <Input
                        id="cui"
                        name="cui"
                        placeholder="RO12345678"
                        disabled={isSubmitting}
                        required
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={verifyCui}
                        disabled={isSubmitting || isVerifyingCui}
                      >
                        {isVerifyingCui ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Verifică CUI
                      </Button>
                    </div>
                    {cuiVerified && (
                      <p className="flex items-center gap-1.5 text-xs text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> CUI valid, date preluate de la ANAF
                      </p>
                    )}
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="companyName">Denumire firmă</Label>
                    <Input id="companyName" name="companyName" disabled={isSubmitting} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regCom">Nr. Registrul Comerțului</Label>
                    <Input
                      id="regCom"
                      name="registrationNumber"
                      placeholder="J40/1234/2020"
                      disabled={isSubmitting}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Adresă</Label>
                    <Input id="address" name="address" disabled={isSubmitting} required />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Creează cont
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Ai deja cont?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Autentificare
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
