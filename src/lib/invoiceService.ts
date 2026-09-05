import { getActiveCompanyId, getCompanyProfileById } from "./companyService";
import { ParsedInvoice, parseEFacturaXml } from "./efacturaParser";
import { supabase } from "./supabaseClient";

export type ManualInvoiceLineInput = {
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
};

export type ManualInvoiceInput = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  vatRatePercent: number;
  customer: {
    name: string;
    cui: string;
    address: string;
    city: string;
    country: string;
  };
  lines: ManualInvoiceLineInput[];
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type SavedInvoiceResult = {
  invoiceId: string;
  documentId: string;
};

export type DocumentAiInvoiceInput = {
  fileName: string;
  fileType: string;
  extractedText: string;
  invoiceNumber: string;
  issueDate: string | null;
  currency: string;
  supplierName: string;
  supplierCui: string;
  customerName: string;
  customerCui: string;
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  payableAmount: number;
  confidenceByField?: Record<string, number>;
  classification?: "revenue" | "expense" | "unclassified";
};

function cleanCui(cui: string): string {
  return cui.trim().replace(/\s+/g, "").toUpperCase();
}

async function upsertSupplier(invoice: ParsedInvoice, companyId: string) {
  const supplierCui = cleanCui(invoice.supplier.cui || `UNKNOWN_SUPPLIER_${invoice.invoiceNumber}`);

  const { data, error } = await supabase
    .from("suppliers")
    .upsert(
      {
        company_id: companyId,
        name: invoice.supplier.name || "Furnizor necunoscut",
        cui: supplierCui,
        address: invoice.supplier.address,
        city: invoice.supplier.city,
        country: invoice.supplier.country || "RO",
      },
      {
        onConflict: "company_id,cui",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Eroare la salvarea furnizorului: ${error.message}`);
  }

  return data.id as string;
}

async function upsertCustomer(invoice: ParsedInvoice, companyId: string) {
  const customerCui = cleanCui(invoice.customer.cui || `UNKNOWN_CUSTOMER_${invoice.invoiceNumber}`);

  const { data, error } = await supabase
    .from("customers")
    .upsert(
      {
        company_id: companyId,
        name: invoice.customer.name || "Client necunoscut",
        cui: customerCui,
        address: invoice.customer.address,
        city: invoice.customer.city,
        country: invoice.customer.country || "RO",
      },
      {
        onConflict: "company_id,cui",
      },
    )
    .select("id")
    .single();

  if (error) {
    throw new Error(`Eroare la salvarea clientului: ${error.message}`);
  }

  return data.id as string;
}

async function saveDocument({
  fileName,
  originalContent,
  companyId,
  fileType,
  documentType,
}: {
  fileName: string;
  originalContent: string;
  companyId: string;
  fileType: string;
  documentType: string;
}) {
  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      file_name: fileName,
      file_type: fileType,
      document_type: documentType,
      status: "procesat",
      original_content: originalContent,
      processed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Eroare la salvarea documentului: ${error.message}`);
  }

  return data.id as string;
}

async function saveInvoice(
  invoice: ParsedInvoice,
  documentId: string,
  supplierId: string,
  customerId: string,
  companyId: string,
) {
  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", companyId)
    .eq("invoice_number", invoice.invoiceNumber)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Eroare la verificarea facturii existente: ${existingError.message}`);
  }

  if (existingInvoice) {
    throw new Error(`Factura ${invoice.invoiceNumber} exista deja in aplicatie.`);
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      company_id: companyId,
      document_id: documentId,
      supplier_id: supplierId,
      customer_id: customerId,
      invoice_number: invoice.invoiceNumber,
      issue_date: invoice.issueDate,
      due_date: invoice.dueDate,
      currency: invoice.currency,
      tax_exclusive_amount: invoice.taxExclusiveAmount,
      tax_amount: invoice.taxAmount,
      tax_inclusive_amount: invoice.taxInclusiveAmount,
      payable_amount: invoice.payableAmount,
      status: "procesata",
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Eroare la salvarea facturii: ${error.message}`);
  }

  return data.id as string;
}

