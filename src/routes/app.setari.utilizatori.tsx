import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Clock, KeyRound, Loader2, ShieldCheck, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { getCurrentAuthUser } from "@/lib/appUserService";
import {
  INVITABLE_ROLES,
  inviteCompanyMember,
  listCompanyMembers,
  revokeCompanyMember,
  updateCompanyMemberRole,
  type CompanyMember,
  type CompanyMemberRole,
} from "@/lib/companyMembersService";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const roleLabels: Record<CompanyMemberRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  contabil: "Contabil",
  vizualizator: "Vizualizator",
};

function UsersSettingsPage() {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [myAuthUserId, setMyAuthUserId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);

  async function loadMembers() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const [authUser, memberRows] = await Promise.all([
        getCurrentAuthUser(),
        listCompanyMembers(),
      ]);

      setMyAuthUserId(authUser?.id ?? null);
      setMyEmail(authUser?.email ?? null);
      setMembers(memberRows.filter((member) => member.status !== "revoked"));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Membrii companiei nu au putut fi cititi.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  const myRole = useMemo(
    () => members.find((member) => member.authUserId === myAuthUserId)?.role ?? null,
    [members, myAuthUserId],
  );
  const canManage = myRole === "owner" || myRole === "admin";

  const activeCount = members.filter((member) => member.status === "active").length;
  const adminCount = members.filter(
    (member) => member.status === "active" && (member.role === "owner" || member.role === "admin"),
  ).length;
  const invitedCount = members.filter((member) => member.status === "invited").length;
  const contabilCount = members.filter(
    (member) => member.status === "active" && member.role === "contabil",
  ).length;

  async function handleInvite(email: string, role: CompanyMemberRole) {
    try {
      await inviteCompanyMember({ email, role });
      toast.success(`Invitatie trimisa catre ${email}.`);
      setInviteOpen(false);
      await loadMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invitatia nu a putut fi trimisa.");
    }
  }

  async function handleRoleChange(memberId: string, role: CompanyMemberRole) {
    try {
      await updateCompanyMemberRole(memberId, role);
      toast.success("Rol actualizat.");
      await loadMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rolul nu a putut fi actualizat.");
    }
  }

  async function handleRevoke(memberId: string) {
    try {
      await revokeCompanyMember(memberId);
      toast.success("Acces revocat.");
      await loadMembers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Accesul nu a putut fi revocat.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilizatori"
        description="Membrii companiei si rolurile lor de acces."
        actions={
          canManage ? (
            <InviteMemberDialog
              open={inviteOpen}
              onOpenChange={setInviteOpen}
              onInvite={handleInvite}
            />
          ) : undefined
        }
      />

      {errorMessage && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UserKpiCard
          title="Utilizatori activi"
          value={String(activeCount)}
          icon={<Users className="h-5 w-5" />}
          tone="blue"
        />
        <UserKpiCard
          title="Administratori"
          value={String(adminCount)}
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="emerald"
        />
        <UserKpiCard
          title="Invitatii in asteptare"
          value={String(invitedCount)}
          icon={<Clock className="h-5 w-5" />}
          tone="amber"
        />
        <UserKpiCard
          title="Contabili"
          value={String(contabilCount)}
          icon={<KeyRound className="h-5 w-5" />}
          tone="slate"
        />
      </section>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 p-5">
          <CardTitle className="text-base font-semibold text-slate-900">
            Membrii companiei
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Se incarca membrii...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="text-right">Actiuni</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                        Nu exista membri.
                      </TableCell>
                    </TableRow>
                  ) : (
                    members.map((member) => {
                      const isMe = member.authUserId === myAuthUserId;
                      const displayEmail = member.invitedEmail ?? (isMe ? myEmail : null) ?? "—";

                      return (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium text-slate-900">
                            {displayEmail}
                            {isMe && <span className="ml-2 text-xs text-slate-400">(tu)</span>}
                          </TableCell>
                          <TableCell>
                            {canManage && member.role !== "owner" ? (
                              <Select
                                value={member.role}
                                onValueChange={(value) =>
                                  handleRoleChange(member.id, value as CompanyMemberRole)
                                }
                              >
                                <SelectTrigger className="h-8 w-40">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {INVITABLE_ROLES.map((role) => (
                                    <SelectItem key={role} value={role}>
                                      {roleLabels[role]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              roleLabels[member.role]
                            )}
                          </TableCell>
                          <TableCell>
                            <MemberStatusBadge status={member.status} />
                          </TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              {member.role !== "owner" && !isMe && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-rose-600 hover:text-rose-700"
                                  onClick={() => handleRevoke(member.id)}
                                >
                                  Revoca
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InviteMemberDialog({
  open,
  onOpenChange,
  onInvite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (email: string, role: CompanyMemberRole) => Promise<void>;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const role = String(formData.get("role") ?? "vizualizator") as CompanyMemberRole;

    if (!email) return;

    setIsSubmitting(true);
    try {
      await onInvite(email, role);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" />
          Invita membru
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invita un membru</DialogTitle>
          <DialogDescription>
            Persoana invitata se va alatura companiei automat cand isi creeaza cont sau se
            autentifica cu acest email.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" required disabled={isSubmitting} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="invite-role">Rol</Label>
            <Select name="role" defaultValue="vizualizator">
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITABLE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabels[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Trimite invitatia
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const active = status === "active";

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
      {active ? "Activ" : "Invitat"}
    </Badge>
  );
}
