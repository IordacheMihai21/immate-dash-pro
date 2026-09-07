import { describe, expect, it } from "vitest";

import { extractInvoiceCandidates, normalizeTaxIdentifier } from "./invoiceCandidateEngine";

// These mirror document-ai-backend/main.py's normalize_tax_identifier test
// cases exactly -- the two implementations must stay in sync, see the
// comment on normalizeTaxIdentifier itself.
describe("normalizeTaxIdentifier", () => {
  it("passes through an already-clean RO CUI", () => {
    expect(normalizeTaxIdentifier("RO24041105")).toBe("RO24041105");
  });

  it("strips CIF/CUI/CLF label noise regardless of punctuation", () => {
    expect(normalizeTaxIdentifier("C.I.F.:RO11178217")).toBe("RO11178217");
    expect(normalizeTaxIdentifier("C.I.F.RO6724860")).toBe("RO6724860");
    expect(normalizeTaxIdentifier("C.LF..RO5888716")).toBe("RO5888716");
  });

  it("recovers RO from common OCR digit/letter confusions", () => {
    expect(normalizeTaxIdentifier("R0O6724860")).toBe("RO6724860");
    expect(normalizeTaxIdentifier("R022043010")).toBe("RO22043010");
  });

  it("accepts a bare fiscal code with no RO prefix", () => {
    expect(normalizeTaxIdentifier("12064199")).toBe("12064199");
  });

  it("rejects values that are too long to be a real CUI", () => {
    expect(normalizeTaxIdentifier("2850122350022")).toBe("");
  });

  it("rejects empty input", () => {
    expect(normalizeTaxIdentifier("")).toBe("");
  });
});

describe("extractInvoiceCandidates - tax identifier extraction", () => {
  it("finds a CUI even when OCR renders the label with a dot after every letter", () => {
    // Real OCR output (roboflow_ro_valid_26): the label-matching regex used
    // to require literal contiguous "CLF", which "C.LF." never contains --
    // the dot between C and L breaks it, so the line was silently skipped.
    const lines = [{ text: "C.LF.: RO 14600820" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.supplierCui.value).toBe("RO14600820");
  });

  it("does not truncate a tax ID split across a mid-value OCR space", () => {
    const lines = [{ text: "CUI: RO24041 105" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.supplierCui.value).toBe("RO24041105");
  });
});

describe("extractInvoiceCandidates - amount extraction", () => {
  it("does not treat a bare table-column index as a total", () => {
    // Real OCR output (roboflow_ro_valid_26): the old AMOUNT_PATTERN's bare
    // \d+ fallback matched the lone "6" in "(col. 5 +col. 6)" as a monetary
    // token, fabricating a totalAmount of "6.00" on a document whose real
    // total, "1780.02", was on a different line entirely.
    const lines = [{ text: "Total de plati (col. 5 +col. 6):" }, { text: "RON 1780.02" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).not.toBe("6.00");
    expect(result.fields.totalAmount.value).not.toBe("5.00");
  });

  it("still extracts a genuine small decimal amount", () => {
    const lines = [{ text: "Total: 9.50 RON" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(9.5);
  });

  it("still extracts a genuine bare-integer total with no decimal", () => {
    // 5 digits deliberately, not 4 -- extractMonetaryTokens has its own
    // separate, pre-existing filter that excludes bare 4-digit numbers to
    // avoid misreading a year (e.g. "2021") as an amount; unrelated to the
    // AMOUNT_PATTERN fix this test targets.
    const lines = [{ text: "Total: 13500" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(13500);
  });
});
