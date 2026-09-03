import { useNavigate } from "@tanstack/react-router";
import { FilePlus2, ScanText, UploadCloud } from "lucide-react";
import { useEffect } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { menuGroups, supportItems } from "@/lib/navigation";

const quickActions = [
  { label: "Factura noua", to: "/app/e-facturi/noua", icon: FilePlus2 },
  { label: "Incarca e-Factura XML", to: "/app/e-facturi", icon: UploadCloud },
  { label: "Incarca document (Document AI)", to: "/app/ai-center/document-ai", icon: ScanText },
] as const;

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  function go(to: string) {
    onOpenChange(false);
    void navigate({ to });
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cauta sau tasteaza o comanda"
      description="Navigheaza rapid sau porneste o actiune fara sa parasesti tastatura."
    >
      <CommandInput placeholder="Cauta pagini, rapoarte sau actiuni..." />
      <CommandList>
        <CommandEmpty>Niciun rezultat.</CommandEmpty>
        <CommandGroup heading="Actiuni rapide">
          {quickActions.map((action) => (
            <CommandItem key={action.to} onSelect={() => go(action.to)}>
              <action.icon />
              {action.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        {menuGroups.map((group) => (
          <CommandGroup key={group.title} heading={group.title}>
            {group.items.map((item) =>
              item.to ? (
                <CommandItem key={item.to} onSelect={() => go(item.to!)}>
                  <item.icon />
                  {item.label}
                </CommandItem>
              ) : null,
            )}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Suport">
          {supportItems.map((item) =>
            item.to ? (
              <CommandItem key={item.to} onSelect={() => go(item.to!)}>
                <item.icon />
                {item.label}
              </CommandItem>
            ) : null,
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
