import { describe, expect, it } from "vitest";

import { mergeLayoutXlmWithCandidateEngine } from "./layoutAiHybridMerge";

describe("mergeLayoutXlmWithCandidateEngine - tax identifier merge", () => {
  it("normalizes an OCR-noisy candidate instead of returning it raw", () => {
    // Before the chooseTaxId fix, isValidGeneralField's CUI check only
    // required 6-24 alnum chars with a digit -- "R027916027" (an OCR digit/
    // letter confusion of "RO27916027") passed that trivially and was
    // returned verbatim, even when the backend's already-clean value was
    // right there.
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { supplierCui: "R027916027" },
      candidateConfidences: { supplierCui: 0.78 },
      layoutFields: { supplierCui: "RO27916027" },
      layoutConfidences: { supplierCui: 0.9 },
      layoutMethods: { supplierCui: "fine-tuned layoutxlm" },
    });

    expect(result.fields.supplierCui).toBe("RO27916027");
  });

  it("falls back to the backend value when the candidate cannot be normalized", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { supplierCui: "C.I.LF.R0O6724860" },
      candidateConfidences: { supplierCui: 0.7 },
      layoutFields: { supplierCui: "RO6724860" },
      layoutConfidences: { supplierCui: 0.85 },
      layoutMethods: { supplierCui: "fine-tuned layoutxlm" },
    });

    expect(result.fields.supplierCui).toBe("RO6724860");
  });

  it("falls back to the candidate when the backend has nothing usable", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { supplierCui: "RO14600820" },
      candidateConfidences: { supplierCui: 0.78 },
      layoutFields: { supplierCui: "" },
    });

    expect(result.fields.supplierCui).toBe("RO14600820");
  });

  it("reports missing when neither side has a usable value", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { supplierCui: "not a cui at all" },
      layoutFields: { supplierCui: "" },
    });

    expect(result.fields.supplierCui).toBe("");
    expect(result.sources.supplierCui).toBe("missing");
  });
});

describe("mergeLayoutXlmWithCandidateEngine - invoice number merge", () => {
  it("trusts agreement between the candidate engine and LayoutXLM even when neither is individually confident", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { invoiceNumber: "MH2639744" },
      candidateConfidences: { invoiceNumber: 0.4 },
      layoutFields: { invoiceNumber: "MH2639744" },
      layoutConfidences: { invoiceNumber: 0.45 },
      layoutMethods: { invoiceNumber: "fine-tuned layoutxlm" },
    });

    expect(result.fields.invoiceNumber).toBe("MH2639744");
    expect(result.confidences.invoiceNumber).toBeGreaterThanOrEqual(0.8);
  });

  it("rejects a high-scoring candidate that is actually shaped like a CUI/date/phone/IBAN", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { invoiceNumber: "RO6724860" },
      candidateConfidences: { invoiceNumber: 0.9 },
      layoutFields: { invoiceNumber: "" },
    });

    expect(result.sources.invoiceNumber).toBe("missing");
  });

  it("prefers a well-formed candidate over a noisy layout proposal that retained label text", () => {
    // Real case: the model's own entity span sometimes includes adjacent
    // label text it wasn't cleanly separated from ("Nr.2639747" instead of
    // "2639747").
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { invoiceNumber: "MH2639747" },
      candidateConfidences: { invoiceNumber: 0.85 },
      layoutFields: { invoiceNumber: "Nr.2639747" },
      layoutConfidences: { invoiceNumber: 0.7 },
      layoutMethods: { invoiceNumber: "fine-tuned layoutxlm" },
    });

    expect(result.fields.invoiceNumber).toBe("MH2639747");
  });
});

