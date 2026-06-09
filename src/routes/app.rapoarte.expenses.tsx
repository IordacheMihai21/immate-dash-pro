import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Loader2, ReceiptText, Truck, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Area,
  AreaChart,
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
  filterInvoicesByClassification,
  formatDate,
  formatPercent,
  getInvoiceDate,
  getInvoiceTotal,
  getNewestInvoiceTime,
  getSupplierName,
  isRecentInvoice,
  normalizeText,
  type ReportInvoice,
} from "@/lib/reportUtils";

export const Route = createFileRoute("/app/rapoarte/expenses")({
  head: () => ({ meta: [{ title: "Raport cheltuieli - IMMapp" }] }),
  component: ExpensesReportPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type ExpensesTab = "all" | "high" | "recent";

function ExpensesReportPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [activeTab, setActiveTab] = useState<ExpensesTab>("all");
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
        setErrorMessage("Nu s-au putut încărca datele pentru raportul de cheltuieli.");
      } finally {
        setIsLoading(false);
      }
    }

    loadReport();
  }, []);

  const report = useMemo(() => {
    const expenseInvoices = dashboardData
      ? filterInvoicesByClassification(invoices, dashboardData.companyCui, ["expense"])
      : [];
    const totalExpenses = expenseInvoices.reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);
    const averageInvoice = expenseInvoices.length > 0 ? totalExpenses / expenseInvoices.length : 0;
    const newestTime = getNewestInvoiceTime(expenseInvoices);
    const supplierMap = new Map<string, { name: string; total: number; count: number }>();

    expenseInvoices.forEach((invoice) => {
      const name = getSupplierName(invoice);
      const current = supplierMap.get(name) ?? { name, total: 0, count: 0 };

      current.total += getInvoiceTotal(invoice);
      current.count += 1;
      supplierMap.set(name, current);
    });

    const suppliers = Array.from(supplierMap.values()).sort((a, b) => b.total - a.total);
    const topSupplier = suppliers[0];
    const monthlyChart = dashboardData
      ? buildMonthlyReportPoints(invoices, [], {
          companyCui: dashboardData.companyCui,
          classifications: ["expense"],
        }).map((item) => ({
          month: item.month,
          cheltuieli: item.value,
        }))
      : [];
    const rows = expenseInvoices
      .map((invoice) => {
        const total = getInvoiceTotal(invoice);
        const impact =
          total > averageInvoice * 1.25
            ? "Ridicat"
            : total >= averageInvoice * 0.75
              ? "Mediu"
              : "Scăzut";

        return {
          invoice,
          invoiceNumber: invoice.invoice_number ?? "-",
          supplier: getSupplierName(invoice),
          date: formatDate(getInvoiceDate(invoice)),
          total,
          impact,
          observation:
            impact === "Ridicat"
              ? "Cost cu impact mare asupra perioadei analizate"
              : impact === "Mediu"
                ? "Cost relevant pentru monitorizare"
                : "Cost cu impact redus",
          recent: isRecentInvoice(invoice, newestTime),
        };
      })
      .sort((a, b) => b.total - a.total);
    const searchValue = normalizeText(search);
    const filteredRows = rows.filter((row) => {
      const matchesTab =
        activeTab === "all" ||
        (activeTab === "high" && row.impact === "Ridicat") ||
        (activeTab === "recent" && row.recent);

      if (!matchesTab) {
        return false;
      }

      return searchValue
        ? normalizeText(`${row.invoiceNumber} ${row.supplier}`).includes(searchValue)
        : true;
    });

    return {
      totalExpenses,
      averageInvoice,
      topSupplier,
      highExpenseInvoices: rows.filter((row) => row.impact === "Ridicat").length,
      suppliers: suppliers.slice(0, 8),
      monthlyChart,
      rows: filteredRows,
    };
  }, [activeTab, dashboardData, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul de cheltuieli...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raport cheltuieli"
        description="Analizează costurile, furnizorii importanți și facturile care pun presiune pe cheltuieli."
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
              title="Cheltuieli estimate"
              value={formatRON(dashboardData.prediction.expensesForecast)}
              description="Estimare generată din istoricul financiar"
              icon={<Wallet className="h-5 w-5" />}
              tone="rose"
            />
            <ReportKpiCard
              title="Costuri procesate"
              value={formatRON(report.totalExpenses)}
              description="Valoare totală din facturile analizate"
              icon={<ReceiptText className="h-5 w-5" />}
              tone="slate"
            />
            <ReportKpiCard
              title="Furnizor principal"
              value={report.topSupplier?.name ?? "-"}
              description={report.topSupplier ? formatRON(report.topSupplier.total) : "Fără date"}
              icon={<Truck className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Facturi cost ridicat"
              value={String(report.highExpenseInvoices)}
              description="Facturi peste media costurilor cu cel puțin 25%"
              icon={<AlertTriangle className="h-5 w-5" />}
              tone="amber"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Cheltuieli lunare"
              description="Evoluția valorii facturilor pe lună"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={report.monthlyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Area
                    type="monotone"
                    dataKey="cheltuieli"
                    name="Cheltuieli"
                    stroke="#ef4444"
                    fill="#fee2e2"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Top furnizori după cost"
              description="Furnizorii care concentrează cele mai mari valori"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.suppliers} layout="vertical" margin={{ left: 20 }}>
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
                  <Bar dataKey="total" name="Cost" fill="#ef4444" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ReportPanel
            title="Facturi care influențează cheltuielile"
            description="Filtrează costurile ridicate și facturile recente."
            action={
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Caută factură sau furnizor"
              />
            }
            contentClassName="p-0"
          >
            <div className="border-b border-slate-100 p-5">
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ExpensesTab)}>
                <TabsList>
                  <TabsTrigger value="all">Toate</TabsTrigger>
                  <TabsTrigger value="high">Cost ridicat</TabsTrigger>
                  <TabsTrigger value="recent">Recente</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Număr factură</TableHead>
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
                      <TableCell>{row.supplier}</TableCell>
                      <TableCell>{row.date}</TableCell>
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

          <ReportPanel title="Interpretare cheltuieli">
            <p className="text-sm leading-6 text-slate-600">
              {report.highExpenseInvoices > 0
                ? `Există ${report.highExpenseInvoices} facturi cu impact ridicat asupra costurilor. Verifică furnizorii principali și prioritizează plățile esențiale.`
                : "Cheltuielile sunt distribuite fără concentrații majore. Continuă monitorizarea furnizorilor și a facturilor recente."}
            </p>
          </ReportPanel>
        </>
      )}
    </div>
  );
}
