import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Building2, Loader2, Save } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  EMPTY_COMPANY_PROFILE,
  getCompanyProfile,
  upsertCompanyProfile,
  type CompanyProfile,
  type CompanyProfileInput,
} from "@/lib/companyService";
import { toast } from "sonner";

export const Route = createFileRoute("/app/setari/")({
  head: () => ({ meta: [{ title: "Setari firma - IMMapp" }] }),
  component: SettingsPage,
});

type ProfileField = {
  name: keyof CompanyProfileInput;
  label: string;
  type?: string;
  className?: string;
};

const profileFields: ProfileField[] = [
  {
    name: "company_name",
    label: "Denumire companie",
    className: "sm:col-span-2",
  },
  { name: "cui", label: "CUI" },
  { name: "registration_number", label: "Nr. Registrul Comertului" },
  {
    name: "address",
    label: "Adresa",
    className: "sm:col-span-2",
  },
  { name: "city", label: "Oras" },
  { name: "county", label: "Judet" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Telefon", type: "tel" },
  {
    name: "contact_person",
    label: "Persoana contact",
    className: "sm:col-span-2",
  },
];

function toEditableProfile(profile: CompanyProfile | null): CompanyProfileInput {
  if (!profile) {
    return { ...EMPTY_COMPANY_PROFILE };
  }

  return {
    company_name: profile.company_name ?? "",
    cui: profile.cui ?? "",
    registration_number: profile.registration_number ?? "",
    address: profile.address ?? "",
    city: profile.city ?? "",
    county: profile.county ?? "",
    email: profile.email ?? "",
    phone: profile.phone ?? "",
    contact_person: profile.contact_person ?? "",
  };
}

function getDisplayValue(value: string, fallback = "Necompletat") {
  return value.trim() || fallback;
}

function getAddressSummary(profile: CompanyProfileInput) {
  return [profile.address, profile.city, profile.county]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

function SettingsPage() {
  const [profile, setProfile] = useState<CompanyProfileInput>(() => ({
    ...EMPTY_COMPANY_PROFILE,
  }));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [hasSavedProfile, setHasSavedProfile] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      setIsLoading(true);
      setLoadError("");

      try {
        const savedProfile = await getCompanyProfile();

        if (isMounted) {
          setProfile(toEditableProfile(savedProfile));
          setHasSavedProfile(Boolean(savedProfile));
        }
      } catch {
        if (isMounted) {
          setLoadError("Profilul companiei nu a putut fi incarcat.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateField(field: keyof CompanyProfileInput, value: string) {
    setProfile((currentProfile) => ({
      ...currentProfile,
      [field]: value,
    }));
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);

    try {
      const savedProfile = await upsertCompanyProfile(profile);
      setProfile(toEditableProfile(savedProfile));
      setHasSavedProfile(true);
      window.dispatchEvent(
        new CustomEvent("immapp:company-profile-updated", {
          detail: savedProfile,
        }),
      );
      toast.success("Profilul companiei a fost salvat.");
    } catch {
      toast.error("Profilul companiei nu a putut fi salvat. Incearca din nou.");
    } finally {
      setIsSaving(false);
    }
  }

  const companyName = getDisplayValue(profile.company_name, "Compania mea");
  const cui = getDisplayValue(profile.cui);
  const registrationNumber = getDisplayValue(profile.registration_number);
  const contactPerson = getDisplayValue(profile.contact_person);
  const addressSummary = getAddressSummary(profile);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setari firma"
        description="Actualizeaza datele oficiale ale companiei folosite in aplicatie."
      />

      {!isLoading && !loadError && !hasSavedProfile ? (
        <Card className="border-primary/20 bg-secondary text-primary shadow-sm">
          <CardContent className="p-4 text-sm">
            Completeaza datele companiei pentru personalizarea aplicatiei.
          </CardContent>
        </Card>
      ) : null}

      {loadError ? (
        <Card className="border-warning/40 bg-warning/20 text-warning shadow-sm">
          <CardContent className="p-4 text-sm">{loadError}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="border-border bg-card shadow-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base text-foreground">Profil companie</CardTitle>
            <CardDescription>
              Completeaza datele firmei pentru afisarea corecta in dashboard si rapoarte.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              {profileFields.map((field) => (
                <div key={field.name} className={field.className ?? "space-y-2"}>
                  <div className={field.className ? "space-y-2" : undefined}>
                    <Label htmlFor={field.name}>{field.label}</Label>
                    <Input
                      id={field.name}
                      name={field.name}
                      type={field.type ?? "text"}
                      value={profile[field.name]}
                      disabled={isLoading || isSaving}
                      onChange={(event) => updateField(field.name, event.target.value)}
                    />
                  </div>
                </div>
              ))}

              <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
                <Button type="submit" disabled={isLoading || isSaving} className="gap-2">
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salveaza modificarile
                </Button>
                {isLoading ? (
                  <span className="text-sm text-muted-foreground">Se incarca profilul companiei...</span>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-foreground">Identificare firma</CardTitle>
            <CardDescription>
              Aceste date apar in zona de profil si pot fi refolosite in fluxurile viitoare.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-white">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{companyName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {cui} / {registrationNumber}
                </p>
              </div>
            </div>

            <dl className="mt-5 space-y-3 text-sm">
              <ProfileSummaryRow label="Adresa" value={addressSummary || "Necompletat"} />
              <ProfileSummaryRow label="Email" value={getDisplayValue(profile.email)} />
              <ProfileSummaryRow label="Telefon" value={getDisplayValue(profile.phone)} />
              <ProfileSummaryRow label="Persoana contact" value={contactPerson} />
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProfileSummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-lg border border-border bg-card px-3 py-2">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="break-words text-foreground">{value}</dd>
    </div>
  );
}
