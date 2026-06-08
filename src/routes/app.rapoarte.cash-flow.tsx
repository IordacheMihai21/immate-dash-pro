import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Loader2, Search, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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
  formatDate,
  getCustomerName,
  getInvoiceDate,
  getInvoiceTotal,
  getNewestInvoiceTime,
  getSupplierName,
  isRecentInvoice,
  normalizeText,
  type ReportInvoice,
} from "@/lib/reportUtils";

export const Route = createFileRoute("/app/rapoarte/cash-flow")({
  head: () => ({ meta: [{ title: "Raport cash-flow - IMMapp" }] }),
  component: CashFlowReportPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type CashFlowTab = "all" | "high" | "recent";

function CashFlowReportPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [activeTab, setActiveTab] = useState<CashFlowTab>("all");
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
        setErrorMessage("Nu s-au putut încărca datele pentru raportul cash-flow.");
      } finally {
        setIsLoading(false);
      }
    }

    loadReport();
  }, []);

  const report = useMemo(() => {
    const invoiceTotal = invoices.reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);
    const averageInvoiceValue = invoices.length > 0 ? invoiceTotal / invoices.length : 0;
    const newestTime = getNewestInvoiceTime(invoices);
    const monthlyPoints = buildMonthlyReportPoints(invoices);
    const averageMonthlyRevenue =
      monthlyPoints.length > 0
        ? monthlyPoints.reduce((sum, point) => sum + point.value, 0) / monthlyPoints.length
        : 0;

    const rows = invoices
      .map((invoice) => {
        const total = getInvoiceTotal(invoice);
        const impact = getInvoiceImpact(total, averageInvoiceValue);

        return {
          invoice,
          invoiceNumber: invoice.invoice_number ?? "-",
          customer: getCustomerName(invoice),
          supplier: getSupplierName(invoice),
          issueDate: formatDate(getInvoiceDate(invoice)),
          total,
          impact,
          observation: getCashFlowObservation(impact),
          recent: isRecentInvoice(invoice, newestTime),
        };
      })
      .sort((a, b) => getInvoiceTotal(b.invoice) - getInvoiceTotal(a.invoice));

    const searchValue = normalizeText(search);
    const filteredRows = rows.filter((row) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "high" && row.impact === "Ridicat") ||
        (activeTab === "recent" && row.recent);

      if (!matchesTab) {
        return false;
      }

      if (!searchValue) {
        return true;
      }

      return normalizeText(`${row.invoiceNumber} ${row.customer} ${row.supplier}`).includes(
        searchValue,
      );
    });

    return {
      averageInvoiceValue,
      highImpactCount: rows.filter((row) => row.impact === "Ridicat").length,
      liquidityPressure: getLiquidityPressure(
        dashboardData?.prediction.cashFlow30Days ?? 0,
        averageInvoiceValue,
      ),
      liquidityScenario: dashboardData
        ? [
            { period: "30 zile", value: dashboardData.prediction.cashFlow30Days },
            { period: "60 zile", value: dashboardData.prediction.cashFlow60Days },
            { period: "90 zile", value: dashboardData.prediction.cashFlow90Days },
          ]
        : [],
      revenueSafetyChart: monthlyPoints.map((point) => ({
        month: point.month,
        venituri: point.value,
        pragSiguranta: averageMonthlyRevenue,
      })),
      rows: filteredRows,
    };
  }, [activeTab, dashboardData, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul cash-flow...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raport cash-flow"
        description="Analizează presiunea pe lichiditate, perioadele cu risc și facturile care influențează fluxul de numerar."
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
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <ReportKpiCard
              title="Cash-flow 30 zile"
              value={formatRON(dashboardData.prediction.cashFlow30Days)}
              description="Estimare de lichiditate pe termen scurt"
              icon={<Wallet className="h-5 w-5" />}
              tone={dashboardData.prediction.cashFlow30Days >= 0 ? "emerald" : "rose"}
            />
            <ReportKpiCard
              title="Cash-flow 60 zile"
              value={formatRON(dashboardData.prediction.cashFlow60Days)}
              description="Estimare pentru următoarele două luni"
              icon={<Wallet className="h-5 w-5" />}
              tone={dashboardData.prediction.cashFlow60Days >= 0 ? "emerald" : "rose"}
            />
            <ReportKpiCard
              title="Cash-flow 90 zile"
              value={formatRON(dashboardData.prediction.cashFlow90Days)}
              description="Estimare pentru următoarele trei luni"
              icon={<Wallet className="h-5 w-5" />}
              tone={dashboardData.prediction.cashFlow90Days >= 0 ? "emerald" : "rose"}
            />
            <ReportKpiCard
              title="Presiune lichiditate"
              value={report.liquidityPressure}
              description={`Nivel risc estimat: ${dashboardData.prediction.riskLevel}`}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={
                report.liquidityPressure === "Ridicată"
                  ? "rose"
                  : report.liquidityPressure === "Medie"
                    ? "amber"
                    : "emerald"
              }
            />
            <ReportKpiCard
              title="Facturi cu impact ridicat"
              value={String(report.highImpactCount)}
              description="Peste media facturilor cu cel puțin 25%"
              icon={<Search className="h-5 w-5" />}
              tone="amber"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Scenariu cash-flow 30/60/90 zile"
              description="Cash-flow estimat pentru următoarele intervale"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.liquidityScenario}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Bar dataKey="value" name="Cash-flow">
                    {report.liquidityScenario.map((entry) => (
                      <Cell key={entry.period} fill={entry.value >= 0 ? "#10b981" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Venituri lunare vs medie"
              description="Comparație cu media lunară procesată"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={report.revenueSafetyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="venituri"
                    name="Venituri"
                    stroke="#2563eb"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pragSiguranta"
                    name="Prag de siguranță"
                    stroke="#f59e0b"
                    strokeDasharray="6 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ReportPanel
            title="Facturi cu impact asupra cash-flow-ului"
            description="Filtrează facturile care pot influența rapid lichiditatea."
            action={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Caută factură sau partener"
              />
            }
            contentClassName="p-0"
          >
            <div className="border-b border-slate-100 p-5">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CashFlowTab)}>
                <TabsList>
                  <TabsTrigger value="all">Toate</TabsTrigger>
                  <TabsTrigger value="high">Impact ridicat</TabsTrigger>
                  <TabsTrigger value="recent">Recente</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Număr factură</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Furnizor</TableHead>
                    <TableHead>Data emitere</TableHead>
                    <TableHead className="text-right">Valoare</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Observație</TableHead>
                    <TableHead className="text-right">Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.invoice.id}>
                      <TableCell className="font-medium text-slate-900">
                        {row.invoiceNumber}
                      </TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>{row.supplier}</TableCell>
                      <TableCell>{row.issueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.total)}
                      </TableCell>
                      <TableCell>
                        <ImpactBadge value={row.impact} />
                      </TableCell>
                      <TableCell className="min-w-[220px] text-slate-600">
                        {row.observation}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/app/e-facturi/$id" params={{ id: row.invoice.id }}>
                            <Eye className="h-4 w-4" />
                            Detalii
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ReportPanel>

          <ReportPanel title="Interpretare cash-flow">
            <p className="text-sm leading-6 text-slate-600">
              {getCashFlowInterpretation(
                dashboardData.prediction.cashFlow30Days,
                report.highImpactCount,
                report.liquidityPressure,
              )}
            </p>
          </ReportPanel>
        </>
      )}
    </div>
  );
}

