import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadModal } from "@/components/upload-modal";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { documents, formatRON } from "@/lib/mock-data";

export const Route = createFileRoute("/app/documente")({
  head: () => ({ meta: [{ title: "Documente — IMMapp" }] }),
  component: DocumentsPage,
});

function DocumentsPage() {
  // TODO: connect to backend API for documents
  return (
    <div>
      <PageHeader
        title="Documente"
        description="Toate documentele financiare încărcate în platformă."
        actions={
          <UploadModal
            trigger={
              <Button size="lg" className="gap-2">
                <UploadCloud className="h-4 w-4" /> Încarcă document
              </Button>
            }
          />
        }
      />

      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-secondary/30 p-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-primary">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium">Trage și plasează fișiere aici</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Acceptate: XML, PDF, XLSX, CSV (max. 10MB / fișier)
              </p>
            </div>
            <UploadModal
              trigger={
                <Button variant="outline" size="sm">Selectează fișiere</Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">ID</TableHead>
                <TableHead>Nume fișier</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Data încărcării</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Utilizator</TableHead>
                <TableHead className="text-right">Valoare</TableHead>
                <TableHead className="w-40 text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{d.id}</TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell><span className="rounded bg-muted px-1.5 py-0.5 text-xs">{d.type}</span></TableCell>
                  <TableCell>{d.uploadedAt}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{d.user}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.total ? formatRON(d.total) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Vezi"><Eye className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" title="Reprocesează"><RotateCcw className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" title="Șterge"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
