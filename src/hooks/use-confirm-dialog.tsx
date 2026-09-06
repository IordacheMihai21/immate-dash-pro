import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmOptions = {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" styles the confirm button red -- use for delete/revoke/disable actions. */
  variant?: "default" | "destructive";
};

/**
 * Replaces window.confirm() with a real design-system dialog. Usage:
 *
 *   const { confirm, ConfirmDialog } = useConfirmDialog();
 *   async function handleDelete() {
 *     const ok = await confirm({ title: "...", description: "...", variant: "destructive" });
 *     if (!ok) return;
 *     ...
 *   }
 *   return <>{ConfirmDialog}...</>
 */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((nextOptions: ConfirmOptions) => {
    setOptions(nextOptions);
    setOpen(true);

    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  function settle(value: boolean) {
    resolveRef.current?.(value);
    resolveRef.current = null;
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);

    if (!next) {
      settle(false);
    }
  }

  function handleConfirm() {
    settle(true);
    setOpen(false);
  }

  const ConfirmDialog = options ? (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{options.title}</AlertDialogTitle>
          <AlertDialogDescription>{options.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{options.cancelLabel ?? "Anuleaza"}</AlertDialogCancel>
          <AlertDialogAction
            variant={options.variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
          >
            {options.confirmLabel ?? "Confirma"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirm, ConfirmDialog };
}
