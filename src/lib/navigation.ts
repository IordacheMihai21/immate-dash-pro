import {
  BarChart3,
  BrainCircuit,
  Building2,
  CircleHelp,
  CreditCard,
  FileCode2,
  FileText,
  Gauge,
  Handshake,
  LayoutDashboard,
  LineChart,
  MessageCircleQuestion,
  Network,
  ReceiptText,
  ScanText,
  Settings,
  ShieldCheck,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

export type SidebarLink = {
  label: string;
  to?: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  active?: boolean;
  badge?: string;
};

export type SidebarGroup = {
  title: string;
  icon: typeof LayoutDashboard;
  items: SidebarLink[];
};

export const menuGroups: SidebarGroup[] = [
  {
    title: "Panou principal",
    icon: LayoutDashboard,
    items: [{ label: "Privire generala", to: "/app", icon: Gauge, exact: true }],
  },
  {
    title: "Documente",
    icon: FileText,
    items: [{ label: "Documente financiare", to: "/app/documente", icon: FileText }],
  },
  {
    title: "e-Facturi",
    icon: FileCode2,
    items: [
      { label: "Toate facturile", to: "/app/e-facturi", icon: ReceiptText },
      { label: "Furnizori", to: "/app/furnizori", icon: Handshake },
      { label: "Clienti", to: "/app/clienti", icon: Users },
    ],
  },
  {
    title: "AI Center",
    icon: BrainCircuit,
    items: [
      {
        label: "Document AI",
        to: "/app/ai-center/document-ai",
        icon: ScanText,
      },
      {
        label: "Layout AI",
        to: "/app/ai-center/layout-ai",
        icon: Network,
      },
      {
        label: "Evaluare AI",
        to: "/app/ai-center/evaluare-ai",
        icon: BarChart3,
      },
      {
        label: "Monitorizare AI",
        to: "/app/ai-center/monitorizare-ai",
        icon: ShieldCheck,
      },
      {
        label: "Forecast AI",
        to: "/app/ai-center/predictii-financiare",
        icon: TrendingUp,
      },
      {
        label: "Asistent AI",
        to: "/app/ai-center/asistent",
        icon: MessageCircleQuestion,
      },
    ],
  },
  {
    title: "Rapoarte",
    icon: BarChart3,
    items: [
      { label: "Cash-flow", to: "/app/rapoarte/cash-flow", icon: LineChart },
      { label: "Venituri", to: "/app/rapoarte/revenue", icon: TrendingUp },
      { label: "Cheltuieli", to: "/app/rapoarte/expenses", icon: Wallet },
      { label: "TVA", to: "/app/rapoarte/tva", icon: ReceiptText },
      { label: "Profitabilitate", to: "/app/rapoarte/profitabilitate", icon: BarChart3 },
      { label: "Activitate lunara", to: "/app/rapoarte/activitate-lunara", icon: Gauge },
    ],
  },
  {
    title: "Setari",
    icon: Settings,
    items: [
      { label: "Profil companie", to: "/app/setari", icon: Building2 },
      { label: "Utilizatori", to: "/app/setari/utilizatori", icon: Users },
      { label: "Securitate", to: "/app/setari/securitate", icon: ShieldCheck },
      { label: "Facturare", to: "/app/setari/facturare", icon: CreditCard },
      { label: "Preferinte", to: "/app/setari/preferinte", icon: Settings },
    ],
  },
];

export const supportItems: SidebarLink[] = [
  { label: "Ajutor", to: "/app/ajutor", icon: CircleHelp },
  { label: "Ghid utilizare", to: "/app/ghid-utilizare", icon: FileText },
];
