import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/register")({
  head: () => ({ meta: [{ title: "Înregistrare — IMMapp" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [cuiVerified, setCuiVerified] = useState(false);

  // TODO: connect to backend API for ANAF CUI validation
  const verifyCui = () => {
    setCuiVerified(true);
    toast.success("CUI valid. Datele companiei au fost preluate.");
  };

  // TODO: connect to backend API for registration
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/app" });
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
              <div>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Date utilizator
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Prenume</Label>
                    <Input id="firstName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nume</Label>
                    <Input id="lastName" required />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" required />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="password">Parolă</Label>
                    <Input id="password" type="password" required />
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
                      <Input id="cui" placeholder="RO12345678" required />
                      <Button type="button" variant="outline" onClick={verifyCui}>
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
                    <Input id="companyName" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="regCom">Nr. Registrul Comerțului</Label>
                    <Input id="regCom" placeholder="J40/1234/2020" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Adresă</Label>
                    <Input id="address" required />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full">Creează cont</Button>
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
