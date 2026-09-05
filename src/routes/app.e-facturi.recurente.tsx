import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, PlayCircle, Plus, Repeat, Trash2 } from "lucide-react";
import { AdminPanel, EmptyState } from "@/components/admin-ui";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FREQUENCY_LABELS,
  RECURRING_FREQUENCIES,
  createRecurringTemplate,
  deleteRecurringTemplate,
  generateInvoiceFromTemplate,
  getRecurringTemplates,
  setRecurringTemplateActive,
  type RecurringFrequency,
  type RecurringInvoiceTemplate,
} from "@/lib/recurringInvoiceService";
import { formatRON } from "@/lib/formatters";
import { toast } from "sonner";

export const Route = createFileRoute("/app/e-facturi/recurente")({
  head: () => ({ meta: [{ title: "Facturi recurente - IMMapp" }] }),
  component: RecurringInvoicesPage,
});

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ro-RO", { day: "2-digit", month: "short", year: "numeric" });
}

function computeAmount(
  template: Pick<RecurringInvoiceTemplate, "quantity" | "unit_price" | "vat_rate_percent">,
) {
  const exclusive = template.quantity * template.unit_price;
  return exclusive * (1 + template.vat_rate_percent / 100);
}

const emptyFormState = {
  templateName: "",
  customerName: "",
  customerCui: "",
  customerAddress: "",
  customerCity: "",
  description: "",
  quantity: "1",
  unitCode: "buc",
  unitPrice: "",
  vatRatePercent: "19",
  dueDays: "30",
  frequency: "monthly" as RecurringFrequency,
  nextRunDate: new Date().toISOString().slice(0, 10),
};

