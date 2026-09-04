import { classifyInvoiceForCompany } from "@/lib/cuiUtils";
import { getOrCreateCompanyProfile } from "@/lib/companyService";
import { getInvoices } from "@/lib/invoiceService";

// Per-client risk, not the portfolio-wide one in riskClassificationService.ts.
//
// This is deliberately NOT based on late/unpaid-invoice signals, even though
// the invoices table has payment_status and due_date columns that look like
// the obvious source for that. Checked directly against the data: every
// single invoice in this company's history has payment_status = 'neplatita'
// and status = 'procesata' -- those columns exist in the schema but nothing
// in the app (e-Factura import included) ever updates them. Scoring risk off
// "unpaid" when literally every invoice is marked unpaid would flag 100% of
// clients as high-risk from a data artifact, not a real signal -- worse than
// no feature at all. Real payment-lateness risk needs a "mark as paid"
// workflow first (not built yet); this scores what IS real: how a client's
// ordering cadence and volume are actually trending.

export type ClientRiskClass = "Scazut" | "Mediu" | "Ridicat" | "Insuficient";

export type ClientRiskProfile = {
  key: string;
  name: string;
  cui: string;
  invoiceCount: number;
  totalValue: number;
  lastInvoiceDate: string | null;
  daysSinceLastInvoice: number | null;
  averageGapDays: number | null;
  recentTrendPercent: number | null;
  concentrationPercent: number;
  riskClass: ClientRiskClass;
  riskFactors: string[];
};

type RelationParty =
  | { name: string | null; cui: string | null }
  | { name: string | null; cui: string | null }[]
  | null
  | undefined;

type InvoiceForRisk = {
  payable_amount: number | null;
  issue_date: string | null;
  created_at: string | null;
  customers?: RelationParty;
};

const RECENT_WINDOW_DAYS = 90;
const MIN_GAP_DAYS = 14;
const KEY_CLIENT_THRESHOLD_PERCENT = 15;

function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  return Array.isArray(party) ? (party[0] ?? null) : party;
}

function daysBetween(from: number, to: number): number {
  return (to - from) / (1000 * 60 * 60 * 24);
}

function classifyRiskScore(score: number): ClientRiskClass {
  if (score >= 70) {
    return "Ridicat";
  }

  if (score >= 42) {
    return "Mediu";
  }

  return "Scazut";
}

