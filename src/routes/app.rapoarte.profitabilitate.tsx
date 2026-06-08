import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, Eye, Loader2, Percent, TrendingUp, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "@/components/chart-card";
import { PageHeader } from "@/components/page-header";
import {
  ImpactBadge,
  ReportEmptyState,
  ReportKpiCard,
  ReportPanel,
  SearchInput,
} from "@/components/report-ui";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getDashboardData } from "@/lib/dashboardService";
import { getInvoices } from "@/lib/invoiceService";
import { formatRON } from "@/lib/mock-data";
import {
  buildMonthlyReportPoints,
  formatPercent,
  getCustomerName,
  getInvoiceTotal,
  getSupplierName,
  normalizeText,
  type ReportInvoice,
} from "@/lib/reportUtils";

export const Route = createFileRoute("/app/rapoarte/profitabilitate")({
  head: () => ({ meta: [{ title: "Raport profitabilitate - IMMapp" }] }),
  component: ProfitabilityReportPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type ProfitabilityTab = "all" | "suppliers" | "customers" | "high";
type PartnerType = "Furnizor" | "Client";

type PartnerRow = {
  key: string;
  name: string;
  type: PartnerType;
  invoiceCount: number;
  total: number;
  share: number;
  observation: string;
};

export function ProfitabilityReportPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [activeTab, setActiveTab] = useState<ProfitabilityTab>("all");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadReport() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const [dashboard, invoiceData] = await Promise.all([getDashboardData(), getInvoices()]);

        setDashboardData(dashboard);
        setInvoices(invoiceData as unknown as ReportInvoice[]);
      } catch {
        setErrorMessage("Nu s-au putut încărca datele pentru raportul de profitabilitate.");
      } finally {
        setIsLoading(false);
      }
    }

    loadReport();
  }, []);

  const report = useMemo(() => {
    const totalValue = invoices.reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);
    const prediction = dashboardData?.prediction;
    const revenueBase =
      prediction?.revenueForecast && prediction.revenueForecast > 0
        ? prediction.revenueForecast
        : totalValue;
    const margin = revenueBase > 0 ? ((prediction?.profitForecast ?? 0) / revenueBase) * 100 : 0;
    const monthlyPoints = buildMonthlyReportPoints(invoices).map((point) => ({
      month: point.month,
      venituri: point.value,
      profitEstimat: prediction?.profitForecast ?? 0,
    }));
    const partners = buildPartnerRows(invoices, totalValue);
    const averagePartnerValue =
      partners.length > 0
        ? partners.reduce((sum, partner) => sum + partner.total, 0) / partners.length
        : 0;
    const topPartners = partners
      .slice()
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .map((partner) => ({
        name: partner.name,
        valoare: partner.total,
      }));
    const searchValue = normalizeText(search);
    const filteredPartners = partners.filter((partner) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "suppliers" && partner.type === "Furnizor") ||
        (activeTab === "customers" && partner.type === "Client") ||
        (activeTab === "high" && partner.total > averagePartnerValue);

      if (!matchesTab) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      return normalizeText(`${partner.name} ${partner.type}`).includes(searchValue);
    });

    return {
      totalValue,
      margin,
      monthlyPoints,
      topPartners,
      partners: filteredPartners,
      partnerConcentration: partners[0]?.share ?? 0,
    };
  }, [activeTab, dashboardData, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul de profitabilitate...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raport profitabilitate"
        description="Analizează veniturile, marja estimată și partenerii care influențează performanța financiară."
      />

      {errorMessage && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorMessage}
        </div>
      )}

      {invoices.length === 0 || !dashboardData ? (
        <ReportEmptyState />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ReportKpiCard
              title="Venit total"
              value={formatRON(report.totalValue)}
              description="Valoare totală din facturile procesate"
              icon={<TrendingUp className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Cheltuieli estimate"
              value={formatRON(dashboardData.prediction.expensesForecast)}
              description="Estimare generată din istoricul financiar"
              icon={<Wallet className="h-5 w-5" />}
              tone="slate"
            />
            <ReportKpiCard
              title="Profit / pierdere estimată"
              value={formatRON(dashboardData.prediction.profitForecast)}
              description="Rezultat estimat pentru perioada următoare"
              icon={<BarChart3 className="h-5 w-5" />}
              tone={dashboardData.prediction.profitForecast >= 0 ? "emerald" : "rose"}
            />
            <ReportKpiCard
              title="Marjă estimată"
              value={formatPercent(report.margin)}
              description="Profit estimat raportat la venitul estimat"
              icon={<Percent className="h-5 w-5" />}
              tone={report.margin >= 0 ? "emerald" : "rose"}
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Venituri și profit estimat"
              description="Trendul veniturilor lunare cu referință de profit estimat"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={report.monthlyPoints}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Bar dataKey="venituri" name="Venituri" fill="#2563eb" radius={[8, 8, 0, 0]} />
                  <Line
                    type="monotone"
                    dataKey="profitEstimat"
                    name="Profit estimat"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Concentrarea valorii pe parteneri"
              description="Partenerii cu cea mai mare valoare procesată"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.topPartners} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" stroke="#64748b" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#64748b"
                    fontSize={12}
                    width={120}
                  />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Bar
                    dataKey="valoare"
                    name="Valoare totală"
                    fill="#8b5cf6"
                    radius={[0, 8, 8, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ReportPanel
            title="Performanță pe parteneri"
            description="Analizează concentrarea valorii pe furnizori și clienți."
            action={
              <SearchInput value={search} onChange={setSearch} placeholder="Caută partener" />
            }
            contentClassName="p-0"
          >
            <div className="border-b border-slate-100 p-5">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as ProfitabilityTab)}
              >
                <TabsList>
                  <TabsTrigger value="all">Toți</TabsTrigger>
                  <TabsTrigger value="suppliers">Furnizori</TabsTrigger>
                  <TabsTrigger value="customers">Clienți</TabsTrigger>
                  <TabsTrigger value="high">Valoare ridicată</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partener</TableHead>
                    <TableHead>Tip</TableHead>
                    <TableHead className="text-right">Număr facturi</TableHead>
                    <TableHead className="text-right">Valoare totală</TableHead>
                    <TableHead className="text-right">Pondere în total</TableHead>
                    <TableHead>Observație</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.partners.map((partner) => (
                    <TableRow key={partner.key}>
                      <TableCell className="font-medium text-slate-900">{partner.name}</TableCell>
                      <TableCell>{partner.type}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {partner.invoiceCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(partner.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(partner.share)}
                      </TableCell>
                      <TableCell>
                        <ImpactBadge value={partner.observation} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/app/e-facturi">
                            <Eye className="h-4 w-4" />
                            Facturi
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ReportPanel>

          <ReportPanel title="Interpretare profitabilitate">
            <p className="text-sm leading-6 text-slate-600">
              {getProfitabilityInterpretation(report.margin, report.partnerConcentration)}
            </p>
          </ReportPanel>
        </>
      )}
    </div>
  );
}

function buildPartnerRows(invoices: ReportInvoice[], invoiceTotal: number): PartnerRow[] {
  const partners = new Map<string, PartnerRow>();

  function addPartner(name: string, type: PartnerType, value: number) {
    const key = `${type}:${name}`;
    const current = partners.get(key) ?? {
      key,
      name,
      type,
      invoiceCount: 0,
      total: 0,
      share: 0,
      observation: "Monitorizare recomandată",
    };

    current.invoiceCount += 1;
    current.total += value;
    partners.set(key, current);
  }

  invoices.forEach((invoice) => {
    const value = getInvoiceTotal(invoice);

    addPartner(getSupplierName(invoice), "Furnizor", value);
    addPartner(getCustomerName(invoice), "Client", value);
  });

  const rows = Array.from(partners.values()).sort((a, b) => b.total - a.total);
  const averageValue =
    rows.length > 0 ? rows.reduce((sum, partner) => sum + partner.total, 0) / rows.length : 0;

  return rows.map((partner) => ({
    ...partner,
    share: invoiceTotal > 0 ? (partner.total / invoiceTotal) * 100 : 0,
    observation:
      partner.total > averageValue * 1.25
        ? "Partener important"
        : partner.total > averageValue
          ? "Valoare peste medie"
          : "Monitorizare recomandată",
  }));
}

function getProfitabilityInterpretation(margin: number, partnerConcentration: number) {
  if (margin < 0) {
    return "Marja estimată este negativă. Verifică partenerii cu valoare mare și urmărește facturile care cresc presiunea pe costuri.";
  }

  if (partnerConcentration > 50) {
    return "Performanța financiară depinde puternic de un partener principal. Este recomandată monitorizarea concentrării valorii și diversificarea relațiilor comerciale.";
  }

  return "Marja estimată este pozitivă, iar concentrarea pe parteneri este controlabilă. Continuă monitorizarea partenerilor cu valoare ridicată după fiecare import de e-Facturi.";
}
