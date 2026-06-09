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
  "Acest modul accepta doar fisiere XML e-Factura.";

function isLikelyEFacturaXml(xmlText: string) {
  const normalized = xmlText.toLowerCase();

  return (
    normalized.includes("<invoice") ||
    normalized.includes(":invoice") ||
    normalized.includes("ubl:invoice") ||
    normalized.includes("urn:oasis:names:specification:ubl:schema:xsd:invoice")
  );
}

function getFriendlyImportErrorMessage(error: unknown) {
  const rawMessage =
    error instanceof Error
      ? error.message
      : "Documentul nu a putut fi procesat.";
  const normalizedMessage = rawMessage.toLowerCase();

  if (normalizedMessage.includes("exista deja")) {
    return rawMessage;
  }

  if (
    normalizedMessage.includes("autentificat") ||
    normalizedMessage.includes("contul curent")
  ) {
    return rawMessage;
  }

  if (
    normalizedMessage.includes("permission") ||
    normalizedMessage.includes("rls") ||
    normalizedMessage.includes("policy") ||
    normalizedMessage.includes("foreign key") ||
    normalizedMessage.includes("row-level") ||
    normalizedMessage.includes("violates row-level security")
  ) {
    return "Documentul nu a putut fi salvat pentru contul curent. Verifica profilul companiei sau incearca din nou.";
  }

  if (
    normalizedMessage.includes("nu pare sa fie o e-factura valida") ||
    normalizedMessage.includes("xml") ||
    normalizedMessage.includes("parse")
  ) {
    return rawMessage.includes("nu pare sa fie o e-Factura valida")
      ? rawMessage
      : "Documentul nu a putut fi procesat. Verifica fisierul XML e-Factura.";
  }

  if (
    normalizedMessage.includes("salvarea") ||
    normalizedMessage.includes("company") ||
    normalizedMessage.includes("profilul companiei")
  ) {
    return "Documentul nu a putut fi salvat pentru contul curent. Verifica profilul companiei sau incearca din nou.";
  }

  return "Documentul nu a putut fi procesat. Verifica fisierul XML e-Factura.";
}

type FailedImport = {
  fileName: string;
  error: string;
};

