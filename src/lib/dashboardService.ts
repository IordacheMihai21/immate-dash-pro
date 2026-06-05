import { DEMO_COMPANY_ID, supabase } from "./supabaseClient";

type RelationParty =
  | {
      name: string | null;
      cui: string | null;
    }
  | {
      name: string | null;
      cui: string | null;
    }[]
  | null
  | undefined;

function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getMonthKey(dateValue: string | null | undefined): string {
  if (!dateValue) {
    return "Necunoscut";
  }

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Necunoscut";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(monthKey: string): string {
  if (monthKey === "Necunoscut") {
    return "N/A";
  }

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return date.toLocaleDateString("ro-RO", {
    month: "short",
  });
}

function getNextMonthKey(monthKey: string): string {
  if (monthKey === "Necunoscut") {
    return "Necunoscut";
  }

  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  date.setMonth(date.getMonth() + 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export async function getDashboardData() {
  const { data: invoicesData, error: invoicesError } = await supabase
    .from("invoices")
    .select(`
      id,
      invoice_number,
      issue_date,
      created_at,
      supplier_id,
      customer_id,
      tax_amount,
      payable_amount,
      status,
      suppliers (
        name,
        cui
      ),
      customers (
        name,
        cui
      ),
      documents (
        file_name,
        document_type,
        uploaded_at
      )
    `)
    .eq("company_id", DEMO_COMPANY_ID)
    .order("created_at", { ascending: false });

  if (invoicesError) {
    throw new Error(`Eroare la citirea datelor pentru dashboard: ${invoicesError.message}`);
  }

  const { data: documentsData, error: documentsError } = await supabase
    .from("documents")
    .select("id, file_name, document_type, status, uploaded_at")
    .eq("company_id", DEMO_COMPANY_ID)
    .order("uploaded_at", { ascending: false });

  if (documentsError) {
    throw new Error(`Eroare la citirea documentelor: ${documentsError.message}`);
  }

  const invoices = invoicesData ?? [];
  const documents = documentsData ?? [];

  const invoiceCount = invoices.length;
  const totalValue = invoices.reduce((sum, invoice) => sum + toNumber(invoice.payable_amount), 0);
  const totalVat = invoices.reduce((sum, invoice) => sum + toNumber(invoice.tax_amount), 0);

  const supplierIds = new Set(
    invoices
      .map((invoice) => invoice.supplier_id)
      .filter(Boolean),
  );

  const customerIds = new Set(
    invoices
      .map((invoice) => invoice.customer_id)
      .filter(Boolean),
  );

  const monthlyTotals = new Map<string, number>();

  invoices.forEach((invoice) => {
    const monthKey = getMonthKey(invoice.issue_date ?? invoice.created_at);
    const previous = monthlyTotals.get(monthKey) ?? 0;
    monthlyTotals.set(monthKey, previous + toNumber(invoice.payable_amount));
  });

  const monthlyInvoiceValue = Array.from(monthlyTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({
      month: getMonthLabel(month),
      monthKey: month,
      value,
    }));

  const supplierTotals = new Map<string, number>();

  invoices.forEach((invoice) => {
    const supplier = getRelationParty(invoice.suppliers as RelationParty);
    const supplierName = supplier?.name ?? "Furnizor necunoscut";
    const previous = supplierTotals.get(supplierName) ?? 0;
    supplierTotals.set(supplierName, previous + toNumber(invoice.payable_amount));
  });

  const topSuppliers = Array.from(supplierTotals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const docsPerMonthMap = new Map<string, number>();

  documents.forEach((document) => {
    const monthKey = getMonthKey(document.uploaded_at);
    const previous = docsPerMonthMap.get(monthKey) ?? 0;
    docsPerMonthMap.set(monthKey, previous + 1);
  });

  const docsPerMonth = Array.from(docsPerMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, docs]) => ({
      month: getMonthLabel(month),
      docs,
    }));

  const latestDocuments = invoices.slice(0, 7).map((invoice) => {
    const documentsRelation = invoice.documents as
      | {
          file_name: string | null;
          document_type: string | null;
          uploaded_at: string | null;
        }
      | {
          file_name: string | null;
          document_type: string | null;
          uploaded_at: string | null;
        }[]
      | null
      | undefined;

    const documentData = Array.isArray(documentsRelation)
      ? documentsRelation[0]
      : documentsRelation;

    return {
      id: invoice.id,
      name: documentData?.file_name ?? `Factura ${invoice.invoice_number}`,
      type: documentData?.document_type ?? "e-factura",
      uploadedAt: documentData?.uploaded_at
        ? documentData.uploaded_at.slice(0, 10)
        : invoice.created_at?.slice(0, 10) ?? "-",
      status: invoice.status ?? "procesata",
      total: toNumber(invoice.payable_amount),
    };
  });

  const vatDistribution = [
    {
      name: "TVA colectata",
      value: totalVat,
    },
    {
      name: "Baza fara TVA",
      value: Math.max(totalValue - totalVat, 0),
    },
  ];

  let predictedValue = totalValue;
  let predictedPeriod = "N/A";
  let predictionExplanation = "Nu exista suficiente date istorice pentru o estimare relevanta.";

  if (monthlyInvoiceValue.length > 0) {
    const values = monthlyInvoiceValue.map((item) => item.value);
    const lastValue = values[values.length - 1];

    if (values.length >= 2) {
      const changes = values.slice(1).map((value, index) => value - values[index]);
      const averageChange =
        changes.reduce((sum, change) => sum + change, 0) / changes.length;

      predictedValue = Math.max(lastValue + averageChange, 0);
      predictionExplanation =
        averageChange >= 0
          ? "Estimarea indica o posibila crestere a valorii facturilor pe baza trendului istoric."
          : "Estimarea indica o posibila scadere a valorii facturilor pe baza trendului istoric.";
    } else {
      predictedValue = lastValue;
      predictionExplanation =
        "Estimarea foloseste valoarea ultimei luni deoarece exista o singura perioada disponibila.";
    }

    const lastMonthKey = monthlyInvoiceValue[monthlyInvoiceValue.length - 1].monthKey;
    predictedPeriod = getMonthLabel(getNextMonthKey(lastMonthKey));
  }

  return {
    invoiceCount,
    totalValue,
    totalVat,
    supplierCount: supplierIds.size,
    customerCount: customerIds.size,
    documentsProcessed: documents.length,
    monthlyInvoiceValue,
    vatDistribution,
    topSuppliers,
    docsPerMonth,
    latestDocuments,
    prediction: {
      predictedValue,
      predictedPeriod,
      explanation: predictionExplanation,
    },
  };
}