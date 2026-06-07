import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { importEFacturaXml } from "@/lib/invoiceService";

const XML_ONLY_MESSAGE =
  "Acest modul accepta doar fisiere XML e-Factura. Pentru Excel sau CSV, foloseste AI Forecast → Simulare.";

function isLikelyEFacturaXml(xmlText: string) {
  const normalized = xmlText.toLowerCase();

  return (
    normalized.includes("<invoice") ||
    normalized.includes(":invoice") ||
    normalized.includes("ubl:invoice") ||
    normalized.includes("urn:oasis:names:specification:ubl:schema:xsd:invoice")
  );
}

export function UploadModal({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState("xml");
  const [isUploading, setIsUploading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedFile) {
      toast.error("Selecteaza un fisier pentru incarcare.");
      return;
    }

    if (documentType !== "xml") {
      toast.error(XML_ONLY_MESSAGE);
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".xml")) {
      toast.error(XML_ONLY_MESSAGE);
      return;
    }

    const xmlText = await selectedFile.text();

    if (!isLikelyEFacturaXml(xmlText)) {
      toast.error(
        "Fisierul incarcat este XML, dar nu pare sa fie o e-Factura valida. Incarca un XML descarcat din sistemul e-Factura.",
      );
      return;
    }

    try {
      setIsUploading(true);

      const result = await importEFacturaXml(selectedFile);

      localStorage.setItem("immapp:ai-forecast-status", "outdated");

      toast.success("e-Factura XML a fost procesata. Indicatorii financiari au fost actualizati.");

      window.dispatchEvent(
        new CustomEvent("immapp:invoice-imported", {
          detail: result,
        }),
      );
      window.dispatchEvent(new Event("immapp:ai-forecast-outdated"));

      setSelectedFile(null);
      setOpen(false);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "";
      const message = rawMessage.includes("exista deja")
        ? rawMessage
        : "Documentul nu a putut fi procesat. Verifica fisierul XML e-Factura si incearca din nou.";

      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Incarca e-Factura XML</DialogTitle>
          <DialogDescription>
            Incarca aici doar fisiere XML e-Factura. Pentru Excel sau CSV, foloseste zona Simulare din AI Forecast.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Fisier</Label>

            <div className="flex items-center gap-2 rounded-md border border-dashed border-input p-4">
              <UploadCloud className="h-5 w-5 text-muted-foreground" />

              <Input
                id="file"
                type="file"
                accept=".xml"
                className="border-0 p-0 shadow-none"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;

                  if (file && !file.name.toLowerCase().endsWith(".xml")) {
                    toast.error(XML_ONLY_MESSAGE);
                    event.currentTarget.value = "";
                    setSelectedFile(null);
                    return;
                  }

                  setSelectedFile(file);
                }}
              />
            </div>

            {selectedFile && (
              <p className="text-sm text-muted-foreground">
                Fisier selectat: {selectedFile.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tip document</Label>

            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="xml">e-Factura XML</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note optional</Label>
            <Textarea id="notes" placeholder="Adauga o nota..." rows={3} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={isUploading}
            >
              Anuleaza
            </Button>

            <Button type="submit" disabled={isUploading}>
              {isUploading ? "Se proceseaza..." : "Incarca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