async function saveInvoiceLines(invoice: ParsedInvoice, invoiceId: string) {
  if (invoice.lines.length === 0) {
    return;
  }

  const rows = invoice.lines.map((line) => ({
    invoice_id: invoiceId,
    line_number: line.lineNumber,
    description: line.description,
    quantity: line.quantity,
    unit_code: line.unitCode,
    unit_price: line.unitPrice,
    line_total: line.lineTotal,
  }));

  const { error } = await supabase.from("invoice_lines").insert(rows);

  if (error) {
    throw new Error(`Eroare la salvarea liniilor facturii: ${error.message}`);
  }
}

async function saveExtractedEntities(
  invoice: ParsedInvoice,
  documentId: string,
  invoiceId: string,
  options?: {
    confidenceByField?: Record<string, number>;
    extractionMethod?: string;
  },
) {
  const confidenceByField = options?.confidenceByField ?? {};
  const extractionMethod = options?.extractionMethod ?? "xml_parser";
  const entities = [
    ["invoice_number", invoice.invoiceNumber],
    ["issue_date", invoice.issueDate ?? ""],
    ["due_date", invoice.dueDate ?? ""],
    ["currency", invoice.currency],
    ["supplier_name", invoice.supplier.name],
    ["supplier_cui", invoice.supplier.cui],
    ["customer_name", invoice.customer.name],
    ["customer_cui", invoice.customer.cui],
    ["tax_exclusive_amount", String(invoice.taxExclusiveAmount)],
    ["tax_amount", String(invoice.taxAmount)],
    ["tax_inclusive_amount", String(invoice.taxInclusiveAmount)],
    ["payable_amount", String(invoice.payableAmount)],
  ]
    .filter(([, value]) => value !== "")
    .map(([entity_type, entity_value]) => ({
      document_id: documentId,
      invoice_id: invoiceId,
      entity_type,
      entity_value,
      confidence: confidenceByField[entity_type] ?? 1,
      extraction_method: extractionMethod,
    }));

  if (entities.length === 0) {
    return;
  }

  const { error } = await supabase.from("extracted_entities").insert(entities);

  if (error) {
    throw new Error(`Eroare la salvarea entitatilor extrase: ${error.message}`);
  }
}

async function saveEntityRelations(
  invoice: ParsedInvoice,
  documentId: string,
  options?: {
    classification?: "revenue" | "expense" | "unclassified";
  },
) {
  const classification = options?.classification ?? "unclassified";
  const roleRelation = {
    revenue: "este_furnizor",
    expense: "este_client",
    unclassified: "necesita_asociere",
  }[classification];
  const roleTarget = {
    revenue: "Venit",
    expense: "Cheltuiala",
    unclassified: "Neclasificat",
  }[classification];
  const relations = [
    {
      document_id: documentId,
      source_entity: invoice.supplier.name || invoice.supplier.cui || "Furnizor necunoscut",
      relation_type: "emite",
      target_entity: `Factura ${invoice.invoiceNumber}`,
    },
    {
      document_id: documentId,
      source_entity: invoice.customer.name || invoice.customer.cui || "Client necunoscut",
      relation_type: "primeste",
      target_entity: `Factura ${invoice.invoiceNumber}`,
    },
    {
      document_id: documentId,
      source_entity: `Factura ${invoice.invoiceNumber}`,
      relation_type: "contine_linii_factura",
      target_entity: "Linii factura",
    },
    {
      document_id: documentId,
      source_entity: `Factura ${invoice.invoiceNumber}`,
      relation_type: "include_tva",
      target_entity: String(invoice.taxAmount),
    },
    {
      document_id: documentId,
      source_entity: "Companie curenta",
      relation_type: roleRelation,
      target_entity: roleTarget,
    },
  ];

  const { error } = await supabase.from("entity_relations").insert(relations);

  if (error) {
    throw new Error(`Eroare la salvarea relatiilor: ${error.message}`);
  }
}

