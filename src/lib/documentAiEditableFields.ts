import type { DocumentAiExtractedFields, DocumentAiFieldKey } from "@/lib/documentAiService";

export type DocumentAiEditableFields = Record<DocumentAiFieldKey, string>;

export const DOCUMENT_AI_FIELD_KEYS: DocumentAiFieldKey[] = [
  "invoiceNumber",
  "invoiceDate",
  "supplierName",
  "supplierCui",
  "customerName",
  "customerCui",
  "subtotal",
  "vatAmount",
  "totalAmount",
  "currency",
];

export function createEmptyDocumentAiFields(): DocumentAiEditableFields {
  return DOCUMENT_AI_FIELD_KEYS.reduce(
    (acc, field) => ({
      ...acc,
      [field]: "",
    }),
    {} as DocumentAiEditableFields,
  );
}

export function toDocumentAiEditableFields(
  fields: DocumentAiExtractedFields,
): DocumentAiEditableFields {
  return DOCUMENT_AI_FIELD_KEYS.reduce((acc, key) => {
    const value = fields[key];

    acc[key] =
      typeof value === "number"
        ? value.toFixed(2).replace(".", ",")
        : typeof value === "string"
          ? value
          : "";

    return acc;
  }, {} as DocumentAiEditableFields);
}
