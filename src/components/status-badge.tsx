import { cn } from "@/lib/utils";
import type { DocStatus } from "@/lib/mock-data";

const styles: Record<string, string> = {
  Procesat: "bg-success/15 text-success border-success/30",
  "În procesare": "bg-warning/20 text-foreground border-warning/40",
  Eroare: "bg-destructive/15 text-destructive border-destructive/30",
  Activ: "bg-success/15 text-success border-success/30",
  Inactiv: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: DocStatus | "Activ" | "Inactiv" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[status] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {status}
    </span>
  );
}
