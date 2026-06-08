import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, FileText, Loader2, Percent, PieChart as PieChartIcon, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
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
  formatPercent,
  getCustomerName,
  getInvoiceBase,
  getInvoiceDate,
  getInvoiceTotal,
  getNewestInvoiceTime,
  getSupplierName,
  isRecentInvoice,
  normalizeText,
  toNumber,
  type ReportInvoice,
} from "@/lib/reportUtils";

export const Route = createFileRoute("/app/rapoarte/tva")({
  head: () => ({ meta: [{ title: "Raport TVA - IMMapp" }] }),
  component: VatReportPage,
});

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
type VatTab = "all" | "high" | "recent";

const fiscalColors = ["#2563eb", "#f59e0b"];

function VatReportPage() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [activeTab, setActiveTab] = useState<VatTab>("all");
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
        setErrorMessage("Nu s-au putut încărca datele pentru raportul TVA.");
      } finally {
        setIsLoading(false);
      }
    }

    loadReport();
  }, []);

  const report = useMemo(() => {
    const totalVat = invoices.reduce((sum, invoice) => sum + toNumber(invoice.tax_amount), 0);
    const totalWithVat = invoices.reduce((sum, invoice) => sum + getInvoiceTotal(invoice), 0);
    const baseWithoutVat = invoices.reduce((sum, invoice) => sum + getInvoiceBase(invoice), 0);
    const averageVat = invoices.length > 0 ? totalVat / invoices.length : 0;
    const vatShare = totalWithVat > 0 ? (totalVat / totalWithVat) * 100 : 0;
    const newestTime = getNewestInvoiceTime(invoices);
    const monthlyVat = buildMonthlyReportPoints(invoices).map((point) => ({
      month: point.month,
      tva: point.vat,
    }));
    const fiscalStructure = [
      { name: "Baza fără TVA", value: baseWithoutVat },
      { name: "TVA", value: totalVat },
    ];

    const rows = invoices
      .map((invoice) => {
        const total = getInvoiceTotal(invoice);
        const vat = toNumber(invoice.tax_amount);
        const base = getInvoiceBase(invoice);
        const share = total > 0 ? (vat / total) * 100 : 0;
        const impact =
          vat > averageVat * 1.25 ? "Ridicat" : vat >= averageVat * 0.75 ? "Mediu" : "Scăzut";

        return {
          invoice,
          invoiceNumber: invoice.invoice_number ?? "-",
          supplier: getSupplierName(invoice),
          customer: getCustomerName(invoice),
          issueDate: formatDate(getInvoiceDate(invoice)),
          base,
          vat,
          total,
          share,
          impact,
          recent: isRecentInvoice(invoice, newestTime),
          status: invoice.status ?? "-",
        };
      })
      .sort((a, b) => b.vat - a.vat);

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

      return normalizeText(`${row.invoiceNumber} ${row.supplier} ${row.customer}`).includes(
        searchValue,
      );
    });

    return {
      totalVat,
      totalWithVat,
      baseWithoutVat,
      vatShare,
      monthlyVat,
      fiscalStructure,
      rows: filteredRows,
      highVatCount: rows.filter((row) => row.impact === "Ridicat").length,
    };
  }, [activeTab, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul TVA...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raport TVA"
        description="Urmărește TVA-ul colectat, ponderea fiscală și facturile cu impact fiscal ridicat."
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
              title="TVA colectată"
              value={formatRON(report.totalVat)}
              description="TVA identificată în facturile procesate"
              icon={<Percent className="h-5 w-5" />}
              tone="amber"
            />
            <ReportKpiCard
              title="Baza fără TVA"
              value={formatRON(report.baseWithoutVat)}
              description="Valoarea fiscală fără TVA"
              icon={<FileText className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Total cu TVA"
              value={formatRON(report.totalWithVat)}
              description="Valoare totală procesată"
              icon={<Wallet className="h-5 w-5" />}
              tone="emerald"
            />
            <ReportKpiCard
              title="Pondere TVA"
              value={formatPercent(report.vatShare)}
              description="TVA raportat la totalul cu TVA"
              icon={<PieChartIcon className="h-5 w-5" />}
              tone="slate"
            />
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard
              title="Evoluție TVA lunară"
              description="TVA grupat după data emiterii facturilor"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={report.monthlyVat}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Bar dataKey="tva" name="TVA" fill="#f59e0b" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Structura valori fiscale"
              description="Baza fără TVA comparată cu TVA-ul procesat"
              className="border-slate-200 bg-white shadow-sm"
            >
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={report.fiscalStructure}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={72}
                    outerRadius={108}
                    paddingAngle={3}
                  >
                    {report.fiscalStructure.map((entry, index) => (
                      <Cell key={entry.name} fill={fiscalColors[index % fiscalColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatRON(Number(value))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <ReportPanel
            title="Facturi cu impact TVA"
            description="Analizează facturile care influențează cel mai mult obligațiile fiscale."
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
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as VatTab)}>
                <TabsList>
                  <TabsTrigger value="all">Toate</TabsTrigger>
                  <TabsTrigger value="high">TVA ridicat</TabsTrigger>
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
                    <TableHead>Client</TableHead>
                    <TableHead>Data emitere</TableHead>
                    <TableHead className="text-right">Baza fără TVA</TableHead>
                    <TableHead className="text-right">TVA</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Pondere TVA</TableHead>
                    <TableHead>Status</TableHead>
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
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>{row.issueDate}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.base)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.vat)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRON(row.total)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(row.share)}
                      </TableCell>
                      <TableCell>
                        <ImpactBadge value={row.impact} />
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

          <ReportPanel title="Interpretare TVA">
            <p className="text-sm leading-6 text-slate-600">
              TVA-ul reprezintă {formatPercent(report.vatShare)} din valoarea totală procesată.
              {report.highVatCount > 0
                ? ` Cele mai importante obligații fiscale vin din ${report.highVatCount} facturi cu TVA ridicat.`
                : " Nu există concentrații fiscale majore în facturile procesate."}
            </p>
          </ReportPanel>
        </>
      )}
    </div>
  );
}
