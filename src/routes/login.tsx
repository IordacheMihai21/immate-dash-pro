import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Autentificare — IMMapp" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  // TODO: connect to backend API for authentication
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/app" });
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
            <h1 className="text-xl font-semibold">Autentificare</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Conectează-te la contul IMMapp.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="nume@firma.ro" required />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Parolă</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-primary hover:underline"
                  >
                    Ai uitat parola?
                  </Link>
                </div>
                <Input id="password" type="password" required />
              </div>
              <Button type="submit" className="w-full">Autentificare</Button>
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
