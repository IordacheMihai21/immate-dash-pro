import { describe, expect, it } from "vitest";

import {
  cleanPartyName,
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

describe("cleanPartyName", () => {
  it("strips a bilingual role label with no company name on the line", () => {
    // Real bug (bilingual RO/EN invoice): "Seller / Vânzător" is a header
    // label, not a company name -- the old version only stripped the first
    // label word ("Seller"), leaving "/ Vânzător" looking like a plausible
    // (if odd) name, which then won as the extracted supplierName outright.
    expect(cleanPartyName("Seller / Vânzător")).toBe("");
    expect(cleanPartyName("Buyer / Cumpărător")).toBe("");
    expect(cleanPartyName("Buyer | Cumpărător")).toBe("");
  });

  it("still extracts the real name past a single label", () => {
    expect(cleanPartyName("Furnizor: Cubus Arts S.R.L.")).toBe("Cubus Arts S.R.L.");
  });

  it("extracts the real name past a bilingual label on the same line", () => {
    expect(cleanPartyName("Seller / Vânzător: Cubus Arts S.R.L.")).toBe("Cubus Arts S.R.L.");
  });
});

describe("extractInvoiceCandidates - party name extraction", () => {
  // Regression: a real bilingual RO/EN invoice where IMMapp extracted
  // "/ Vânzător" and "/ Cumpărător" as the supplier/customer company names
  // instead of the real names one line below each label.
  it("does not extract a bilingual role label as the company name", () => {
    const lines = [
      { text: "INVOICE / FACTURA" },
      { text: "Nr. SRV-1610" },
      { text: "Data: 08.09.2026" },
      { text: "Seller / Vânzător" },
      { text: "Cubus Arts S.R.L." },
      { text: "CUI: RO13548146" },
      { text: "Buyer / Cumpărător" },
      { text: "S.C. DEMO IMPEX S.R.L." },
      { text: "CUI: RO14468355" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.supplierName.value).toBe("Cubus Arts S.R.L.");
    expect(result.fields.customerName.value).toBe("S.C. DEMO IMPEX S.R.L.");
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

  it("does not treat a large space-grouped bare number as a total amount", () => {
    const lines = [
      { text: "Al el F Total General 600 114" },
      { text: "TOTAL DE PLATA" },
      { text: "714" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(714);
  });
});

describe("extractInvoiceCandidates - totalAmount selection among multiple candidates", () => {
  it("picks the strong-labeled total over a plain 'total' table header nearby", () => {
    const lines = [
      { text: "Nr. crt. Denumire Cantitate Pret unitar Valoare Total" },
      { text: "1 Serviciu consultanta 2 100.00 200.00" },
      { text: "Total de plata: 1780.02 RON" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });
    expect(result.fields.totalAmount.value).toBe(1780.02);
  });

  it("finds the amount when it sits 1-2 lines below the label (OCR table-row split)", () => {
    const lines = [
      { text: "Total de plati (col. 5 +col. 6):" },
      { text: "" },
      { text: "RON 1780.02" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });
    expect(result.fields.totalAmount.value).toBe(1780.02);
  });

  it("reconstructs the gross total when OCR splits net and VAT into adjacent compact rows", () => {
    const lines = [
      { text: "Valoarea" },
      { text: "Valoarea T.V.A." },
      { text: "Total" },
      { text: "1600,51" },
      { text: "304,10" },
      { text: "Total de plata" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(1904.61);
  });

  it("prefers a reconstructed gross total over same-line subtotal and VAT components", () => {
    const lines = [{ text: "Total de plata (col.5+col.6)" }, { text: "-20.225,20 -3.842,79" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(24067.99);
  });

  it("does not add VAT to an amount that is already printed on a TOTAL DE PLATA line", () => {
    const lines = [{ text: "Total TVA 13,588.47" }, { text: "TOTAL DE PLATA 86,690.78" }];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(86690.78);
  });

  it("does not add VAT to a single value immediately below an explicit total label", () => {
    const lines = [
      { text: "Valoare fara TVA" },
      { text: "33277.97" },
      { text: "Valoare TVA" },
      { text: "6322.81" },
      { text: "Total de plata (col. 5 + col. 6):" },
      { text: "RON 39600.78" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(39600.78);
  });

  it("prefers the current invoice total over a balance snapshot table", () => {
    const lines = [
      { text: "Factura curenta" },
      { text: "Facturi neachitate" },
      { text: "Total de plata la data de 24.06.2021" },
      { text: "38,82" },
      { text: "435,47" },
      { text: "474,29" },
      { text: "Total factura curenta cu TVA [Lei]" },
      { text: "38,82" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(38.82);
  });

  it("prefers the current invoice total over overdue balance values nearby", () => {
    const lines = [
      { text: "Total de plata factura curenta: 1.035,36 Lei" },
      { text: "Facturi restante" },
      { text: "677,43" },
      { text: "Sold client la data emiterii facturii 05.07.2018" },
      { text: "1.712,79 Lei" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(1035.36);
  });

  it("ignores large bare barcode fragments when a labeled monetary total exists", () => {
    const lines = [
      { text: "Total de plata factura curenta: 1.035,36 Lei" },
      { text: "009956664150000001035360507 1852137816641" },
      { text: "995666415" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(1035.36);
  });

  it("infers a missing payable total from a plain net total and a single VAT rate", () => {
    const lines = [
      { text: "Cota TVA: 19%" },
      { text: "Total 1350.00" },
      { text: "" },
      { text: "Total plata" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(1606.5);
  });

  it("does not infer VAT when the payable total already has its own amount", () => {
    const lines = [
      { text: "Cota TVA: 19%" },
      { text: "Total 2813.45 534.55" },
      { text: "Total plata 3348.00" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });

    expect(result.fields.totalAmount.value).toBe(3348);
  });

  it("resolves a subtotal/VAT/total trio to the correct total via cross-field consistency", () => {
    const lines = [
      { text: "Subtotal: 1000.00" },
      { text: "TVA (19%): 190.00" },
      { text: "Total: 1190.00" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });
    expect(result.fields.subtotal.value).toBe(1000);
    expect(result.fields.vatAmount.value).toBe(190);
    expect(result.fields.totalAmount.value).toBe(1190);
  });

  it("ignores a Romanian legal citation and table/reference noise near total-shaped numbers", () => {
    const lines = [
      { text: "Emisa conform art. 319 alin. 29 din legea 227/2015" },
      { text: "Nr. contract: 445/2021" },
      { text: "Total de plata: 795.98 RON" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });
    expect(result.fields.totalAmount.value).toBe(795.98);
  });

  it("parses European comma-decimal and dot-thousands formats", () => {
    const lines = [{ text: "Total de plata: 85.167,90 RON" }];
    const result = extractInvoiceCandidates({
      text: lines[0].text,
      lines,
    });
    expect(result.fields.totalAmount.value).toBe(85167.9);
  });

  it("parses English dot-decimal and comma-thousands formats", () => {
    const lines = [{ text: "Grand total: 85,167.90" }];
    const result = extractInvoiceCandidates({
      text: lines[0].text,
      lines,
    });
    expect(result.fields.totalAmount.value).toBe(85167.9);
  });

  it("extracts a negative total on a credit-note-style adjustment", () => {
    // Real OCR output (roboflow_ro_valid_66): a genuine credit/adjustment
    // invoice prints its total with a leading minus sign.
    const lines = [{ text: "Total de plata -41,04" }];
    const result = extractInvoiceCandidates({
      text: lines[0].text,
      lines,
    });
    expect(result.fields.totalAmount.value).toBe(-41.04);
  });

  it("does not pick up a discount, unit price, or previous-balance line as the total", () => {
    const lines = [
      { text: "Discount: 50.00" },
      { text: "Pret unitar: 25.00" },
      { text: "Sold anterior: 300.00" },
      { text: "Total de plata: 1250.00" },
    ];
    const result = extractInvoiceCandidates({
      text: lines.map((l) => l.text).join("\n"),
      lines,
    });
    expect(result.fields.totalAmount.value).toBe(1250);
  });
});
