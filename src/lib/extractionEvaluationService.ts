export type ExtractionQualityLabel = "Ridicata" | "Medie" | "Scazuta";

export type DocumentExtractionEvaluation = {
  totalFields: number;
  extractedFields: number;
  missingFields: string[];
  fieldCompletenessRate: number;
  extractionQualityLabel: ExtractionQualityLabel;
  fieldDetails: {
    field: string;
    present: boolean;
    valuePreview?: string;
  }[];
};

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

export type InvoiceExtractionSource = {
  invoice_number?: string | null;
  issue_date?: string | null;
  currency?: string | null;
  tax_amount?: number | string | null;
  payable_amount?: number | string | null;
  suppliers?: RelationParty;
  customers?: RelationParty;
} | null | undefined;

const FIELDS = [
  "Numar factura",
  "Data emitere",
  "Furnizor",
  "CUI furnizor",
  "Client",
  "CUI client",
  "TVA",
  "Total de plata",
  "Moneda",
] as const;

function getParty(party: RelationParty) {
  if (!party) {
    return null;
  }

  if (Array.isArray(party)) {
    return party[0] ?? null;
  }

  return party;
}

function hasValue(value: unknown) {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  return Boolean(value);
}

function preview(value: unknown) {
  if (!hasValue(value)) {
    return undefined;
  }

  const text = String(value);

  return text.length > 32 ? `${text.slice(0, 29)}...` : text;
}

function getQualityLabel(rate: number): ExtractionQualityLabel {
  if (rate >= 90) {
    return "Ridicata";
  }

  if (rate >= 70) {
    return "Medie";
  }

  return "Scazuta";
}

export function evaluateDocumentExtraction(
  invoice: InvoiceExtractionSource,
): DocumentExtractionEvaluation {
  const supplier = getParty(invoice?.suppliers);
  const customer = getParty(invoice?.customers);
  const values: Record<(typeof FIELDS)[number], unknown> = {
    "Numar factura": invoice?.invoice_number,
    "Data emitere": invoice?.issue_date,
    Furnizor: supplier?.name,
    "CUI furnizor": supplier?.cui,
    Client: customer?.name,
    "CUI client": customer?.cui,
    TVA: invoice?.tax_amount,
    "Total de plata": invoice?.payable_amount,
    Moneda: invoice?.currency,
  };

  const fieldDetails = FIELDS.map((field) => {
    const value = values[field];
    const present = hasValue(value);

    return {
      field,
      present,
      valuePreview: present ? preview(value) : undefined,
    };
  });
  const extractedFields = fieldDetails.filter((field) => field.present).length;
  const fieldCompletenessRate = Number(
    ((extractedFields / fieldDetails.length) * 100).toFixed(1),
  );

  return {
    totalFields: fieldDetails.length,
    extractedFields,
    missingFields: fieldDetails
      .filter((field) => !field.present)
      .map((field) => field.field),
    fieldCompletenessRate,
    extractionQualityLabel: getQualityLabel(fieldCompletenessRate),
    fieldDetails,
  };
}
