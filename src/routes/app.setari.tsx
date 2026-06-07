import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { activeCompany, companyUsers } from "@/lib/mock-data";
import { Building2, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/setari")({
  head: () => ({ meta: [{ title: "Setări firmă — IMMapp" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  // TODO: connect to backend API for company settings
  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Modificari salvate.");
  };
  return (
    <div>
      <PageHeader title="Setări firmă" description="Date generale despre firma activă și utilizatori." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Date firmă</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Denumire firmă</Label>
                <Input id="name" defaultValue={activeCompany.name} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cui">CUI</Label>
                <Input id="cui" defaultValue={activeCompany.cui} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg">Nr. Registrul Comerțului</Label>
                <Input id="reg" defaultValue={activeCompany.regCom} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="address">Adresă</Label>
                <Input id="address" defaultValue={activeCompany.address} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email contact</Label>
                <Input id="email" type="email" defaultValue={activeCompany.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefon</Label>
                <Input id="phone" defaultValue={activeCompany.phone} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="logo">Logo firmă</Label>
                <Input id="logo" type="file" accept="image/*" />
              </div>
              <div className="sm:col-span-2">
                <Button type="submit">Salvează modificările</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificare firmă</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{activeCompany.name}</p>
                <p className="text-xs text-muted-foreground">{activeCompany.cui} · {activeCompany.regCom}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Email</dt><dd>{activeCompany.email}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Telefon</dt><dd>{activeCompany.phone}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Utilizatori firmă</CardTitle>
            <Button size="sm" variant="outline" className="gap-2"><UserPlus className="h-4 w-4" /> Invită utilizator</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nume</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companyUsers.map((u) => (
                  <TableRow key={u.email}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>{u.role}</TableCell>
                    <TableCell><StatusBadge status={u.status as "Activ" | "Inactiv"} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