export async function getCustomerRiskProfiles(): Promise<ClientRiskProfile[]> {
  const [invoices, companyProfile] = await Promise.all([
    getInvoices(),
    getOrCreateCompanyProfile(),
  ]);

  const salesInvoices = (invoices as InvoiceForRisk[]).filter(
    (invoice) => classifyInvoiceForCompany(invoice, companyProfile.cui) === "revenue",
  );

  const byKey = new Map<
    string,
    { name: string; cui: string; dates: number[]; amounts: number[] }
  >();
  let grandTotal = 0;

  for (const invoice of salesInvoices) {
    const party = getRelationParty(invoice.customers);
    const name = party?.name?.trim();

    if (!name) {
      continue;
    }

    const cui = party?.cui?.trim() ?? "";
    const key = cui || name;
    const dateText = invoice.issue_date ?? invoice.created_at;
    const timestamp = dateText ? new Date(dateText).getTime() : null;
    const amount = Number(invoice.payable_amount ?? 0);

    if (timestamp === null || Number.isNaN(timestamp)) {
      continue;
    }

    grandTotal += amount;
    const existing = byKey.get(key);

    if (existing) {
      existing.dates.push(timestamp);
      existing.amounts.push(amount);
    } else {
      byKey.set(key, { name, cui, dates: [timestamp], amounts: [amount] });
    }
  }

  const now = Date.now();

  const profiles: ClientRiskProfile[] = Array.from(byKey.entries()).map(([key, client]) => {
    const sortedIndexes = client.dates
      .map((_, index) => index)
      .sort((a, b) => client.dates[a] - client.dates[b]);
    const dates = sortedIndexes.map((index) => client.dates[index]);
    const amounts = sortedIndexes.map((index) => client.amounts[index]);
    const invoiceCount = dates.length;
    const totalValue = amounts.reduce((sum, amount) => sum + amount, 0);
    const lastDate = dates[dates.length - 1];
    const concentrationPercent = grandTotal > 0 ? (totalValue / grandTotal) * 100 : 0;
    const riskFactors: string[] = [];

    if (invoiceCount < 2) {
      if (concentrationPercent >= KEY_CLIENT_THRESHOLD_PERCENT) {
        riskFactors.push(
          `Reprezinta ${concentrationPercent.toFixed(0)}% din veniturile totale -- dependenta ridicata pe o singura factura.`,
        );
      }

      return {
        key,
        name: client.name,
        cui: client.cui,
        invoiceCount,
        totalValue,
        lastInvoiceDate: new Date(lastDate).toISOString().slice(0, 10),
        daysSinceLastInvoice: Math.round(daysBetween(lastDate, now)),
        averageGapDays: null,
        recentTrendPercent: null,
        concentrationPercent,
        riskClass: "Insuficient",
        riskFactors:
          riskFactors.length > 0
            ? riskFactors
            : ["O singura factura pana acum -- prea putin istoric pentru o evaluare de risc."],
      };
    }

    const firstDate = dates[0];
    const totalSpanDays = daysBetween(firstDate, lastDate);
    const averageGapDays = Math.max(totalSpanDays / (invoiceCount - 1), MIN_GAP_DAYS);
    const daysSinceLastInvoice = daysBetween(lastDate, now);
    const recencyRatio = daysSinceLastInvoice / averageGapDays;

    const recentCutoff = now - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const priorCutoff = now - 2 * RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    let recentValue = 0;
    let priorValue = 0;

    dates.forEach((date, index) => {
      if (date >= recentCutoff) {
        recentValue += amounts[index];
      } else if (date >= priorCutoff) {
        priorValue += amounts[index];
      }
    });

    const recentTrendPercent =
      priorValue > 0 ? ((recentValue - priorValue) / priorValue) * 100 : recentValue > 0 ? 100 : 0;

    let score = 15;

    if (recencyRatio > 4) {
      score += 40;
      riskFactors.push(
        `Nu a mai facturat de ${Math.round(daysSinceLastInvoice)} zile, fata de o cadenta obisnuita de ~${Math.round(averageGapDays)} zile.`,
      );
    } else if (recencyRatio > 2) {
      score += 22;
      riskFactors.push(
        `A trecut mai mult decat dublul intervalului obisnuit (~${Math.round(averageGapDays)} zile) de la ultima factura.`,
      );
    } else if (recencyRatio > 1.3) {
      score += 10;
    }

    if (recentTrendPercent < -50) {
      score += 30;
      riskFactors.push(
        `Volumul facturat in ultimele ${RECENT_WINDOW_DAYS} de zile a scazut cu ${Math.abs(recentTrendPercent).toFixed(0)}% fata de perioada anterioara.`,
      );
    } else if (recentTrendPercent < -20) {
      score += 15;
      riskFactors.push(
        `Volumul facturat recent este in scadere (${recentTrendPercent.toFixed(0)}%) fata de perioada anterioara.`,
      );
    }

    if (concentrationPercent >= KEY_CLIENT_THRESHOLD_PERCENT) {
      riskFactors.push(
        `Reprezinta ${concentrationPercent.toFixed(0)}% din veniturile totale -- dependenta ridicata de acest client.`,
      );
    }

    if (riskFactors.length === 0) {
      riskFactors.push("Cadenta si volumul de facturare sunt in linie cu istoricul clientului.");
    }

    return {
      key,
      name: client.name,
      cui: client.cui,
      invoiceCount,
      totalValue,
      lastInvoiceDate: new Date(lastDate).toISOString().slice(0, 10),
      daysSinceLastInvoice: Math.round(daysSinceLastInvoice),
      averageGapDays: Math.round(averageGapDays),
      recentTrendPercent: Math.round(recentTrendPercent),
      concentrationPercent,
      riskClass: classifyRiskScore(score),
      riskFactors,
    };
  });

  return profiles.sort((a, b) => b.totalValue - a.totalValue);
}
