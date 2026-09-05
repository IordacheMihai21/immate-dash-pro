import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createManualInvoice } from "@/lib/invoiceService";
import { formatRON } from "@/lib/formatters";

export const Route = createFileRoute("/app/e-facturi/noua")({
  head: () => ({ meta: [{ title: "Factura noua - IMMapp" }] }),
  component: NewInvoicePage,
});

type LineDraft = {
  description: string;
  quantity: string;
  unitCode: string;
  unitPrice: string;
};

const emptyLine: LineDraft = { description: "", quantity: "1", unitCode: "buc", unitPrice: "" };
const vatRateOptions = ["19", "9", "5", "0"];
const currencyOptions = ["RON", "EUR", "USD"];

const lineTemplates: { label: string; line: LineDraft }[] = [
  {
    label: "Servicii consultanta",
    line: { description: "Servicii de consultanta", quantity: "1", unitCode: "ora", unitPrice: "" },
  },
  {
    label: "Contabilitate lunara",
    line: {
      description: "Servicii de contabilitate lunara",
      quantity: "1",
      unitCode: "luna",
      unitPrice: "",
    },
  },
  {
    label: "Chirie lunara",
    line: {
      description: "Chirie spatiu -- luna curenta",
      quantity: "1",
      unitCode: "luna",
      unitPrice: "",
    },
  },
  {
    label: "Servicii IT",
    line: {
      description: "Servicii de dezvoltare software",
      quantity: "1",
      unitCode: "ora",
      unitPrice: "",
    },
  },
];

function toNumber(value: string): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function NewInvoicePage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [currency, setCurrency] = useState("RON");
  const [vatRatePercent, setVatRatePercent] = useState("19");
  const [customerName, setCustomerName] = useState("");
  const [customerCui, setCustomerCui] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerCity, setCustomerCity] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);

  const subtotal = round2(
    lines.reduce((sum, line) => sum + toNumber(line.quantity) * toNumber(line.unitPrice), 0),
  );
  const vatAmount = round2(subtotal * (toNumber(vatRatePercent) / 100));
  const total = round2(subtotal + vatAmount);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((current) => [...current, { ...emptyLine }]);
  }

  function removeLine(index: number) {
    setLines((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current));
  }

  function applyLineTemplate(template: LineDraft) {
    setLines((current) => [{ ...template }, ...current.slice(1)]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await createManualInvoice({
        invoiceNumber,
        issueDate,
        dueDate: dueDate || null,
        currency,
        vatRatePercent: toNumber(vatRatePercent),
        customer: {
          name: customerName,
          cui: customerCui,
          address: customerAddress,
          city: customerCity,
          country: "RO",
        },
        lines: lines.map((line) => ({
          description: line.description,
          quantity: toNumber(line.quantity),
          unitCode: line.unitCode,
          unitPrice: toNumber(line.unitPrice),
        })),
      });

      toast.success(`Factura ${invoiceNumber} a fost creata.`);
      await navigate({ to: "/app/e-facturi/$id", params: { id: result.invoiceId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Factura nu a putut fi creata.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Factura noua" description="Emite o factura noua catre un client." />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Porneste de la:</span>
        {lineTemplates.map((template) => (
          <Button
            key={template.label}
            type="button"
            variant="outline"
            size="sm"
            className="bg-card"
            onClick={() => applyLineTemplate(template.line)}
          >
            {template.label}
          </Button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalii factura</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="invoiceNumber">Numar factura</Label>
              <Input
                id="invoiceNumber"
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="FAC-0001"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issueDate">Data emiterii</Label>
              <Input
                id="issueDate"
                type="date"
                value={issueDate}
                onChange={(event) => setIssueDate(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueDate">Data scadentei</Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vatRate">Cota TVA</Label>
              <Select value={vatRatePercent} onValueChange={setVatRatePercent}>
                <SelectTrigger id="vatRate">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {vatRateOptions.map((rate) => (
                    <SelectItem key={rate} value={rate}>
                      {rate}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Moneda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customerName">Denumire client</Label>
              <Input
                id="customerName"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerCui">CUI client</Label>
              <Input
                id="customerCui"
                value={customerCui}
                onChange={(event) => setCustomerCui(event.target.value)}
                placeholder="RO12345678"
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerAddress">Adresa</Label>
              <Input
                id="customerAddress"
                value={customerAddress}
                onChange={(event) => setCustomerAddress(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customerCity">Oras</Label>
              <Input
                id="customerCity"
                value={customerCity}
                onChange={(event) => setCustomerCity(event.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Linii factura</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              disabled={isSubmitting}
            >
              <Plus className="h-4 w-4" />
              Adauga linie
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {lines.map((line, index) => {
              const lineTotal = round2(toNumber(line.quantity) * toNumber(line.unitPrice));

              return (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto_auto] sm:items-end"
                >
                  <div className="space-y-2">
                    <Label>Descriere</Label>
                    <Input
                      value={line.description}
                      onChange={(event) => updateLine(index, { description: event.target.value })}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cantitate</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      value={line.quantity}
                      onChange={(event) => updateLine(index, { quantity: event.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>UM</Label>
                    <Input
                      value={line.unitCode}
                      onChange={(event) => updateLine(index, { unitCode: event.target.value })}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pret unitar</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={line.unitPrice}
                      onChange={(event) => updateLine(index, { unitPrice: event.target.value })}
                      required
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground sm:text-right">
                    {formatRON(lineTotal)}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(index)}
                    disabled={isSubmitting || lines.length === 1}
                    aria-label="Sterge linia"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-2 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm text-muted-foreground">
              <div>Subtotal: {formatRON(subtotal)}</div>
              <div>
                TVA ({vatRatePercent}%): {formatRON(vatAmount)}
              </div>
              <div className="text-base font-semibold text-foreground">
                Total: {formatRON(total)}
              </div>
            </div>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              <Save className="h-4 w-4" />
              {isSubmitting ? "Se salveaza..." : "Salveaza factura"}
            </Button>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
