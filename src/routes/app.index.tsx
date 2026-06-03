import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";
import {
  documents,
  monthlyInvoiceValue,
  vatDistribution,
  topSuppliers,
  docsPerMonth,
  formatRON,
} from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/app/")({
  head: () => ({ meta: [{ title: "Dashboard — IMMapp" }] }),
  component: Dashboard,
});

const chartColors = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

function Dashboard() {
  // TODO: replace mock data with database data
  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Privire de ansamblu asupra activității financiare a firmei."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Facturi importate" value="148" icon={<FileText className="h-4 w-4" />} trend={{ value: "+12% vs luna trecută", positive: true }} />
        <KpiCard label="Valoare totală" value={formatRON(238450)} icon={<Wallet className="h-4 w-4" />} trend={{ value: "+8.4%", positive: true }} />
        <KpiCard label="TVA colectată" value={formatRON(12450)} icon={<Percent className="h-4 w-4" />} hint="TVA deductibilă: 8.730 RON" />
        <KpiCard label="Furnizori" value="32" icon={<Truck className="h-4 w-4" />} />
        <KpiCard label="Clienți" value="58" icon={<Users className="h-4 w-4" />} />
        <KpiCard label="Documente procesate" value="175" icon={<CheckCircle2 className="h-4 w-4" />} hint="6 în procesare" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <ChartCard
          title="Evoluție valoare facturi"
          description="Total lunar (RON)"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={monthlyInvoiceValue}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip
                formatter={(v: number) => formatRON(v)}
                contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
              />
              <Line type="monotone" dataKey="value" stroke="var(--color-chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribuție TVA" description="Colectată vs deductibilă">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={vatDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {vatDistribution.map((_, i) => (
                  <Cell key={i} fill={chartColors[i]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatRON(v)} contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 5 furnizori" description="După valoare totală">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topSuppliers} layout="vertical" margin={{ left: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={11} />
              <YAxis type="category" dataKey="name" stroke="var(--color-muted-foreground)" fontSize={11} width={110} />
              <Tooltip formatter={(v: number) => formatRON(v)} contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="value" fill="var(--color-chart-2)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Documente procesate / lună" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={docsPerMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="docs" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="mt-6">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border p-5">
            <div>
              <h2 className="text-base font-semibold">Ultimele documente importate</h2>
              <p className="text-xs text-muted-foreground">Ultimele 7 documente</p>
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
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{d.type}</span></TableCell>
                  <TableCell>{d.uploadedAt}</TableCell>
                  <TableCell><StatusBadge status={d.status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{d.total ? formatRON(d.total) : "—"}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
