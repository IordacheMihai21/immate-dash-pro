import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { ChartCard } from "@/components/chart-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { Download, TrendingUp, TrendingDown, Percent, Wallet } from "lucide-react";
import { incomeVsExpenses, docsPerMonth, formatRON } from "@/lib/mock-data";

export const Route = createFileRoute("/app/rapoarte")({
  head: () => ({ meta: [{ title: "Rapoarte — IMMapp" }] }),
  component: ReportsPage,
});

const vatMonthly = incomeVsExpenses.map((m) => ({
  month: m.month,
  tva: Math.round((m.venituri - m.cheltuieli) * 0.19),
}));

function ReportsPage() {
  // TODO: connect to backend API for reports / AWS QuickSight integration
  return (
    <div>
      <PageHeader
        title="Rapoarte"
        description="Analize financiare pe perioadă, tip document și partener."
        actions={
          <Button className="gap-2">
            <Download className="h-4 w-4" /> Export raport
          </Button>
        }
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="from">De la</Label>
            <Input id="from" type="date" defaultValue="2025-01-01" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">Până la</Label>
            <Input id="to" type="date" defaultValue="2025-06-30" />
          </div>
          <div className="space-y-2">
            <Label>Tip document</Label>
            <Select defaultValue="all">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toate</SelectItem>
                <SelectItem value="xml">e-Factură XML</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="bank">Extras bancar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Furnizor / Client</Label>
            <Select defaultValue="all">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toți partenerii</SelectItem>
                <SelectItem value="suppliers">Doar furnizori</SelectItem>
                <SelectItem value="clients">Doar clienți</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Venituri totale" value={formatRON(298000)} icon={<TrendingUp className="h-4 w-4" />} trend={{ value: "+11.2%", positive: true }} />
        <KpiCard label="Cheltuieli totale" value={formatRON(238000)} icon={<TrendingDown className="h-4 w-4" />} trend={{ value: "+6.8%", positive: false }} />
        <KpiCard label="TVA" value={formatRON(21180)} icon={<Percent className="h-4 w-4" />} hint="Net colectat" />
        <KpiCard label="Sold estimat" value={formatRON(60000)} icon={<Wallet className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Venituri vs cheltuieli" description="Comparație lunară (RON)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={incomeVsExpenses}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip formatter={(v: number) => formatRON(v)} contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="venituri" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="cheltuieli" fill="var(--color-chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="TVA pe lună" description="Net rezultat (RON)">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={vatMonthly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip formatter={(v: number) => formatRON(v)} contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="tva" stroke="var(--color-chart-4)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Evoluție documente" description="Total documente procesate / lună" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={docsPerMonth}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="month" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
              <Bar dataKey="docs" fill="var(--color-chart-3)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
