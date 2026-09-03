function escapeCsvValue(value: string | number | null | undefined): string {
  const stringValue = String(value ?? "");

  if (/[",\n;]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Builds a CSV file and triggers a browser download. Prefixed with a UTF-8
 * BOM so Excel on Windows reads Romanian diacritics (ă, â, î, ș, ț)
 * correctly instead of misinterpreting the file as Latin-1.
 */
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvValue).join(","));
  const csvContent = "﻿" + lines.join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function todayForFilename(): string {
  return new Date().toISOString().slice(0, 10);
}