function RecurringInvoicesPage() {
  const [templates, setTemplates] = useState<RecurringInvoiceTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  async function loadTemplates() {
    try {
      setIsLoading(true);
      setErrorMessage("");
      const data = await getRecurringTemplates();
      setTemplates(data);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Sabloanele nu au putut fi incarcate.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  async function handleCreate() {
    const quantity = Number(form.quantity);
    const unitPrice = Number(form.unitPrice);
    const vatRatePercent = Number(form.vatRatePercent);
    const dueDays = Number(form.dueDays);

    if (!form.templateName.trim() || !form.customerName.trim() || !form.description.trim()) {
      toast.error("Completeaza numele sablonului, clientul si descrierea serviciului.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      toast.error("Introdu un pret unitar valid.");
      return;
    }

    try {
      setIsSaving(true);
      await createRecurringTemplate({
        templateName: form.templateName.trim(),
        customer: {
          name: form.customerName.trim(),
          cui: form.customerCui.trim(),
          address: form.customerAddress.trim(),
          city: form.customerCity.trim(),
          country: "RO",
        },
        description: form.description.trim(),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unitCode: form.unitCode.trim() || "buc",
        unitPrice,
        currency: "RON",
        vatRatePercent: Number.isFinite(vatRatePercent) ? vatRatePercent : 19,
        dueDays: Number.isFinite(dueDays) && dueDays >= 0 ? dueDays : 30,
        frequency: form.frequency,
        nextRunDate: form.nextRunDate,
      });
      toast.success("Sablon de factura recurenta creat.");
      setCreateOpen(false);
      setForm(emptyFormState);
      await loadTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sablonul nu a putut fi salvat.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleActive(template: RecurringInvoiceTemplate) {
    try {
      await setRecurringTemplateActive(template.id, !template.active);
      await loadTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Statusul nu a putut fi schimbat.");
    }
  }

  async function handleDelete(template: RecurringInvoiceTemplate) {
    try {
      await deleteRecurringTemplate(template.id);
      toast.success(`Sablonul "${template.template_name}" a fost sters.`);
      await loadTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sablonul nu a putut fi sters.");
    }
  }

  async function handleGenerateNow(template: RecurringInvoiceTemplate) {
    try {
      setGeneratingId(template.id);
      const invoiceId = await generateInvoiceFromTemplate(template);
      toast.success("Factura a fost generata.", {
        action: {
          label: "Deschide",
          onClick: () => {
            window.location.href = `/app/e-facturi/${invoiceId}`;
          },
        },
      });
      await loadTemplates();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Factura nu a putut fi generata.");
    } finally {
      setGeneratingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Facturi recurente"
        description="Sabloane pentru clienti cu abonament sau contracte lunare -- genereaza factura din doua click-uri, in loc sa o retastezi."
        actions={
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Sablon nou
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Sablon nou de factura recurenta</DialogTitle>
                <DialogDescription>
                  Completeaza o singura data -- genereaza factura reala oricand ai nevoie.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="template-name">Nume sablon</Label>
                  <Input
                    id="template-name"
                    placeholder="Contabilitate lunara - Client X"
                    value={form.templateName}
                    onChange={(event) => setForm({ ...form, templateName: event.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="customer-name">Client</Label>
                    <Input
                      id="customer-name"
                      value={form.customerName}
                      onChange={(event) => setForm({ ...form, customerName: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-cui">CUI client</Label>
                    <Input
                      id="customer-cui"
                      value={form.customerCui}
                      onChange={(event) => setForm({ ...form, customerCui: event.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="customer-address">Adresa</Label>
                    <Input
                      id="customer-address"
                      value={form.customerAddress}
                      onChange={(event) =>
                        setForm({ ...form, customerAddress: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customer-city">Oras</Label>
                    <Input
                      id="customer-city"
                      value={form.customerCity}
                      onChange={(event) => setForm({ ...form, customerCity: event.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Descriere serviciu</Label>
                  <Input
                    id="description"
                    placeholder="Servicii de contabilitate"
                    value={form.description}
                    onChange={(event) => setForm({ ...form, description: event.target.value })}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">Cantitate</Label>
                    <Input
                      id="quantity"
                      type="number"
                      min="0"
                      step="1"
                      value={form.quantity}
                      onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit-code">UM</Label>
                    <Input
                      id="unit-code"
                      value={form.unitCode}
                      onChange={(event) => setForm({ ...form, unitCode: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit-price">Pret unitar (RON)</Label>
                    <Input
                      id="unit-price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.unitPrice}
                      onChange={(event) => setForm({ ...form, unitPrice: event.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="vat-rate">TVA (%)</Label>
                    <Input
                      id="vat-rate"
                      type="number"
                      min="0"
                      step="1"
                      value={form.vatRatePercent}
                      onChange={(event) => setForm({ ...form, vatRatePercent: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="due-days">Scadenta (zile)</Label>
                    <Input
                      id="due-days"
                      type="number"
                      min="0"
                      step="1"
                      value={form.dueDays}
                      onChange={(event) => setForm({ ...form, dueDays: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="frequency">Frecventa</Label>
                    <Select
                      value={form.frequency}
                      onValueChange={(value) =>
                        setForm({ ...form, frequency: value as RecurringFrequency })
                      }
                    >
                      <SelectTrigger id="frequency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RECURRING_FREQUENCIES.map((frequency) => (
                          <SelectItem key={frequency} value={frequency}>
                            {FREQUENCY_LABELS[frequency]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="next-run-date">Prima generare la</Label>
                  <Input
                    id="next-run-date"
                    type="date"
                    value={form.nextRunDate}
                    onChange={(event) => setForm({ ...form, nextRunDate: event.target.value })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={isSaving}>
                  Anuleaza
                </Button>
                <Button onClick={handleCreate} disabled={isSaving}>
                  {isSaving ? "Se salveaza..." : "Salveaza sablonul"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <AdminPanel
        title="Sabloane"
        description="Genereaza manual o factura noua din orice sablon activ, oricand este nevoie."
        contentClassName="p-0"
      >
        {isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Se incarca sabloanele...
          </div>
        ) : errorMessage ? (
          <div className="p-5 text-sm text-destructive">{errorMessage}</div>
        ) : templates.length === 0 ? (
          <EmptyState
            title="Niciun sablon de factura recurenta"
            description="Creeaza un sablon pentru un client cu contract lunar sau abonament."
            icon={<Repeat className="h-6 w-6" />}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sablon</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Suma</TableHead>
                  <TableHead>Frecventa</TableHead>
                  <TableHead>Urmatoarea generare</TableHead>
                  <TableHead>Activ</TableHead>
                  <TableHead className="text-right">Actiuni</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium text-foreground">
                      {template.template_name}
                      {template.last_generated_invoice_id ? (
                        <Link
                          to="/app/e-facturi/$id"
                          params={{ id: template.last_generated_invoice_id }}
                          className="block text-xs font-normal text-muted-foreground hover:text-primary"
                        >
                          Vezi ultima factura generata
                        </Link>
                      ) : null}
                    </TableCell>
                    <TableCell>{template.customer_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRON(computeAmount(template))}
                    </TableCell>
                    <TableCell>{FREQUENCY_LABELS[template.frequency]}</TableCell>
                    <TableCell>{formatDate(template.next_run_date)}</TableCell>
                    <TableCell>
                      <Switch
                        checked={template.active}
                        onCheckedChange={() => handleToggleActive(template)}
                        aria-label={`Activeaza sau dezactiveaza sablonul ${template.template_name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          disabled={generatingId === template.id}
                          onClick={() => handleGenerateNow(template)}
                        >
                          {generatingId === template.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <PlayCircle className="h-3.5 w-3.5" />
                          )}
                          Genereaza acum
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Sterge sablonul"
                          aria-label={`Sterge sablonul ${template.template_name}`}
                          onClick={() => handleDelete(template)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}
