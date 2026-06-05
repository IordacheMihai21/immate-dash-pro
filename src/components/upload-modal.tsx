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
      toast.error("Momentan este implementat importul pentru e-Factura XML.");
      return;
    }

    if (!selectedFile.name.toLowerCase().endsWith(".xml")) {
      toast.error("Fisierul trebuie sa fie in format XML.");
      return;
    }

    try {
      setIsUploading(true);

      const result = await importEFacturaXml(selectedFile);

      toast.success("e-Factura XML a fost procesata si salvata in baza de date.");

      window.dispatchEvent(
        new CustomEvent("immapp:invoice-imported", {
          detail: result,
        }),
      );

      setSelectedFile(null);
      setOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la procesarea documentului.";

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
          <DialogTitle>Incarca document</DialogTitle>
          <DialogDescription>
            Acceptate: XML e-Factura, PDF, XLSX, CSV. In aceasta versiune este functional importul XML.
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
                accept=".xml,.pdf,.xlsx,.csv"
                className="border-0 p-0 shadow-none"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
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
                <SelectItem value="pdf">Factura PDF</SelectItem>
                <SelectItem value="bank">Extras bancar</SelectItem>
                <SelectItem value="other">Alt document</SelectItem>
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