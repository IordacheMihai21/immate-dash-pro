import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Bell, BrainCircuit, Eye, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/setari/preferinte")({
  head: () => ({ meta: [{ title: "Preferinte - IMMapp" }] }),
  component: PreferencesPage,
});

function PreferencesPage() {
  const [documentNotifications, setDocumentNotifications] = useState(true);
  const [forecastNotifications, setForecastNotifications] = useState(true);
  const [riskNotifications, setRiskNotifications] = useState(true);
  const [theme, setTheme] = useState("Sistem");
  const [density, setDensity] = useState("Confortabil");
  const [technicalMetrics, setTechnicalMetrics] = useState(false);

  function handleSave() {
    toast.success("Preferintele au fost salvate.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Preferinte"
        description="Configureaza modul in care IMMapp afiseaza informatiile si notificarile companiei."
        actions={
          <Button onClick={handleSave}>
            <Save className="h-4 w-4" />
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
          description="Alege evenimentele pentru care vrei atentionari."
        >
          <SwitchPreference
            label="Notificare dupa import documente"
            checked={documentNotifications}
            onCheckedChange={setDocumentNotifications}
          />
          <SwitchPreference
            label="Notificare cand AI Forecast necesita actualizare"
            checked={forecastNotifications}
            onCheckedChange={setForecastNotifications}
          />
          <SwitchPreference
            label="Notificare pentru risc ridicat"
            checked={riskNotifications}
            onCheckedChange={setRiskNotifications}
          />
        </SettingsCard>

        <SettingsCard
          title="Afisare"
          icon={<Eye className="h-5 w-5" />}
          description="Controleaza modul de prezentare a interfetei."
        >
          <ChoicePreference
            label="Tema interfata"
            value={theme}
            options={["Sistem", "Luminos", "Intunecat"]}
            onChange={setTheme}
          />
          <ChoicePreference
            label="Densitate tabele"
            value={density}
            options={["Confortabil", "Compact"]}
            onChange={setDensity}
          />
          <SwitchPreference
            label="Afisare metrici tehnice"
            checked={technicalMetrics}
            onCheckedChange={setTechnicalMetrics}
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
          checked ? "bg-primary text-white" : "bg-card text-muted-foreground ring-1 ring-slate-200",
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
