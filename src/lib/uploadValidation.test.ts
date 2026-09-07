import { describe, expect, it } from "vitest";

import {
  MAX_DOCUMENT_AI_FILE_SIZE_BYTES,
  MAX_EFACTURA_XML_FILE_COUNT,
  MAX_EFACTURA_XML_SIZE_BYTES,
  validateDocumentAiFile,
  validateEFacturaXmlSelection,
} from "./uploadValidation";

function makeFile(name: string, size: number, type = "text/xml") {
  return new File([new Uint8Array(size)], name, { type });
}

describe("validateEFacturaXmlSelection", () => {
  it("accepts XML files within the per-file and selection limits", () => {
    const files = [
      makeFile("factura-1.xml", 12 * 1024),
      makeFile("factura-2.xml", MAX_EFACTURA_XML_SIZE_BYTES),
    ];

    const result = validateEFacturaXmlSelection(files);

    expect(result.accepted).toEqual(files);
    expect(result.rejected).toEqual([]);
    expect(result.truncatedCount).toBe(0);
  });

  it("rejects XML files over 5 MB before processing", () => {
    const valid = makeFile("factura-valida.xml", 20 * 1024);
    const oversized = makeFile("factura-prea-mare.xml", MAX_EFACTURA_XML_SIZE_BYTES + 1);

    const result = validateEFacturaXmlSelection([valid, oversized]);

    expect(result.accepted).toEqual([valid]);
    expect(result.rejected).toEqual([
      expect.objectContaining({
        fileName: oversized.name,
        reason: expect.stringContaining("depaseste limita de 5.0 MB"),
      }),
    ]);
    expect(result.truncatedCount).toBe(0);
  });

  it("caps each import batch at 50 accepted XML files", () => {
    const files = Array.from({ length: MAX_EFACTURA_XML_FILE_COUNT + 3 }, (_, index) =>
      makeFile(`factura-${index + 1}.xml`, 1024),
    );

    const result = validateEFacturaXmlSelection(files);

    expect(result.accepted).toHaveLength(MAX_EFACTURA_XML_FILE_COUNT);
    expect(result.rejected).toEqual([]);
    expect(result.truncatedCount).toBe(3);
  });
});

describe("validateDocumentAiFile", () => {
  it("accepts a Document AI file at the configured limit", () => {
    const file = makeFile("factura.pdf", MAX_DOCUMENT_AI_FILE_SIZE_BYTES, "application/pdf");

    expect(validateDocumentAiFile(file)).toEqual({ ok: true });
  });

  it("rejects a Document AI file over 20 MB", () => {
    const file = makeFile(
      "scan-prea-mare.pdf",
      MAX_DOCUMENT_AI_FILE_SIZE_BYTES + 1,
      "application/pdf",
    );

    expect(validateDocumentAiFile(file)).toEqual({
      ok: false,
      reason: expect.stringContaining("depaseste limita de 20.0 MB"),
    });
  });
});
