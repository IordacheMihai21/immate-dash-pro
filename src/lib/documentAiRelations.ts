import type { DocumentAiFieldKey } from "./documentAiService.ts";
import { isUiSafeEntityValue, isUiSafePartyValue } from "./documentAiUiSafety.ts";
import type { InvoiceClassification } from "./cuiUtils.ts";

export type UiSafeDocumentRelation = {
  source: string;
  relation: string;
  target: string;
  confidence: number;
};

export function buildUiSafeDocumentRelations({
  fields,
  confidences,
  overallConfidence,
  classification,
}: {
  fields: Partial<Record<DocumentAiFieldKey, string>> | null;
  confidences: Record<DocumentAiFieldKey, number>;
  overallConfidence: number;
  classification: InvoiceClassification;
}) {
  const invoiceNumber = fields?.invoiceNumber?.trim() ?? "";
  const invoiceLabel = isUiSafeEntityValue("invoiceNumber", invoiceNumber)
    ? `Factura ${invoiceNumber}`
    : "";
  const supplierName = fields?.supplierName?.trim() ?? "";
  const customerName = fields?.customerName?.trim() ?? "";
  const supplierLabel = isUiSafePartyValue(supplierName)
    ? supplierName
    : (fields?.supplierCui?.trim() ?? "");
  const customerLabel = isUiSafePartyValue(customerName)
    ? customerName
    : (fields?.customerCui?.trim() ?? "");
  const supplierConfidence = Math.max(confidences.supplierName, confidences.supplierCui);
  const customerConfidence = Math.max(confidences.customerName, confidences.customerCui);
  const invoiceConfidence = confidences.invoiceNumber;
  const totalConfidence = Math.max(confidences.totalAmount, confidences.vatAmount);
  const partyConfidence = Math.max(confidences.supplierCui, confidences.customerCui);
  const relationships: UiSafeDocumentRelation[] = [];

  if (
    supplierLabel &&
    invoiceLabel &&
    supplierConfidence >= 0.6 &&
    invoiceConfidence >= 0.6 &&
    (isUiSafePartyValue(supplierLabel) || Boolean(fields?.supplierCui?.trim()))
  ) {
    relationships.push({
      source: supplierLabel,
      relation: "emite",
      target: invoiceLabel,
      confidence: supplierConfidence,
    });
  }
  if (
    customerLabel &&
    invoiceLabel &&
    customerConfidence >= 0.6 &&
    invoiceConfidence >= 0.6 &&
    (isUiSafePartyValue(customerLabel) || Boolean(fields?.customerCui?.trim()))
  ) {
    relationships.push({
      source: customerLabel,
      relation: "primește",
      target: invoiceLabel,
      confidence: customerConfidence,
    });
  }
  if (invoiceLabel && invoiceConfidence >= 0.6 && overallConfidence >= 60) {
    relationships.push({
      source: invoiceLabel,
      relation: "conține",
      target: "Linii factură",
      confidence: Math.min(invoiceConfidence, overallConfidence / 100),
    });
  }
  if (
    invoiceLabel &&
    invoiceConfidence >= 0.6 &&
    fields?.vatAmount?.trim() &&
    totalConfidence >= 0.6
  ) {
    relationships.push({
      source: invoiceLabel,
      relation: "include",
      target: "TVA",
      confidence: totalConfidence,
    });
  }
  if (classification !== "unclassified" && partyConfidence >= 0.6) {
    const companyTarget: Record<Exclude<InvoiceClassification, "unclassified">, string> = {
      revenue: "Venit",
      expense: "Cheltuială",
    };
    const companyRelation: Record<Exclude<InvoiceClassification, "unclassified">, string> = {
      revenue: "este furnizor",
      expense: "este client",
    };
    relationships.push({
      source: "Companie curentă",
      relation: companyRelation[classification],
      target: companyTarget[classification],
      confidence: Math.max(0.65, partyConfidence),
    });
  }

  return relationships.filter(
    (relationship) =>
      relationship.confidence >= 0.6 &&
      relationship.source &&
      relationship.target &&
      !/\b(?:invoice\s+id|invoice\s+number|po\s+number|bill[\s_-]*to|ship\s+to)\b/i.test(
        relationship.source,
      ),
  );
}
