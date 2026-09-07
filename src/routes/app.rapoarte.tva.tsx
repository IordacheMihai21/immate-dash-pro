import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Calculator,
  Eye,
  FileText,
  Loader2,
  Percent,
  PieChart as PieChartIcon,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ImpactBadge,
  ReportActionCard,
  ReportEmptyState,
  ReportHero,
  ReportInsightCard,
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
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useInvoicesData } from "@/hooks/use-invoices-data";
import { getDashboardData } from "@/lib/dashboardService";
import { formatRON } from "@/lib/formatters";
import {
  buildMonthlyReportPoints,
  filterInvoicesByClassification,
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
  const {
    data: dashboardData,
    isLoading: isDashboardLoading,
    isError: isDashboardError,
  } = useDashboardData();
  const {
    data: invoicesData,
    isLoading: isInvoicesLoading,
    isError: isInvoicesError,
  } = useInvoicesData();
  const invoices = useMemo(
    () => (invoicesData as unknown as ReportInvoice[]) ?? [],
    [invoicesData],
  );
  const [activeTab, setActiveTab] = useState<VatTab>("all");
  const [search, setSearch] = useState("");
  const isLoading = isDashboardLoading || isInvoicesLoading;
  const errorMessage =
    isDashboardError || isInvoicesError ? "Nu s-au putut încărca datele pentru raportul TVA." : "";

  const report = useMemo(() => {
    const revenueInvoices = dashboardData
      ? filterInvoicesByClassification(invoices, dashboardData.companyCui, ["revenue"])
      : [];
    const expenseInvoices = dashboardData
      ? filterInvoicesByClassification(invoices, dashboardData.companyCui, ["expense"])
      : [];
    const classifiedInvoices = dashboardData
      ? filterInvoicesByClassification(invoices, dashboardData.companyCui, ["revenue", "expense"])
      : [];
    const collectedVat = revenueInvoices.reduce(
      (sum, invoice) => sum + toNumber(invoice.tax_amount),
      0,
    );
    const deductibleVat = expenseInvoices.reduce(
      (sum, invoice) => sum + toNumber(invoice.tax_amount),
      0,
    );
    const estimatedVatToPay = Math.max(collectedVat - deductibleVat, 0);
    const totalWithVat = revenueInvoices.reduce(
      (sum, invoice) => sum + getInvoiceTotal(invoice),
      0,
    );
    const baseWithoutVat = revenueInvoices.reduce(
      (sum, invoice) => sum + getInvoiceBase(invoice),
      0,
    );
    const classifiedVat = classifiedInvoices.reduce(
      (sum, invoice) => sum + toNumber(invoice.tax_amount),
      0,
    );
    const averageVat =
      classifiedInvoices.length > 0 ? classifiedVat / classifiedInvoices.length : 0;
    const vatShare = totalWithVat > 0 ? (collectedVat / totalWithVat) * 100 : 0;
    const deductibleRatio = collectedVat > 0 ? (deductibleVat / collectedVat) * 100 : 0;
    const newestTime = getNewestInvoiceTime(classifiedInvoices);
    const monthlyCollected = dashboardData
      ? buildMonthlyReportPoints(invoices, [], {
          companyCui: dashboardData.companyCui,
          classifications: ["revenue"],
        })
      : [];
    const monthlyDeductible = dashboardData
      ? buildMonthlyReportPoints(invoices, [], {
          companyCui: dashboardData.companyCui,
          classifications: ["expense"],
        })
      : [];
    const monthlyVatBalance = buildVatMonthlyBalance(monthlyCollected, monthlyDeductible);
    const maxVatMonth = monthlyVatBalance.reduce<(typeof monthlyVatBalance)[number] | null>(
      (max, point) => {
        if (!max) {
          return point;
        }

        return point.dePlata > max.dePlata ? point : max;
      },
      null,
    );
    const highPressureMonths = monthlyVatBalance.filter((point) => point.dePlata > 0);
    const fiscalStructure = [
      { name: "Baza fără TVA", value: baseWithoutVat },
      { name: "TVA colectată", value: collectedVat },
    ];

    const rows = classifiedInvoices
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
      collectedVat,
      deductibleVat,
      estimatedVatToPay,
      totalWithVat,
      baseWithoutVat,
      vatShare,
      deductibleRatio,
      monthlyVatBalance,
      maxVatMonth,
      highPressureMonths,
      fiscalStructure,
      rows: filteredRows,
      highVatCount: rows.filter((row) => row.impact === "Ridicat").length,
    };
  }, [activeTab, dashboardData, invoices, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se încarcă raportul TVA...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportHero
        title="TVA"
        subtitle="Urmareste TVA-ul colectat, TVA-ul deductibil si estimarea de plata pentru o planificare fiscala mai clara."
        eyebrow="Raport fiscal"
        badge="Expunere TVA"
        icon={<Percent className="h-3.5 w-3.5" />}
        actions={
          <Button asChild className="rounded-full bg-card text-foreground hover:bg-muted">
            <Link to="/app/documente">Importa documente</Link>
          </Button>
        }
      />

      {errorMessage && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/15 p-4 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {invoices.length === 0 || !dashboardData ? (
        <ReportEmptyState />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <ReportKpiCard
              title="TVA colectată"
              value={formatRON(report.collectedVat)}
              description="TVA din facturile emise de companie"
              icon={<Percent className="h-5 w-5" />}
              tone="amber"
            />
            <ReportKpiCard
              title="TVA deductibilă"
              value={formatRON(report.deductibleVat)}
              description="TVA din facturile primite de la furnizori"
              icon={<FileText className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="TVA estimată de plată"
              value={formatRON(report.estimatedVatToPay)}
              description="Diferenta estimata intre TVA colectata si deductibila"
              icon={<Wallet className="h-5 w-5" />}
              tone={report.estimatedVatToPay > 0 ? "rose" : "emerald"}
            />
            <ReportKpiCard
              title="Lună cu TVA maximă"
              value={report.maxVatMonth?.month ?? "-"}
              description={
                report.maxVatMonth ? formatRON(report.maxVatMonth.dePlata) : "Nu exista date"
              }
              icon={<PieChartIcon className="h-5 w-5" />}
              tone="amber"
            />
            <ReportKpiCard
              title="Trend TVA"
              value={getVatTrend(report.monthlyVatBalance)}
              description="Directia estimata din ultimele luni disponibile"
              icon={<TrendingUp className="h-5 w-5" />}
              tone="blue"
            />
            <ReportKpiCard
              title="Raport deductibilă/colectată"
              value={formatPercent(report.deductibleRatio)}
              description="Cat din TVA colectata este acoperita de TVA deductibila"
              icon={<Calculator className="h-5 w-5" />}
              tone="slate"
            />
          </section>

          <ReportPanel
            eyebrow="Evolutie fiscala"
            title="TVA colectata vs TVA deductibila vs TVA de plata"
            description="Compara pozitia TVA lunara pe baza facturilor emise si primite."
          >
            {report.monthlyVatBalance.length === 0 ? (
              <div className="flex h-[340px] items-center justify-center rounded-2xl bg-muted p-6 text-center text-sm text-muted-foreground">
                Nu exista suficiente date lunare pentru evolutia TVA.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart
                  data={report.monthlyVatBalance}
                  margin={{ left: 4, right: 12, top: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                  <Tooltip formatter={(value) => formatRON(Number(value))} />
                  <Bar
                    dataKey="colectata"
                    name="TVA colectata"
                    fill="#f59e0b"
                    radius={[8, 8, 0, 0]}
                  />
                  <Bar
                    dataKey="deductibila"
                    name="TVA deductibila"
                    fill="#2563eb"
                    radius={[8, 8, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="dePlata"
                    name="TVA de plata"
                    stroke="#ef4444"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ReportPanel>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
            <ReportPanel
              title="Structura valori fiscale"
              description="Baza fara TVA comparata cu TVA-ul colectat."
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
                  <Tooltip formatter={(value) => formatRON(Number(value))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ReportPanel>

            <div className="grid gap-4">
              <ReportInsightCard
                title="Luni cu presiune TVA"
                value={String(report.highPressureMonths.length)}
                description="Luni in care TVA estimata de plata este peste zero si trebuie planificata in cash-flow."
                icon={<ShieldAlert className="h-5 w-5" />}
                tone={report.highPressureMonths.length > 0 ? "amber" : "emerald"}
              />
              <ReportInsightCard
                title="Balanta TVA"
                value={formatRON(report.estimatedVatToPay)}
                description="Estimare prudenta pentru suma care poate trebui pregatita pentru obligatiile fiscale."
                icon={<Calculator className="h-5 w-5" />}
                tone={report.estimatedVatToPay > 0 ? "rose" : "emerald"}
              />
            </div>
          </section>

          <ReportPanel
            eyebrow="Atentie fiscala"
            title="Alerte si recomandari TVA"
            description="Puncte de verificat inainte de inchiderea perioadei fiscale."
          >
            <div className="grid gap-3 md:grid-cols-3">
              <ReportActionCard
                priority={report.estimatedVatToPay > 0 ? "Medie" : "Scazuta"}
                title="Planifica TVA de plata"
                description="Pastreaza lichiditate pentru lunile in care TVA colectata depaseste TVA deductibila."
              />
              <ReportActionCard
                priority={report.highVatCount > 0 ? "Medie" : "Scazuta"}
                title="Verifica facturile cu TVA ridicat"
                description="Facturile cu TVA mare pot schimba rapid obligatia fiscala estimata."
              />
              <ReportActionCard
                priority="Scazuta"
                title="Actualizeaza dupa import"
                description="Recalculeaza raportul dupa fiecare import de e-Facturi XML."
              />
            </div>
          </ReportPanel>

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
            <div className="border-b border-border p-5">
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
                      <TableCell className="font-medium text-foreground">
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
            <p className="text-sm leading-6 text-muted-foreground">
              TVA-ul colectat reprezintă {formatPercent(report.vatShare)} din valoarea totală
              procesată.
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

function buildVatMonthlyBalance(
  collected: { monthKey: string; month: string; vat: number }[],
  deductible: { monthKey: string; month: string; vat: number }[],
) {
  const monthMap = new Map<
    string,
    {
      monthKey: string;
      month: string;
      colectata: number;
      deductibila: number;
      dePlata: number;
    }
  >();

  function ensureMonth(monthKey: string, month: string) {
    const existing = monthMap.get(monthKey);

    if (existing) {
      return existing;
    }

    const created = {
      monthKey,
      month,
      colectata: 0,
      deductibila: 0,
      dePlata: 0,
    };

    monthMap.set(monthKey, created);

    return created;
  }

  collected.forEach((point) => {
    const month = ensureMonth(point.monthKey, point.month);

    month.colectata = point.vat;
    month.dePlata = Math.max(month.colectata - month.deductibila, 0);
  });

  deductible.forEach((point) => {
    const month = ensureMonth(point.monthKey, point.month);

    month.deductibila = point.vat;
    month.dePlata = Math.max(month.colectata - month.deductibila, 0);
  });

  return Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function getVatTrend(points: ReturnType<typeof buildVatMonthlyBalance>) {
  if (points.length < 2) {
    return "Istoric limitat";
  }

  const latest = points[points.length - 1];
  const previous = points[points.length - 2];

  if (latest.dePlata > previous.dePlata) {
    return "In crestere";
  }

  if (latest.dePlata < previous.dePlata) {
    return "In scadere";
  }

  return "Stabil";
}