export async function importEFacturaXml(file: File): Promise<SavedInvoiceResult> {
  const companyId = await getActiveCompanyId();
  const xmlText = await file.text();
  const parsedInvoice = parseEFacturaXml(xmlText);

  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", companyId)
    .eq("invoice_number", parsedInvoice.invoiceNumber)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Eroare la verificarea facturii existente: ${existingError.message}`);
  }

  if (existingInvoice) {
    throw new Error(`Factura ${parsedInvoice.invoiceNumber} exista deja in aplicatie.`);
  }

  const documentId = await saveDocument({
    fileName: file.name,
    originalContent: xmlText,
    companyId,
    fileType: "xml",
    documentType: "e-factura",
  });
  const supplierId = await upsertSupplier(parsedInvoice, companyId);
  const customerId = await upsertCustomer(parsedInvoice, companyId);
  const invoiceId = await saveInvoice(parsedInvoice, documentId, supplierId, customerId, companyId);

  await saveInvoiceLines(parsedInvoice, invoiceId);
  await saveExtractedEntities(parsedInvoice, documentId, invoiceId);
  await saveEntityRelations(parsedInvoice, documentId);

  return {
    invoiceId,
    documentId,
  };
}

export async function saveDocumentAiInvoice(
  input: DocumentAiInvoiceInput,
): Promise<SavedInvoiceResult> {
  const companyId = await getActiveCompanyId();
  const parsedInvoice: ParsedInvoice = {
    invoiceNumber: input.invoiceNumber.trim(),
    issueDate: input.issueDate,
    dueDate: null,
    currency: input.currency || "RON",
    supplier: {
      name: input.supplierName || "Furnizor necunoscut",
      cui: input.supplierCui,
      address: "",
      city: "",
      country: "RO",
    },
    customer: {
      name: input.customerName || "Client necunoscut",
      cui: input.customerCui,
      address: "",
      city: "",
      country: "RO",
    },
    taxExclusiveAmount: input.taxExclusiveAmount,
    taxAmount: input.taxAmount,
    taxInclusiveAmount: input.taxInclusiveAmount,
    payableAmount: input.payableAmount,
    lines: [],
  };

  if (!parsedInvoice.invoiceNumber) {
    throw new Error("Numarul facturii este necesar pentru salvare.");
  }

  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", companyId)
    .eq("invoice_number", parsedInvoice.invoiceNumber)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Eroare la verificarea facturii existente: ${existingError.message}`);
  }

  if (existingInvoice) {
    throw new Error(`Factura ${parsedInvoice.invoiceNumber} exista deja in aplicatie.`);
  }

  const documentId = await saveDocument({
    fileName: input.fileName,
    originalContent: input.extractedText,
    companyId,
    fileType: input.fileType,
    documentType: "document-ai",
  });
  const supplierId = await upsertSupplier(parsedInvoice, companyId);
  const customerId = await upsertCustomer(parsedInvoice, companyId);
  const invoiceId = await saveInvoice(parsedInvoice, documentId, supplierId, customerId, companyId);

  await saveExtractedEntities(parsedInvoice, documentId, invoiceId, {
    confidenceByField: input.confidenceByField,
    extractionMethod: "document_ai",
  });
  await saveEntityRelations(parsedInvoice, documentId, {
    classification: input.classification,
  });

  return {
    invoiceId,
    documentId,
  };
}

