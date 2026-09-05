import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, BrainCircuit, Eye, Loader2, Save, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useCompanyPreferences,
  useUpdateCompanyPreferences,
} from "@/hooks/use-company-preferences";
import type { CompanyPreferences } from "@/lib/companyPreferencesService";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/setari/preferinte")({
  head: () => ({ meta: [{ title: "Preferinte - IMMapp" }] }),
  component: PreferencesPage,
});

type EditableFields = Omit<CompanyPreferences, "companyId">;

function PreferencesPage() {
  const { data: preferences, isLoading, isError } = useCompanyPreferences();
  const updatePreferences = useUpdateCompanyPreferences();
  const [draft, setDraft] = useState<EditableFields | null>(null);

  useEffect(() => {
    if (preferences) {
      setDraft({
        documentNotifications: preferences.documentNotifications,
        forecastNotifications: preferences.forecastNotifications,
        riskNotifications: preferences.riskNotifications,
        paymentNotifications: preferences.paymentNotifications,
        showTechnicalMetrics: preferences.showTechnicalMetrics,
        tableDensity: preferences.tableDensity,
      });
    }
  }, [preferences]);

  function handleSave() {
    if (!draft) return;
    updatePreferences.mutate(draft);
  }

  if (isLoading || !draft) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se incarca preferintele...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
        Preferintele companiei nu au putut fi incarcate. Incearca sa reincarci pagina.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preferinte"
        description="Configureaza modul in care IMMapp afiseaza informatiile si notificarile companiei."
        actions={
          <Button onClick={handleSave} disabled={updatePreferences.isPending}>
            {updatePreferences.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salveaza preferintele
          </Button>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsCard
          title="Preferinte financiare"
          icon={<Wallet className="h-5 w-5" />}
          description="Date folosite pentru afisarea valorilor financiare."
        >
          <StaticPreference label="Moneda implicita" value="RON" />
          <StaticPreference label="Format data" value="ro-RO" />
          <StaticPreference label="TVA standard" value="19%" />
          <StaticPreference label="Perioada raportare" value="Lunar" />
        </SettingsCard>

        <SettingsCard
          title="Notificari"
          icon={<Bell className="h-5 w-5" />}
          description="Alege evenimentele pentru care vrei atentionari in header."
        >
          <SwitchPreference
            label="Notificare dupa import documente"
            checked={draft.documentNotifications}
            onCheckedChange={(value) => setDraft({ ...draft, documentNotifications: value })}
          />
          <SwitchPreference
            label="Notificare cand AI Forecast necesita actualizare"
            checked={draft.forecastNotifications}
            onCheckedChange={(value) => setDraft({ ...draft, forecastNotifications: value })}
          />
          <SwitchPreference
            label="Notificare pentru risc ridicat"
            checked={draft.riskNotifications}
            onCheckedChange={(value) => setDraft({ ...draft, riskNotifications: value })}
          />
          <SwitchPreference
            label="Notificare pentru facturi restante"
            checked={draft.paymentNotifications}
            onCheckedChange={(value) => setDraft({ ...draft, paymentNotifications: value })}
          />
        </SettingsCard>

        <SettingsCard
          title="Afisare"
          icon={<Eye className="h-5 w-5" />}
          description="Controleaza modul de prezentare a interfetei."
        >
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-4">
            <span className="text-sm font-medium text-foreground">Tema interfata</span>
            <ThemeToggle />
          </div>
          <ChoicePreference
            label="Densitate tabele"
            value={draft.tableDensity === "compact" ? "Compact" : "Confortabil"}
            options={["Confortabil", "Compact"]}
            onChange={(value) =>
              setDraft({
                ...draft,
                tableDensity: value === "Compact" ? "compact" : "comfortable",
              })
            }
          />
          <SwitchPreference
            label="Afisare metrici tehnice (metodologie AI Forecast)"
            checked={draft.showTechnicalMetrics}
            onCheckedChange={(value) => setDraft({ ...draft, showTechnicalMetrics: value })}
            offLabel="Dezactivat"
          />
        </SettingsCard>

        <SettingsCard
          title="AI Forecast"
          icon={<BrainCircuit className="h-5 w-5" />}
          description="Preferinte pentru predictiile generate din documentele companiei."
        >
          <StaticPreference label="Actualizare dupa import" value="Activ" />
          <StaticPreference label="Afisare metodologie" value="Doar pentru administratori" />
          <StaticPreference label="Nivel minim incredere" value="Mediu" />
        </SettingsCard>
      </div>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="border-border bg-card shadow-sm">
      <CardHeader className="border-b border-border p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-secondary p-3 text-primary">{icon}</div>
          <div>
            <CardTitle className="text-base font-semibold text-foreground">{title}</CardTitle>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5">{children}</CardContent>
    </Card>
  );
}

function StaticPreference({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-4">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <Badge variant="outline" className="rounded-full bg-card text-foreground">
        {value}
      </Badge>
    </div>
  );
}

function SwitchPreference({
  label,
  checked,
  onCheckedChange,
  offLabel = "Inactiv",
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  offLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-4">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-1 text-xs text-muted-foreground">{checked ? "Activ" : offLabel}</p>
      </div>
      <button
        type="button"
        aria-pressed={checked}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "inline-flex h-8 min-w-20 items-center justify-center rounded-full px-3 text-xs font-semibold transition",
          checked ? "bg-primary text-white" : "bg-card text-muted-foreground ring-1 ring-border",
        )}
      >
        {checked ? "Activ" : offLabel}
      </button>
    </div>
  );
}

function ChoicePreference({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-xl bg-muted p-4">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={value === option ? "default" : "outline"}
            className={cn(value !== option && "bg-card")}
            onClick={() => onChange(option)}
          >
            {option}
          </Button>
        ))}
      </div>
    </div>
  );
}
