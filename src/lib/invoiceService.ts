import { DEMO_COMPANY_ID, supabase } from './supabaseClient';
import { ParsedInvoice, parseEFacturaXml } from './efacturaParser';

export type SavedInvoiceResult = {
  invoiceId: string;
  documentId: string;
};

function cleanCui(cui: string): string {
  return cui.trim().replace(/\s+/g, '').toUpperCase();
}

async function upsertSupplier(invoice: ParsedInvoice) {
  const supplierCui = cleanCui(invoice.supplier.cui || `UNKNOWN_SUPPLIER_${invoice.invoiceNumber}`);

  const { data, error } = await supabase
    .from('suppliers')
    .upsert(
      {
        company_id: DEMO_COMPANY_ID,
        name: invoice.supplier.name || 'Furnizor necunoscut',
        cui: supplierCui,
        address: invoice.supplier.address,
        city: invoice.supplier.city,
        country: invoice.supplier.country || 'RO',
      },
      {
        onConflict: 'company_id,cui',
      },
    )
    .select('id')
    .single();

  if (error) {
    throw new Error(`Eroare la salvarea furnizorului: ${error.message}`);
  }

  return data.id as string;
}

async function upsertCustomer(invoice: ParsedInvoice) {
  const customerCui = cleanCui(invoice.customer.cui || `UNKNOWN_CUSTOMER_${invoice.invoiceNumber}`);

  const { data, error } = await supabase
    .from('customers')
    .upsert(
      {
        company_id: DEMO_COMPANY_ID,
        name: invoice.customer.name || 'Client necunoscut',
        cui: customerCui,
        address: invoice.customer.address,
        city: invoice.customer.city,
        country: invoice.customer.country || 'RO',
      },
      {
        onConflict: 'company_id,cui',
      },
    )
    .select('id')
    .single();

  if (error) {
    throw new Error(`Eroare la salvarea clientului: ${error.message}`);
  }

  return data.id as string;
}

async function saveDocument(fileName: string, xmlText: string) {
  const { data, error } = await supabase
    .from('documents')
    .insert({
      company_id: DEMO_COMPANY_ID,
      file_name: fileName,
      file_type: 'xml',
      document_type: 'e-factura',
      status: 'procesat',
      original_content: xmlText,
      processed_at: new Date().toISOString(),
    })
    .select('id')
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
) {
  const { data, error } = await supabase
    .from('invoices')
    .insert({
      company_id: DEMO_COMPANY_ID,
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
      status: 'procesata',
    })
    .select('id')
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

  const { error } = await supabase.from('invoice_lines').insert(rows);

  if (error) {
    throw new Error(`Eroare la salvarea liniilor facturii: ${error.message}`);
  }
}

async function saveExtractedEntities(invoice: ParsedInvoice, documentId: string, invoiceId: string) {
  const entities = [
    ['invoice_number', invoice.invoiceNumber],
    ['issue_date', invoice.issueDate ?? ''],
    ['due_date', invoice.dueDate ?? ''],
    ['currency', invoice.currency],
    ['supplier_name', invoice.supplier.name],
    ['supplier_cui', invoice.supplier.cui],
    ['customer_name', invoice.customer.name],
    ['customer_cui', invoice.customer.cui],
    ['tax_exclusive_amount', String(invoice.taxExclusiveAmount)],
    ['tax_amount', String(invoice.taxAmount)],
    ['tax_inclusive_amount', String(invoice.taxInclusiveAmount)],
    ['payable_amount', String(invoice.payableAmount)],
  ]
    .filter(([, value]) => value !== '')
    .map(([entity_type, entity_value]) => ({
      document_id: documentId,
      invoice_id: invoiceId,
      entity_type,
      entity_value,
      confidence: 1,
      extraction_method: 'xml_parser',
    }));

  if (entities.length === 0) {
    return;
  }

  const { error } = await supabase.from('extracted_entities').insert(entities);

  if (error) {
    throw new Error(`Eroare la salvarea entitatilor extrase: ${error.message}`);
  }
}

async function saveEntityRelations(invoice: ParsedInvoice, documentId: string) {
  const relations = [
    {
      document_id: documentId,
      source_entity: `Factura ${invoice.invoiceNumber}`,
      relation_type: 'are_furnizor',
      target_entity: invoice.supplier.name || invoice.supplier.cui || 'Furnizor necunoscut',
    },
    {
      document_id: documentId,
      source_entity: `Factura ${invoice.invoiceNumber}`,
      relation_type: 'are_client',
      target_entity: invoice.customer.name || invoice.customer.cui || 'Client necunoscut',
    },
    {
      document_id: documentId,
      source_entity: `Factura ${invoice.invoiceNumber}`,
      relation_type: 'are_total_de_plata',
      target_entity: String(invoice.payableAmount),
    },
    {
      document_id: documentId,
      source_entity: `Factura ${invoice.invoiceNumber}`,
      relation_type: 'are_tva',
      target_entity: String(invoice.taxAmount),
    },
  ];

  const { error } = await supabase.from('entity_relations').insert(relations);

  if (error) {
    throw new Error(`Eroare la salvarea relatiilor: ${error.message}`);
  }
}

export async function importEFacturaXml(file: File): Promise<SavedInvoiceResult> {
  const xmlText = await file.text();
  const parsedInvoice = parseEFacturaXml(xmlText);

  const documentId = await saveDocument(file.name, xmlText);
  const supplierId = await upsertSupplier(parsedInvoice);
  const customerId = await upsertCustomer(parsedInvoice);
  const invoiceId = await saveInvoice(parsedInvoice, documentId, supplierId, customerId);

  await saveInvoiceLines(parsedInvoice, invoiceId);
  await saveExtractedEntities(parsedInvoice, documentId, invoiceId);
  await saveEntityRelations(parsedInvoice, documentId);

  return {
    invoiceId,
    documentId,
  };
}

export async function getInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select(`
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
    `)
    .eq('company_id', DEMO_COMPANY_ID)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Eroare la citirea facturilor: ${error.message}`);
  }

  return data ?? [];
}

export async function getInvoiceDetails(invoiceId: string) {
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select(`
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
      documents (
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
    `)
    .eq('id', invoiceId)
    .single();

  if (invoiceError) {
    throw new Error(`Eroare la citirea facturii: ${invoiceError.message}`);
  }

  const { data: lines, error: linesError } = await supabase
    .from('invoice_lines')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('line_number', { ascending: true });

  if (linesError) {
    throw new Error(`Eroare la citirea liniilor facturii: ${linesError.message}`);
  }

  const { data: entities, error: entitiesError } = await supabase
    .from('extracted_entities')
    .select('*')
    .eq('invoice_id', invoiceId);

  if (entitiesError) {
    throw new Error(`Eroare la citirea entitatilor extrase: ${entitiesError.message}`);
  }

  return {
    invoice,
    lines: lines ?? [],
    entities: entities ?? [],
  };
}