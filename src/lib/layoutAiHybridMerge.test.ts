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
