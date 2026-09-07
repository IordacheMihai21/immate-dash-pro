import { describe, expect, it } from "vitest";

import {
  extractInvoiceCandidates,
  looksLikeNonInvoiceIdentifier,
  normalizeTaxIdentifier,
} from "./invoiceCandidateEngine";

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

describe("extractInvoiceCandidates - invoice number extraction", () => {
  it("extracts Serie+Nr with the code between Serie and Nr", () => {
    const lines = [{ text: "SerieMH Nr 2639744" }];
    const result = extractInvoiceCandidates({ text: lines[0].text, lines });
    expect(result.fields.invoiceNumber.value).toBe("MH2639744");
  });

  it("extracts Serie+Nr with the code after Nr (e.g. company-specific series like DUM.TM)", () => {
    const lines = [{ text: "; Serie /Nr. DUM.TM 3655" }];
    const result = extractInvoiceCandidates({ text: lines[0].text, lines });
    expect(result.fields.invoiceNumber.value).toBe("DUM.TM3655");
  });

  it("extracts Serie+Nr when OCR splits the label across two adjacent lines", () => {
    // Real OCR output (roboflow_ro_valid_53): "Serie MH" and "Nr.2639747"
    // land on separate lines/table cells.
    const lines = [{ text: "Furnizor:RMB CASA AUTO TIMISOARA Serie MH" }, { text: "Nr.2639747" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });
    expect(result.fields.invoiceNumber.value).toBe("MH2639747");
  });

  it("captures a series code containing digits and a dash", () => {
    // Real OCR output (roboflow_ro_valid_9): the series code itself is
    // "TM1-MLS", not a bare letters-only code.
    const lines = [{ text: "Seria TM1-MLS nr. 21913" }];
    const result = extractInvoiceCandidates({ text: lines[0].text, lines });
    expect(result.fields.invoiceNumber.value).toBe("TM1-MLS21913");
  });

  it("rejects a Romanian legal citation that coincidentally matches the NNN/YYYY shape", () => {
    // Real OCR output (roboflow_ro_valid_9): "conform art. 319 alin. 29
    // din legea 227/2015" is a Fiscal Code citation, not an invoice number.
    const lines = [
      { text: "Emisa in conformitate cu prevederile art. 319 alin. 29 din legea 227/2015" },
    ];
    const result = extractInvoiceCandidates({ text: lines[0].text, lines });
    expect(result.fields.invoiceNumber.value).not.toBe("2272015");
  });

  it("joins an invoice number split by a stray OCR space mid-number", () => {
    // Real OCR output (roboflow_ro_valid_0): "MBSL.202 1232280" is really
    // one continuous number, "MBSL.2021232280".
    const lines = [{ text: "Nr. factura: MBSL.202 1232280" }];
    const result = extractInvoiceCandidates({ text: lines[0].text, lines });
    expect(result.fields.invoiceNumber.value).toBe("MBSL.2021232280");
  });

  it("matches the 'facturii' (double-i) inflection, not just 'factura'", () => {
    const lines = [{ text: "Numéar factura: 18644077" }];
    const result = extractInvoiceCandidates({ text: lines[0].text, lines });
    expect(result.fields.invoiceNumber.value).toBe("18644077");

    const facturiiLines = [{ text: "Nr. facturii: 5031235" }];
    const facturiiResult = extractInvoiceCandidates({
      text: facturiiLines[0].text,
      lines: facturiiLines,
    });
    expect(facturiiResult.fields.invoiceNumber.value).toBe("5031235");
  });
});

describe("looksLikeNonInvoiceIdentifier", () => {
  it("rejects date-shaped values", () => {
    expect(looksLikeNonInvoiceIdentifier("26.11.2021")).toBe(true);
  });

  it("rejects CUI-shaped values", () => {
    expect(looksLikeNonInvoiceIdentifier("RO6724860")).toBe(true);
  });

  it("rejects IBAN-shaped values", () => {
    expect(looksLikeNonInvoiceIdentifier("RO49AAAA1234567890123456")).toBe(true);
  });

  it("rejects Romanian phone-number-shaped values", () => {
    expect(looksLikeNonInvoiceIdentifier("0212007787")).toBe(true);
  });

  it("accepts a genuine series+number invoice identifier", () => {
    expect(looksLikeNonInvoiceIdentifier("MH2639744")).toBe(false);
    expect(looksLikeNonInvoiceIdentifier("TSR-CL/14134")).toBe(false);
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
