/** Client-side upload guards. These are UX/DoS-prevention limits (stop a
 * user from freezing their own tab on a huge selection), not the security
 * boundary -- the real boundary is the server/RLS layer, which enforces its
 * own limits independently of anything checked here. */

export const MAX_EFACTURA_XML_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB -- real e-Factura XML is a few KB to a few hundred KB
export const MAX_EFACTURA_XML_FILE_COUNT = 50;

export const MAX_DOCUMENT_AI_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB -- generous for a single scanned invoice

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.round(bytes / 1024)} KB`;
}

export type FileRejection = {
  fileName: string;
  reason: string;
};

export function validateEFacturaXmlSelection(files: File[]): {
  accepted: File[];
  rejected: FileRejection[];
  truncatedCount: number;
} {
  const withinSizeLimit: File[] = [];
  const rejected: FileRejection[] = [];

  for (const file of files) {
    if (file.size > MAX_EFACTURA_XML_SIZE_BYTES) {
      rejected.push({
        fileName: file.name,
        reason: `Fisierul (${formatFileSize(file.size)}) depaseste limita de ${formatFileSize(MAX_EFACTURA_XML_SIZE_BYTES)} pentru un XML e-Factura.`,
      });
      continue;
    }

    withinSizeLimit.push(file);
  }

  const truncatedCount = Math.max(0, withinSizeLimit.length - MAX_EFACTURA_XML_FILE_COUNT);
  const accepted = withinSizeLimit.slice(0, MAX_EFACTURA_XML_FILE_COUNT);

  return { accepted, rejected, truncatedCount };
}

export function validateDocumentAiFile(file: File): { ok: true } | { ok: false; reason: string } {
  if (file.size > MAX_DOCUMENT_AI_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: `Fisierul (${formatFileSize(file.size)}) depaseste limita de ${formatFileSize(MAX_DOCUMENT_AI_FILE_SIZE_BYTES)}. Incarca un scan sau export mai mic.`,
    };
  }

  return { ok: true };
}