function getInvoiceImpact(total: number, average: number) {
  if (average <= 0) {
    return "Scăzut";
  }

  if (total > average * 1.25) {
    return "Ridicat";
  }

  if (total >= average * 0.75) {
    return "Mediu";
  }

  return "Scăzut";
}

function getCashFlowObservation(impact: string) {
  if (impact === "Ridicat") {
    return "Poate schimba semnificativ disponibilul pe termen scurt.";
  }

  if (impact === "Mediu") {
    return "Merită urmărită în planificarea încasărilor și plăților.";
  }

  return "Impact redus asupra lichidității curente.";
}

function getLiquidityPressure(cashFlow30Days: number, averageInvoiceValue: number) {
  if (cashFlow30Days < 0) {
    return "Ridicată";
  }

  if (cashFlow30Days <= Math.max(averageInvoiceValue * 0.25, 1000)) {
    return "Medie";
  }

  return "Scăzută";
}

function getCashFlowInterpretation(
  cashFlow30Days: number,
  highImpactInvoices: number,
  pressure: string,
) {
  if (cashFlow30Days < 0) {
    return `Cash-flow-ul estimat este negativ, iar presiunea pe lichiditate este ${pressure.toLowerCase()}. Prioritizează plățile esențiale și verifică facturile cu impact ridicat înainte de noi angajamente financiare.`;
  }

  if (highImpactInvoices > 0) {
    return `Cash-flow-ul este pozitiv, dar există ${highImpactInvoices} facturi cu impact ridicat. Urmărește încasările și plățile asociate acestor facturi pentru a evita presiunea de lichiditate.`;
  }

  return "Fluxul de numerar estimat este stabil. Continuă monitorizarea facturilor recente și actualizează analiza după fiecare import de e-Facturi XML.";
}