describe("mergeLayoutXlmWithCandidateEngine - totalAmount merge", () => {
  it("boosts confidence when the candidate engine and LayoutXLM agree on the total", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { totalAmount: "1780.02" },
      candidateConfidences: { totalAmount: 0.5 },
      layoutFields: { totalAmount: "1780.02" },
      layoutConfidences: { totalAmount: 0.5 },
      layoutMethods: { totalAmount: "fine-tuned layoutxlm" },
    });

    expect(result.fields.totalAmount).toBe("1780.02");
    expect(result.confidences.totalAmount).toBeGreaterThanOrEqual(0.82);
  });

  it("prefers the confident candidate engine value when the model disagrees and looks suspicious", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { totalAmount: "1780.02" },
      candidateConfidences: { totalAmount: 0.75 },
      // A layout proposal missing decimal cents is treated as suspicious.
      layoutFields: { totalAmount: "6" },
      layoutConfidences: { totalAmount: 0.6 },
      layoutMethods: { totalAmount: "fine-tuned layoutxlm" },
    });

    expect(result.fields.totalAmount).toBe("1780.02");
    expect(result.sources.totalAmount).toBe("candidate_engine");
  });

  it("falls back to a highly confident model proposal when the candidate engine has nothing", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { totalAmount: "" },
      layoutFields: { totalAmount: "1780.02" },
      layoutConfidences: { totalAmount: 0.8 },
      layoutMethods: { totalAmount: "fine-tuned layoutxlm" },
    });

    expect(result.fields.totalAmount).toBe("1780.02");
    expect(result.sources.totalAmount).toBe("layoutxlm");
  });

  it("preserves a negative total instead of silently dropping the sign", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { totalAmount: "-41.04" },
      candidateConfidences: { totalAmount: 0.75 },
      layoutFields: { totalAmount: "" },
    });

    expect(result.fields.totalAmount).toBe("-41.04");
  });
});

describe("mergeLayoutXlmWithCandidateEngine - supplier/customer name reconciliation", () => {
  it("swaps supplier/customer names when both extractors agree the roles were reversed", () => {
    // Same joint role-assignment technique as the CUI pair: the candidate
    // engine tagged "Client SRL" as the supplier and "ACME Distributie SA" as the
    // customer, but LayoutXLM independently agrees "ACME Distributie SA" is really
    // the supplier -- two sources agreeing on the correct pairing outweighs
    // one side's initial (swapped) guess.
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { supplierName: "Client SRL", customerName: "ACME Distributie SA" },
      candidateConfidences: { supplierName: 0.6, customerName: 0.6 },
      layoutFields: { supplierName: "ACME Distributie SA", customerName: "Client SRL" },
      layoutConfidences: { supplierName: 0.75, customerName: 0.75 },
      layoutMethods: { supplierName: "fine-tuned layoutxlm", customerName: "fine-tuned layoutxlm" },
    });

    expect(result.fields.supplierName).toBe("ACME Distributie SA");
    expect(result.fields.customerName).toBe("Client SRL");
  });

  it("does not touch names when there is no repeated exact-key agreement to resolve", () => {
    // Free-text names legitimately differ in formatting between two
    // extractors far more often than CUI digits do -- this must stay
    // conservative and leave the original selection alone rather than
    // guessing from a single, unconfirmed observation.
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { supplierName: "RMB Casa Auto Timisoara SRL", customerName: "MLS SRL" },
      candidateConfidences: { supplierName: 0.8, customerName: 0.8 },
      layoutFields: { supplierName: "", customerName: "" },
    });

    expect(result.fields.supplierName).toBe("RMB Casa Auto Timisoara SRL");
    expect(result.fields.customerName).toBe("MLS SRL");
  });

  it("leaves already-correct names unchanged when both sources already agree on the roles", () => {
    const result = mergeLayoutXlmWithCandidateEngine({
      candidateFields: { supplierName: "ACME Distributie SA", customerName: "Client SRL" },
      candidateConfidences: { supplierName: 0.8, customerName: 0.8 },
      layoutFields: { supplierName: "ACME Distributie SA", customerName: "Client SRL" },
      layoutConfidences: { supplierName: 0.8, customerName: 0.8 },
      layoutMethods: { supplierName: "fine-tuned layoutxlm", customerName: "fine-tuned layoutxlm" },
    });

    expect(result.fields.supplierName).toBe("ACME Distributie SA");
    expect(result.fields.customerName).toBe("Client SRL");
  });
});
