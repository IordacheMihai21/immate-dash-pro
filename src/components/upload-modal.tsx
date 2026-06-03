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

export function UploadModal({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);

  // TODO: connect to backend API for document upload
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Document încărcat cu succes (mock)");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Încarcă document</DialogTitle>
          <DialogDescription>
            Acceptate: XML (e-Factură), PDF, XLSX, CSV. Max. 10MB.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="file">Fișier</Label>
            <div className="flex items-center gap-2 rounded-md border border-dashed border-input p-4">
              <UploadCloud className="h-5 w-5 text-muted-foreground" />
              <Input id="file" type="file" accept=".xml,.pdf,.xlsx,.csv" className="border-0 p-0 shadow-none" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="type">Tip document</Label>
            <Select defaultValue="xml">
              <SelectTrigger id="type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="xml">e-Factură XML</SelectItem>
                <SelectItem value="pdf">Factură PDF</SelectItem>
                <SelectItem value="bank">Extras bancar</SelectItem>
                <SelectItem value="other">Alt document</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Note (opțional)</Label>
            <Textarea id="notes" placeholder="Adaugă o notă..." rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Anulează
            </Button>
            <Button type="submit">Încarcă</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
