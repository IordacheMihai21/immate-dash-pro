import { getOrCreateCompanyProfile } from "./companyService";
import { supabase } from "./supabaseClient";
import { buildAiFinancialForecast, type MonthlyFinancialPoint } from "./predictionService";
import { classifyInvoiceForCompany, normalizeCui } from "./cuiUtils";
import { evaluateDocumentExtraction } from "./extractionEvaluationService";
import { buildRiskClassification } from "./riskClassificationService";

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

type DocumentRelation =
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

function getRelationParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

function getDocument(document: DocumentRelation) {
  if (!document) {
    return null;
  }

  if (Array.isArray(document)) {
    return document[0] ?? null;
  }

  return document;
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

export async function getDashboardData() {
  const companyProfile = await getOrCreateCompanyProfile();
  const companyId = companyProfile.id;
  const companyCui = normalizeCui(companyProfile.cui);

  if (!companyId) {
    throw new Error("Profilul companiei nu a putut fi pregatit pentru dashboard.");
  }

  const { data: invoicesData, error: invoicesError } = await supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      issue_date,
      created_at,
      supplier_id,
      customer_id,
      currency,
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
    `,
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (invoicesError) {
    throw new Error(`Eroare la citirea datelor pentru dashboard: ${invoicesError.message}`);
  }

  const { data: documentsData, error: documentsError } = await supabase
    .from("documents")
    .select("id, file_name, document_type, status, uploaded_at")
    .eq("company_id", companyId)
    .order("uploaded_at", { ascending: false });

  if (documentsError) {
    throw new Error(`Eroare la citirea documentelor: ${documentsError.message}`);
  }

  const invoices = invoicesData ?? [];
  const documents = documentsData ?? [];
  const classifiedInvoices = invoices.map((invoice) => {
    const supplier = getRelationParty(invoice.suppliers as RelationParty);
    const customer = getRelationParty(invoice.customers as RelationParty);

    return {
      invoice,
      supplier,
      customer,
      classification: classifyInvoiceForCompany(invoice, companyCui),
      value: toNumber(invoice.payable_amount),
      vat: toNumber(invoice.tax_amount),
    };
  });
  const revenueInvoices = classifiedInvoices.filter((item) => item.classification === "revenue");
  const expenseInvoices = classifiedInvoices.filter((item) => item.classification === "expense");
  const unclassifiedInvoices = classifiedInvoices.filter(
    (item) => item.classification === "unclassified",
  );

  const invoiceCount = invoices.length;

  const totalValue = classifiedInvoices.reduce((sum, item) => sum + item.value, 0);
  const totalRevenue = revenueInvoices.reduce((sum, item) => sum + item.value, 0);
  const totalExpenses = expenseInvoices.reduce((sum, item) => sum + item.value, 0);
  const netProfit = totalRevenue - totalExpenses;
  const classifiedInvoiceCount = revenueInvoices.length + expenseInvoices.length;
  const classifiedInvoiceValue = totalRevenue + totalExpenses;
  const unclassifiedInvoiceCount = unclassifiedInvoices.length;
  const unclassifiedInvoiceValue = unclassifiedInvoices.reduce((sum, item) => sum + item.value, 0);

  const totalVat = [...revenueInvoices, ...expenseInvoices].reduce(
    (sum, item) => sum + item.vat,
    0,
  );

  const supplierIds = new Set(
    expenseInvoices.map(({ invoice }) => invoice.supplier_id).filter(Boolean),
  );

  const customerIds = new Set(
    revenueInvoices.map(({ invoice }) => invoice.customer_id).filter(Boolean),
  );

  console.debug("Invoice classification summary", {
    revenueCount: revenueInvoices.length,
    expenseCount: expenseInvoices.length,
    unclassifiedCount: unclassifiedInvoiceCount,
    revenueTotal: totalRevenue,
    expenseTotal: totalExpenses,
  });

  const monthlyRevenueTotals = new Map<
    string,
    {
      value: number;
      invoiceCount: number;
    }
  >();
  const monthlyExpenseTotals = new Map<
    string,
    {
      value: number;
      invoiceCount: number;
    }
  >();

  revenueInvoices.forEach(({ invoice, value }) => {
    const monthKey = getMonthKey(invoice.issue_date ?? invoice.created_at);
    const previous = monthlyRevenueTotals.get(monthKey) ?? {
      value: 0,
      invoiceCount: 0,
    };

    monthlyRevenueTotals.set(monthKey, {
      value: previous.value + value,
      invoiceCount: previous.invoiceCount + 1,
    });
  });

  expenseInvoices.forEach(({ invoice, value }) => {
    const monthKey = getMonthKey(invoice.issue_date ?? invoice.created_at);
    const previous = monthlyExpenseTotals.get(monthKey) ?? {
      value: 0,
      invoiceCount: 0,
    };

    monthlyExpenseTotals.set(monthKey, {
      value: previous.value + value,
      invoiceCount: previous.invoiceCount + 1,
    });
  });

  const monthlyInvoiceValue = Array.from(monthlyRevenueTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, values]) => ({
      month: getMonthLabel(monthKey),
      monthKey,
      value: values.value,
      invoiceCount: values.invoiceCount,
    }));

  const monthlyExpenseValue = Array.from(monthlyExpenseTotals.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, values]) => ({
      month: getMonthLabel(monthKey),
      monthKey,
      value: values.value,
      invoiceCount: values.invoiceCount,
    }));

  const supplierTotals = new Map<string, number>();

  expenseInvoices.forEach(({ supplier, value }) => {
    const supplierName = supplier?.name ?? "Furnizor necunoscut";
    const previous = supplierTotals.get(supplierName) ?? 0;

    supplierTotals.set(supplierName, previous + value);
  });

  const topSuppliers = Array.from(supplierTotals.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const customerTotals = new Map<string, number>();

  revenueInvoices.forEach(({ customer, value }) => {
    const customerName = customer?.name ?? "Client necunoscut";
    const previous = customerTotals.get(customerName) ?? 0;

    customerTotals.set(customerName, previous + value);
  });

  const topCustomers = Array.from(customerTotals.entries())
    .map(([name, value]) => ({
      name,
      value,
      share: totalRevenue > 0 ? (value / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const monthlyFinancialMap = new Map<string, MonthlyFinancialPoint>();

  classifiedInvoices.forEach(({ invoice, classification, value, vat }) => {
    const monthKey = getMonthKey(invoice.issue_date ?? invoice.created_at);

    if (classification === "unclassified") {
      return;
    }

    const current = monthlyFinancialMap.get(monthKey) ?? {
      monthKey,
      revenue: 0,
      expenses: 0,
      vat: 0,
      invoiceCount: 0,
    };

    if (classification === "revenue") {
      current.revenue += value;
    } else {
      current.expenses += value;
    }

    current.vat += vat;
    current.invoiceCount += 1;

    monthlyFinancialMap.set(monthKey, current);
  });

  const monthlyFinancialPoints = Array.from(monthlyFinancialMap.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey),
  );

  const aiForecast = buildAiFinancialForecast(monthlyFinancialPoints);
  const riskClassification = buildRiskClassification(monthlyFinancialPoints, aiForecast);
  const documentExtractionEvaluation = evaluateDocumentExtraction(invoices[0] ?? null);

  const docsPerMonthMap = new Map<string, number>();

  documents.forEach((document) => {
    const monthKey = getMonthKey(document.uploaded_at);
    const previous = docsPerMonthMap.get(monthKey) ?? 0;

    docsPerMonthMap.set(monthKey, previous + 1);
  });

  const docsPerMonth = Array.from(docsPerMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, docs]) => ({
      month: getMonthLabel(monthKey),
      monthKey,
      docs,
    }));

  const latestDocuments = invoices.slice(0, 7).map((invoice) => {
    const documentData = getDocument(invoice.documents as DocumentRelation);

    return {
      id: invoice.id,
      name: documentData?.file_name ?? `Factura ${invoice.invoice_number}`,
      type: documentData?.document_type ?? "e-factura",
      uploadedAt: documentData?.uploaded_at
        ? documentData.uploaded_at.slice(0, 10)
        : (invoice.created_at?.slice(0, 10) ?? "-"),
      status: invoice.status ?? "procesata",
      total: toNumber(invoice.payable_amount),
    };
  });

  const latestInvoices = invoices.slice(0, 8).map((invoice) => {
    const supplier = getRelationParty(invoice.suppliers as RelationParty);
    const customer = getRelationParty(invoice.customers as RelationParty);

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      supplierName: supplier?.name ?? "Furnizor necunoscut",
      customerName: customer?.name ?? "Client necunoscut",
      issueDate: invoice.issue_date ?? invoice.created_at,
      total: toNumber(invoice.payable_amount),
      vat: toNumber(invoice.tax_amount),
      status: invoice.status ?? "procesata",
    };
  });

  const vatDistribution = [
    {
      name: "TVA colectata",
      value: totalVat,
    },
    {
      name: "Baza fara TVA",
      value: Math.max(classifiedInvoiceValue - totalVat, 0),
    },
  ];

  return {
    companyCui,
    invoiceCount,
    totalValue,
    totalRevenue,
    totalExpenses,
    netProfit,
    totalVat,
    classifiedInvoiceCount,
    classifiedInvoiceValue,
    unclassifiedInvoiceCount,
    unclassifiedInvoiceValue,
    supplierCount: supplierIds.size,
    customerCount: customerIds.size,
    documentsProcessed: documents.length,
    monthlyInvoiceValue,
    monthlyExpenseValue,
    vatDistribution,
    topSuppliers,
    topCustomers,
    docsPerMonth,
    latestDocuments,
    latestInvoices,
    prediction: aiForecast,
    riskClassification,
    documentExtractionEvaluation,
  };
}
