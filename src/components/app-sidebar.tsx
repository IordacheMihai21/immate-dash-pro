import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BrainCircuit,
  Building2,
  ChevronRight,
  CircleHelp,
  FileArchive,
  FileCode2,
  FileText,
  Gauge,
  Handshake,
  LayoutDashboard,
  LineChart,
  Menu,
  PieChart,
  ReceiptText,
  Settings,
  Sparkles,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SidebarLink = {
  label: string;
  to?: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  active?: boolean;
  badge?: string;
};

type SidebarGroup = {
  title: string;
  icon: typeof LayoutDashboard;
  items: SidebarLink[];
};

const menuGroups: SidebarGroup[] = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    items: [
      { label: "Overview", to: "/app", icon: Gauge, exact: true },
      { label: "Financiar", icon: BarChart3, badge: "In curand" },
      { label: "AI Insights", icon: Sparkles, badge: "In curand" },
    ],
  },
  {
    title: "Documente",
    icon: FileText,
    items: [
      { label: "Documente financiare", to: "/app/documente", icon: FileText },
      { label: "Import e-Factura XML", to: "/app/documente", icon: UploadCloud, active: false },
      { label: "Arhiva documente", icon: FileArchive, badge: "In curand" },
    ],
  },
  {
    title: "e-Facturi",
    icon: FileCode2,
    items: [
      { label: "Toate facturile", to: "/app/e-facturi", icon: ReceiptText },
      { label: "Detalii factura", icon: FileCode2, badge: "In curand" },
      { label: "Furnizori", to: "/app/furnizori", icon: Handshake },
      { label: "Clienti", to: "/app/clienti", icon: Users },
    ],
  },
  {
    title: "AI Forecast",
    icon: BrainCircuit,
    items: [
      { label: "Predictii pe date reale", to: "/app/ai-forecast", icon: BrainCircuit },
      { label: "Simulare Excel / CSV", to: "/app/ai-forecast", icon: LineChart, active: false },
      { label: "Scenarii business", icon: Sparkles, badge: "In curand" },
    ],
  },
  {
    title: "Rapoarte",
    icon: BarChart3,
    items: [
      { label: "Cash-flow", to: "/app/rapoarte", icon: LineChart },
      { label: "TVA", to: "/app/rapoarte", icon: PieChart, active: false },
      { label: "Profitabilitate", to: "/app/rapoarte", icon: BarChart3, active: false },
      { label: "Activitate lunara", to: "/app/rapoarte", icon: Gauge, active: false },
    ],
  },
  {
    title: "Setari",
    icon: Settings,
    items: [
      { label: "Profil companie", to: "/app/setari", icon: Building2 },
      { label: "Utilizatori", to: "/app/setari", icon: Users, active: false },
      { label: "Preferinte", to: "/app/setari", icon: Settings, active: false },
    ],
  },
];

const supportItems: SidebarLink[] = [
  { label: "Ajutor", icon: CircleHelp, badge: "In curand" },
  { label: "Ghid utilizare", icon: FileText, badge: "In curand" },
];

export function AppSidebar({
  mobileOpen,
  onClose,
}: {
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition-opacity md:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/10 bg-[#111827] text-slate-200 shadow-2xl transition-transform duration-200 md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <Link
            to="/app"
            className="flex min-w-0 items-center gap-3"
            onClick={onClose}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-white shadow-lg shadow-blue-950/30">
              <Building2 className="h-4 w-4" />
            </div>

            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-white">IMMapp</p>
              <p className="text-[11px] uppercase text-slate-400">Financial OS</p>
            </div>
          </Link>

          <button
            type="button"
            className="rounded-md p-2 text-slate-400 transition hover:bg-white/10 hover:text-white md:hidden"
            onClick={onClose}
            aria-label="Inchide meniul"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <SidebarSection
            title="MENU"
            groups={menuGroups}
            pathname={pathname}
            onClose={onClose}
          />

          <div className="mt-7">
            <p className="mb-3 px-2 text-[11px] font-semibold uppercase text-slate-500">
              SUPPORT
            </p>
            <ul className="space-y-1">
              {supportItems.map((item) => (
                <SidebarItem
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  onClose={onClose}
                />
              ))}
            </ul>
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
              <Menu className="h-4 w-4 text-blue-300" />
              Control financiar
            </div>
            <p className="text-xs leading-5 text-slate-400">
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
      <p className="mb-3 px-2 text-[11px] font-semibold uppercase text-slate-500">
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
                  "mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase text-slate-400",
                  groupActive && "text-blue-200",
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
        <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-slate-300">
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-500"
        >
          {content}
        </button>
      </li>
    );
  }

  return (
    <li>
      <Link
        to={item.to as any}
        onClick={onClose}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
          active
            ? "bg-blue-500 text-white shadow-lg shadow-blue-950/25"
            : "text-slate-300 hover:bg-white/[0.07] hover:text-white",
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