export function UploadModal({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [documentType, setDocumentType] = useState("xml");
  const [isUploading, setIsUploading] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [failedImports, setFailedImports] = useState<FailedImport[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<FailedImport[]>([]);

  function resetState() {
    setSelectedFiles([]);
    setProcessedCount(0);
    setTotalCount(0);
    setFailedImports([]);
    setSkippedFiles([]);
  }

  function markAiForecastAsOutdated() {
    localStorage.setItem("immapp:ai-forecast-status", "outdated");
    window.dispatchEvent(new Event("immapp:ai-forecast-outdated"));
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      setSelectedFiles([]);
      setSkippedFiles([]);
      setFailedImports([]);
      return;
    }

    const xmlFiles = files.filter((file) => file.name.toLowerCase().endsWith(".xml"));

    const invalidFiles = files.filter((file) => !file.name.toLowerCase().endsWith(".xml"));
    const skipped = invalidFiles.map((file) => ({
      fileName: file.name,
      error: XML_ONLY_MESSAGE,
    }));

    if (invalidFiles.length > 0) {
      toast.error(
        `${XML_ONLY_MESSAGE} ${invalidFiles.length} fisier(e) au fost ignorate.`,
      );
    }

    setSelectedFiles(xmlFiles);
    setSkippedFiles(skipped);
    setFailedImports(skipped);

    if (xmlFiles.length === 0) {
      event.currentTarget.value = "";
    }
  }

  async function processSingleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".xml")) {
      throw new Error(XML_ONLY_MESSAGE);
    }

    const xmlText = await file.text();

    if (!isLikelyEFacturaXml(xmlText)) {
      throw new Error(
        "Fisierul este XML, dar nu pare sa fie o e-Factura valida.",
      );
    }

    return importEFacturaXml(file);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (documentType !== "xml") {
      toast.error(XML_ONLY_MESSAGE);
      return;
    }

    if (selectedFiles.length === 0) {
      toast.error("Selecteaza una sau mai multe e-Facturi XML pentru incarcare.");
      return;
    }

    try {
      setIsUploading(true);
      setProcessedCount(0);
      setTotalCount(selectedFiles.length);
      setFailedImports(skippedFiles);

      let successCount = 0;
      const failures: FailedImport[] = [...skippedFiles];
      const successfulResults: unknown[] = [];

      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];

        try {
          const result = await processSingleFile(file);
          successfulResults.push(result);
          successCount += 1;
        } catch (error) {
          console.error("Eroare import XML:", error);
          const message = getFriendlyImportErrorMessage(error);

          failures.push({
            fileName: file.name,
            error: message,
          });
        } finally {
          setProcessedCount(index + 1);
        }
      }

      setFailedImports(failures);

      if (successCount > 0) {
        markAiForecastAsOutdated();

        window.dispatchEvent(
          new CustomEvent("immapp:invoice-imported", {
            detail: {
              importedCount: successCount,
              failedCount: failures.length,
              results: successfulResults,
            },
          }),
        );
      }

      if (successCount > 0 && failures.length === 0) {
        toast.success(
          `Import finalizat: ${successCount} documente procesate cu succes.`,
        );

        resetState();
        setOpen(false);
        return;
      }

      if (successCount > 0 && failures.length > 0) {
        toast.warning(
          `Import partial: ${successCount} documente procesate, ${failures.length} documente cu erori.`,
        );
        setSelectedFiles([]);
        setSkippedFiles([]);
        return;
      }

      toast.error(
        failures.length > 0
          ? `Import finalizat: 0 documente procesate, ${failures.length} documente cu erori.`
          : "Niciun document nu a putut fi procesat. Verifica fisierele XML e-Factura si incearca din nou.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const selectedFilesLabel =
    selectedFiles.length === 1
      ? `Fisier selectat: ${selectedFiles[0].name}`
      : `${selectedFiles.length} fisiere XML selectate`;

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (isUploading) {
          return;
        }

        setOpen(value);

        if (!value) {
          resetState();
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Incarca e-Factura XML</DialogTitle>
          <DialogDescription>
            Poti incarca una sau mai multe e-Facturi XML. Fisierele vor fi
            procesate pe rand.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Fisiere XML</Label>

            <div className="flex items-center gap-2 rounded-md border border-dashed border-input p-4">
              <UploadCloud className="h-5 w-5 text-muted-foreground" />

              <Input
                id="file"
                type="file"
                multiple
                accept=".xml,text/xml,application/xml"
                className="border-0 p-0 shadow-none"
                disabled={isUploading}
                onChange={handleFileChange}
              />
            </div>

            {selectedFiles.length > 0 && (
              <div className="rounded-lg bg-secondary/40 p-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">{selectedFilesLabel}</p>

                {selectedFiles.length > 1 && (
                  <p className="mt-1">
                    Primele fisiere:{" "}
                    {selectedFiles
                      .slice(0, 3)
                      .map((file) => file.name)
                      .join(", ")}
                    {selectedFiles.length > 3 ? "..." : ""}
                  </p>
                )}
              </div>
            )}

            {isUploading && totalCount > 0 && (
              <div className="rounded-lg border bg-background p-3 text-sm">
                <p className="font-medium">
                  Se proceseaza {processedCount} din {totalCount} documente...
                </p>

                <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${Math.round((processedCount / totalCount) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {failedImports.length > 0 && (
              <div className="max-h-40 overflow-auto rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive">
                  Documente cu erori: {failedImports.length}
                </p>

                <div className="mt-2 space-y-2">
                  {failedImports.map((failure) => (
                    <div key={failure.fileName}>
                      <p className="font-medium text-foreground">
                        {failure.fileName}
                      </p>
                      <p className="text-muted-foreground">{failure.error}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tip document</Label>

            <Select
              value={documentType}
              onValueChange={setDocumentType}
              disabled={isUploading}
            >
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
            <Textarea
              id="notes"
              placeholder="Adauga o nota..."
              rows={3}
              disabled={isUploading}
            />
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

            <Button type="submit" disabled={isUploading || selectedFiles.length === 0}>
              {isUploading ? "Se proceseaza..." : "Incarca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
