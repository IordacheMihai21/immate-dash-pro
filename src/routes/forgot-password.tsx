import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Building2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Resetare parolă — IMMapp" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  // TODO: connect to backend API for password reset
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Email de resetare trimis.");
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
            <h1 className="text-xl font-semibold">Resetare parolă</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Introdu emailul contului și îți vom trimite instrucțiunile.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required />
              </div>
              <Button type="submit" className="w-full">Trimite link de resetare</Button>
            </form>
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
