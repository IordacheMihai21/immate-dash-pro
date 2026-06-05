import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { ChartCard } from "@/components/chart-card";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FileText,
  Wallet,
  Percent,
  Truck,
  Users,
  CheckCircle2,
  Eye,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { formatRON } from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/card";
import { getDashboardData } from "@/lib/dashboardService";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard — IMMapp" }] }),
  component: Dashboard,
});

const chartColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

function normalizeStatus(status: string | null | undefined) {
  if (!status) {
    return "Activ" as any;
  }

  if (status === "procesata" || status === "procesat" || status === "Procesat") {
    return "Activ" as any;
  }

  if (status === "eroare" || status === "Eroare") {
    return "Inactiv" as any;
  }

  return "Activ" as any;
}

function Dashboard() {
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadDashboard() {
    try {
      setIsLoading(true);
      setErrorMessage("");

      const data = await getDashboardData();
      setDashboardData(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "A aparut o eroare la incarcarea dashboard-ului.";

      setErrorMessage(message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();

    const handleInvoiceImported = () => {
      loadDashboard();
    };

    window.addEventListener("immapp:invoice-imported", handleInvoiceImported);

    return () => {
      window.removeEventListener("immapp:invoice-imported", handleInvoiceImported);
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Se incarca dashboard-ul din baza de date...
      </div>
    );
  }

  if (errorMessage || !dashboardData) {
    return (
      <div>
        <PageHeader
          title="Dashboard"
          description="Privire de ansamblu asupra activitatii financiare a firmei."
        />

        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {errorMessage || "Nu s-au putut incarca datele pentru dashboard."}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Privire de ansamblu asupra activitatii financiare a firmei."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Facturi importate"
          value={String(dashboardData.invoiceCount)}
          icon={<FileText className="h-4 w-4" />}
          trend={{ value: "din baza de date", positive: true }}
        />

        <KpiCard
          label="Valoare totala"
          value={formatRON(dashboardData.totalValue)}
          icon={<Wallet className="h-4 w-4" />}
          trend={{ value: "calculata automat", positive: true }}
        />

        <KpiCard
          label="TVA colectata"
          value={formatRON(dashboardData.totalVat)}
          icon={<Percent className="h-4 w-4" />}
          hint="Calculata din e-Facturi XML"
        />

        <KpiCard
          label="Furnizori"
          value={String(dashboardData.supplierCount)}
          icon={<Truck className="h-4 w-4" />}
        />

        <KpiCard
          label="Clienti"
          value={String(dashboardData.customerCount)}
          icon={<Users className="h-4 w-4" />}
        />

        <KpiCard
          label="Documente procesate"
          value={String(dashboardData.documentsProcessed)}
          icon={<CheckCircle2 className="h-4 w-4" />}
          hint="XML-uri salvate in Supabase"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Evolutie valoare facturi"
          description="Total lunar calculat din e-Facturi"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={dashboardData.monthlyInvoiceValue}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                formatter={(v: number) => formatRON(v)}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--color-chart-1)"
                strokeWidth={2.5}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distributie TVA" description="TVA vs baza fara TVA">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={dashboardData.vatDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {dashboardData.vatDistribution.map((_, i) => (
                  <Cell key={i} fill={chartColors[i]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => formatRON(v)}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top furnizori" description="Dupa valoare totala">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={dashboardData.topSuppliers}
              layout="vertical"
              margin={{ left: 30 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis
                type="category"
                dataKey="name"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                width={110}
              />
              <Tooltip
                formatter={(v: number) => formatRON(v)}
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="value" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Documente procesate / luna" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dashboardData.docsPerMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-card)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="docs" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-primary/10 p-3 text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-base font-semibold">Analiza predictiva</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Estimare pentru perioada urmatoare:{" "}
                <span className="font-medium text-foreground">
                  {dashboardData.prediction.predictedPeriod}
                </span>
              </p>

              <p className="mt-3 text-2xl font-bold">
                {formatRON(dashboardData.prediction.predictedValue)}
              </p>

              <p className="mt-2 text-sm text-muted-foreground">
                {dashboardData.prediction.explanation}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="text-base font-semibold">Ultimele documente importate</h2>
              <p className="text-xs text-muted-foreground">
                Documente extrase din baza de date
              </p>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nume document</TableHead>
                <TableHead>Tip</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valoare</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {dashboardData.latestDocuments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    Nu exista documente importate.
                  </TableCell>
                </TableRow>
              ) : (
                dashboardData.latestDocuments.map((document) => (
                  <TableRow key={document.id}>
                    <TableCell className="font-medium">{document.name}</TableCell>

                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {document.type}
                      </span>
                    </TableCell>

                    <TableCell>{document.uploadedAt}</TableCell>

                    <TableCell>
                      <StatusBadge status={normalizeStatus(document.status)} />
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {document.total ? formatRON(document.total) : "—"}
                    </TableCell>

                    <TableCell>
                      <Button variant="ghost" size="sm">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}