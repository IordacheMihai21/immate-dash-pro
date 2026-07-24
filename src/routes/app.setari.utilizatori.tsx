import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  Clock,
  KeyRound,
  MoreHorizontal,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/setari/utilizatori")({
  head: () => ({ meta: [{ title: "Utilizatori - IMMapp" }] }),
  component: UsersSettingsPage,
});

type RoleFilter = "all" | "Administratori" | "Contabili" | "Viewers";

const members = [
  {
    name: "Administrator principal",
    email: "administrator@companie.ro",
    role: "Administrator",
    status: "Activ",
    lastActivity: "Astazi, 09:45",
  },
  {
    name: "Contabil companie",
    email: "contabil@companie.ro",
    role: "Contabil",
    status: "Activ",
    lastActivity: "Ieri, 16:20",
  },
  {
    name: "Manager financiar",
    email: "financiar@companie.ro",
    role: "Administrator",
    status: "Activ",
    lastActivity: "Acum 2 zile",
  },
  {
    name: "Utilizator vizualizare",
    email: "vizualizare@companie.ro",
    role: "Viewer",
    status: "Invitat",
    lastActivity: "Invitatie trimisa",
  },
];

function UsersSettingsPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const filteredMembers = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return members.filter((member) => {
      const matchesRole =
        roleFilter === "all" ||
        (roleFilter === "Administratori" && member.role === "Administrator") ||
        (roleFilter === "Contabili" && member.role === "Contabil") ||
        (roleFilter === "Viewers" && member.role === "Viewer");

      if (!matchesRole) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      return `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(searchValue);
    });
  }, [roleFilter, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilizatori"
        description="Sectiune pregatita pentru acces de echipa si configurarea rolurilor companiei."
        actions={
          <Button disabled title="Disponibil dupa activarea accesului de echipa">
            <UserPlus className="h-4 w-4" />
            Acces echipa in pregatire
          </Button>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UserKpiCard
          title="Utilizatori activi"
          value="3"
          icon={<Users className="h-5 w-5" />}
          tone="blue"
        />
        <UserKpiCard
          title="Administratori"
          value="2"
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="emerald"
        />
        <UserKpiCard
          title="Invitatii in asteptare"
          value="1"
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
        />
        <UserKpiCard
          title="Roluri configurate"
          value="3"
          icon={<KeyRound className="h-5 w-5" />}
          tone="slate"
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="border-slate-200 bg-white shadow-sm xl:col-span-2">
          <CardHeader className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">
                Membrii companiei
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                Vizualizeaza structura rolurilor pregatita pentru administrarea accesului.
              </p>
            </div>
            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cauta utilizator..."
                className="pl-9"
              />
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="border-b border-slate-100 p-5">
              <Tabs
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value as RoleFilter)}
              >
                <TabsList>
                  <TabsTrigger value="all">Toti</TabsTrigger>
                  <TabsTrigger value="Administratori">Administratori</TabsTrigger>
                  <TabsTrigger value="Contabili">Contabili</TabsTrigger>
                  <TabsTrigger value="Viewers">Viewers</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nume</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ultima activitate</TableHead>
                    <TableHead className="text-right">Actiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                        Nu exista utilizatori pentru filtrul selectat.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMembers.map((member) => (
                      <TableRow key={member.email}>
                        <TableCell className="font-medium text-slate-900">{member.name}</TableCell>
                        <TableCell className="text-slate-500">{member.email}</TableCell>
                        <TableCell>{member.role}</TableCell>
                        <TableCell>
                          <MemberStatusBadge status={member.status} />
                        </TableCell>
                        <TableCell>{member.lastActivity}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" aria-label={`Actiuni ${member.name}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-slate-900">Controlul accesului</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Rolurile vor ajuta la separarea responsabilitatilor intre administratori, contabili si
              utilizatori cu acces de vizualizare.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UserKpiCard({
  title,
  value,
  icon,
  tone,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  tone: "blue" | "emerald" | "amber" | "slate";
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    slate: "bg-slate-100 text-slate-600",
  }[tone];

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardContent className="p-5">
        <div className={cn("mb-5 inline-flex rounded-xl p-3", toneClass)}>{icon}</div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function MemberStatusBadge({ status }: { status: string }) {
  const active = status === "Activ";

  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-amber-200 bg-amber-50 text-amber-700",
      )}
    >
      {status}
    </Badge>
  );
}