export async function createManualInvoice(input: ManualInvoiceInput): Promise<SavedInvoiceResult> {
  const companyId = await getActiveCompanyId();
  // The active company's own profile, not "whichever company the current
  // auth user personally owns" -- matters for an accountant creating an
  // invoice while viewing a client company they don't own themselves.
  const companyProfile = await getCompanyProfileById(companyId);

  if (!companyProfile) {
    throw new Error("Completeaza profilul companiei inainte de a emite o factura.");
  }

  const invoiceNumber = input.invoiceNumber.trim();

  if (!invoiceNumber) {
    throw new Error("Numarul facturii este necesar.");
  }

  const lineInputs = input.lines.filter((line) => line.description.trim().length > 0);

  if (lineInputs.length === 0) {
    throw new Error("Adauga cel putin o linie facturii.");
  }

  const lines = lineInputs.map((line, index) => ({
    lineNumber: String(index + 1),
    description: line.description.trim(),
    quantity: line.quantity,
    unitCode: line.unitCode.trim() || "buc",
    unitPrice: line.unitPrice,
    lineTotal: round2(line.quantity * line.unitPrice),
  }));

  const taxExclusiveAmount = round2(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const taxAmount = round2(taxExclusiveAmount * (input.vatRatePercent / 100));
  const taxInclusiveAmount = round2(taxExclusiveAmount + taxAmount);

  const parsedInvoice: ParsedInvoice = {
    invoiceNumber,
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    currency: input.currency || "RON",
    supplier: {
      name: companyProfile.company_name || "Compania mea",
      cui: companyProfile.cui,
      address: companyProfile.address,
      city: companyProfile.city,
      country: "RO",
    },
    customer: {
      name: input.customer.name.trim() || "Client necunoscut",
      cui: input.customer.cui.trim(),
      address: input.customer.address,
      city: input.customer.city,
      country: input.customer.country || "RO",
    },
    taxExclusiveAmount,
    taxAmount,
    taxInclusiveAmount,
    payableAmount: taxInclusiveAmount,
    lines,
  };

  const { data: existingInvoice, error: existingError } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", companyId)
    .eq("invoice_number", parsedInvoice.invoiceNumber)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Eroare la verificarea facturii existente: ${existingError.message}`);
  }

  if (existingInvoice) {
    throw new Error(`Factura ${parsedInvoice.invoiceNumber} exista deja in aplicatie.`);
  }

  const documentId = await saveDocument({
    fileName: `${invoiceNumber}.json`,
    originalContent: JSON.stringify(parsedInvoice),
    companyId,
    fileType: "manual",
    documentType: "factura-emisa",
  });
  const supplierId = await upsertSupplier(parsedInvoice, companyId);
  const customerId = await upsertCustomer(parsedInvoice, companyId);
  const invoiceId = await saveInvoice(parsedInvoice, documentId, supplierId, customerId, companyId);

  await saveInvoiceLines(parsedInvoice, invoiceId);
  await saveExtractedEntities(parsedInvoice, documentId, invoiceId, {
    extractionMethod: "manual_entry",
  });
  await saveEntityRelations(parsedInvoice, documentId, { classification: "revenue" });

  return {
    invoiceId,
    documentId,
  };
}

export async function getInvoices() {
  const companyId = await getActiveCompanyId();

  const { data, error } = await supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      issue_date,
      currency,
      tax_exclusive_amount,
      tax_amount,
      tax_inclusive_amount,
      payable_amount,
      status,
      created_at,
      suppliers (
        name,
        cui
      ),
      customers (
        name,
        cui
      )
    `,
    )
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Eroare la citirea facturilor: ${error.message}`);
  }

  return data ?? [];
}

export async function getInvoiceDetails(invoiceId: string) {
  const companyId = await getActiveCompanyId();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      issue_date,
      due_date,
      currency,
      tax_exclusive_amount,
      tax_amount,
      tax_inclusive_amount,
      payable_amount,
      status,
      created_at,
      document_id,
      documents (
        id,
        file_name,
        document_type,
        original_content,
        uploaded_at
      ),
      suppliers (
        name,
        cui,
        address,
        city,
        country
      ),
      customers (
        name,
        cui,
        address,
        city,
        country
      )
    `,
    )
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .single();

  if (invoiceError) {
    throw new Error(`Eroare la citirea facturii: ${invoiceError.message}`);
  }

  const { data: lines, error: linesError } = await supabase
    .from("invoice_lines")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("line_number", { ascending: true });

  if (linesError) {
    throw new Error(`Eroare la citirea liniilor facturii: ${linesError.message}`);
  }

  const { data: entities, error: entitiesError } = await supabase
    .from("extracted_entities")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("entity_type", { ascending: true });

  if (entitiesError) {
    throw new Error(`Eroare la citirea entitatilor extrase: ${entitiesError.message}`);
  }

  const { data: relations, error: relationsError } = await supabase
    .from("entity_relations")
    .select("*")
    .eq("document_id", invoice.document_id)
    .order("created_at", { ascending: true });

  if (relationsError) {
    throw new Error(`Eroare la citirea relatiilor dintre entitati: ${relationsError.message}`);
  }

  return {
    invoice,
    lines: lines ?? [],
    entities: entities ?? [],
    relations: relations ?? [],
  };
}

