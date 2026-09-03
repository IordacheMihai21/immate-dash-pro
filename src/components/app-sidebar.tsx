import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, ChevronRight, Menu, X } from "lucide-react";
import { menuGroups, supportItems, type SidebarGroup, type SidebarLink } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppSidebar({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-background/60 backdrop-blur-sm transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
          <Link to="/app" className="flex min-w-0 items-center gap-3" onClick={onClose}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-black/20">
              <Building2 className="h-4 w-4" />
            </div>

            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">IMMapp</p>
              <p className="text-[11px] uppercase text-sidebar-foreground/60">Sistem financiar</p>
            </div>
          </Link>

          <button
            type="button"
            className="rounded-md p-2 text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-foreground md:hidden"
            onClick={onClose}
            aria-label="Inchide meniul"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="hide-scrollbar flex-1 overflow-y-auto px-4 py-5">
          <SidebarSection title="MENIU" groups={menuGroups} pathname={pathname} onClose={onClose} />

          <div className="mt-7">
            <p className="mb-3 px-2 text-[11px] font-semibold uppercase text-sidebar-foreground/50">
              SUPORT
            </p>
            <ul className="space-y-1">
              {supportItems.map((item) => (
                <SidebarItem key={item.label} item={item} pathname={pathname} onClose={onClose} />
              ))}
            </ul>
          </div>
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-sidebar-foreground">
              <Menu className="h-4 w-4 text-sidebar-primary" />
              Control financiar
            </div>
            <p className="text-xs leading-5 text-sidebar-foreground/60">
              Import XML, analiza cash-flow si predictii AI intr-un singur spatiu.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}

function SidebarSection({
  title,
  groups,
  pathname,
  onClose,
}: {
  title: string;
  groups: SidebarGroup[];
  pathname: string;
  onClose: () => void;
}) {
  return (
    <div>
      <p className="mb-3 px-2 text-[11px] font-semibold uppercase text-sidebar-foreground/50">
        {title}
      </p>

      <div className="space-y-5">
        {groups.map((group) => {
          const GroupIcon = group.icon;
          const groupActive = group.items.some((item) => isActive(item, pathname));

          return (
            <div key={group.title}>
              <div
                className={cn(
                  "mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase text-sidebar-foreground/60",
                  groupActive && "text-sidebar-primary",
                )}
              >
                <GroupIcon className="h-3.5 w-3.5" />
                <span>{group.title}</span>
                <ChevronRight className="ml-auto h-3.5 w-3.5" />
              </div>

              <ul className="space-y-1">
                {group.items.map((item) => (
                  <SidebarItem
                    key={`${group.title}-${item.label}`}
                    item={item}
                    pathname={pathname}
                    onClose={onClose}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SidebarItem({
  item,
  pathname,
  onClose,
}: {
  item: SidebarLink;
  pathname: string;
  onClose: () => void;
}) {
  const Icon = item.icon;
  const active = isActive(item, pathname);
  const content = (
    <>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded-full border border-sidebar-border bg-sidebar-accent px-2 py-0.5 text-[10px] font-medium text-sidebar-foreground/70">
          {item.badge}
        </span>
      )}
    </>
  );

  if (!item.to) {
    return (
      <li>
        <button
          type="button"
          disabled
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-sidebar-foreground/40"
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={item.to}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150 ease-out",
          active
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-black/20"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        {content}
      </Link>
    </li>
  );
}

function isActive(item: SidebarLink, pathname: string) {
  if (item.active === false) {
    return false;
  }

  if (!item.to) {
    return false;
  }

  if (item.exact) {
    return pathname === item.to || pathname === `${item.to}/`;
  }

  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}