export async function getDocuments() {
  const companyId = await getActiveCompanyId();

  const { data, error } = await supabase
    .from("documents")
    .select(
      `
      id,
      file_name,
      file_type,
      document_type,
      status,
      uploaded_at,
      processed_at,
      invoices (
        id,
        invoice_number,
        payable_amount
      )
    `,
    )
    .eq("company_id", companyId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(`Eroare la citirea documentelor: ${error.message}`);
  }

  return data ?? [];
}

export async function deleteDocuments(documentIds: string[]) {
  const companyId = await getActiveCompanyId();
  const ids = Array.from(new Set(documentIds)).filter(Boolean);

  if (ids.length === 0) {
    return {
      deletedDocuments: 0,
      deletedInvoices: 0,
    };
  }

  const { data: invoicesData, error: invoicesSelectError } = await supabase
    .from("invoices")
    .select("id")
    .eq("company_id", companyId)
    .in("document_id", ids);

  if (invoicesSelectError) {
    throw new Error(`Eroare la identificarea facturilor asociate: ${invoicesSelectError.message}`);
  }

  const invoiceIds = (invoicesData ?? []).map((invoice) => invoice.id).filter(Boolean) as string[];

  if (invoiceIds.length > 0) {
    const { error: linesError } = await supabase
      .from("invoice_lines")
      .delete()
      .in("invoice_id", invoiceIds);

    if (linesError) {
      throw new Error(`Eroare la stergerea liniilor de factura: ${linesError.message}`);
    }

    const { error: entitiesError } = await supabase
      .from("extracted_entities")
      .delete()
      .in("invoice_id", invoiceIds);

    if (entitiesError) {
      throw new Error(`Eroare la stergerea entitatilor extrase: ${entitiesError.message}`);
    }
  }

  const { error: relationsError } = await supabase
    .from("entity_relations")
    .delete()
    .in("document_id", ids);

  if (relationsError) {
    throw new Error(`Eroare la stergerea relatiilor dintre entitati: ${relationsError.message}`);
  }

  if (invoiceIds.length > 0) {
    const { error: invoicesError } = await supabase
      .from("invoices")
      .delete()
      .eq("company_id", companyId)
      .in("id", invoiceIds);

    if (invoicesError) {
      throw new Error(`Eroare la stergerea facturilor asociate: ${invoicesError.message}`);
    }
  }

  const { error: deleteDocumentsError } = await supabase
    .from("documents")
    .delete()
    .eq("company_id", companyId)
    .in("id", ids);

  if (deleteDocumentsError) {
    throw new Error(`Eroare la stergerea documentelor: ${deleteDocumentsError.message}`);
  }

  return {
    deletedDocuments: ids.length,
    deletedInvoices: invoiceIds.length,
  };
}

export async function deleteDocument(documentId: string) {
  return deleteDocuments([documentId]);
}
