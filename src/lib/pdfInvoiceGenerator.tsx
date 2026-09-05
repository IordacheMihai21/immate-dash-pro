import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type PdfInvoiceParty = {
  name: string;
  cui: string;
  address: string;
  city: string;
  country: string;
};

export type PdfInvoiceLine = {
  lineNumber: string;
  description: string;
  quantity: number;
  unitCode: string;
  unitPrice: number;
  lineTotal: number;
};

export type PdfInvoiceData = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  taxExclusiveAmount: number;
  taxAmount: number;
  taxInclusiveAmount: number;
  payableAmount: number;
  supplier: PdfInvoiceParty;
  customer: PdfInvoiceParty;
  lines: PdfInvoiceLine[];
};

function formatAmount(value: number, currency: string) {
  return `${value.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatPdfDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#1a1a1a",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a8a",
  },
  invoiceMeta: {
    marginTop: 6,
    fontSize: 9,
    color: "#4b5563",
  },
  invoiceMetaRow: {
    flexDirection: "row",
    marginTop: 2,
  },
  invoiceMetaLabel: {
    color: "#6b7280",
    width: 90,
  },
  invoiceMetaValue: {
    fontFamily: "Helvetica-Bold",
  },
  partiesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
    gap: 20,
  },
  partyBlock: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 10,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
  },
  partyLabel: {
    fontSize: 8,
    color: "#6b7280",
    textTransform: "uppercase",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  partyName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    marginBottom: 3,
  },
  partyLine: {
    fontSize: 9,
    color: "#374151",
    marginBottom: 1,
  },
  table: {
    marginTop: 4,
  },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#1e3a8a",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 3,
  },
  tableHeaderCell: {
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  tableCell: {
    fontSize: 9,
  },
  colNr: { width: "6%", paddingRight: 6 },
  colDesc: { width: "36%", paddingRight: 6 },
  colQty: { width: "12%", textAlign: "right", paddingRight: 6 },
  colUm: { width: "10%", paddingRight: 6 },
  colPrice: { width: "18%", textAlign: "right", paddingRight: 6 },
  colTotal: { width: "18%", textAlign: "right" },
  totalsBlock: {
    marginTop: 16,
    alignSelf: "flex-end",
    width: 220,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalsLabel: {
    color: "#6b7280",
  },
  totalsValue: {
    fontFamily: "Helvetica-Bold",
  },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1e3a8a",
  },
  grandTotalLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a8a",
  },
  grandTotalValue: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a8a",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#9ca3af",
    textAlign: "center",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 8,
  },
});

function PartyBlock({ label, party }: { label: string; party: PdfInvoiceParty }) {
  return (
    <View style={styles.partyBlock}>
      <Text style={styles.partyLabel}>{label}</Text>
      <Text style={styles.partyName}>{party.name || "-"}</Text>
      {party.cui ? <Text style={styles.partyLine}>CUI: {party.cui}</Text> : null}
      {party.address ? <Text style={styles.partyLine}>{party.address}</Text> : null}
      {party.city || party.country ? (
        <Text style={styles.partyLine}>
          {[party.city, party.country].filter(Boolean).join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

export function InvoicePdfDocument({ invoice }: { invoice: PdfInvoiceData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>FACTURA</Text>
            <View style={styles.invoiceMeta}>
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Numar</Text>
                <Text style={styles.invoiceMetaValue}>{invoice.invoiceNumber}</Text>
              </View>
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Data emiterii</Text>
                <Text style={styles.invoiceMetaValue}>{formatPdfDate(invoice.issueDate)}</Text>
              </View>
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Data scadentei</Text>
                <Text style={styles.invoiceMetaValue}>{formatPdfDate(invoice.dueDate)}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.partiesRow}>
          <PartyBlock label="Furnizor" party={invoice.supplier} />
          <PartyBlock label="Client" party={invoice.customer} />
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, styles.colNr]}>Nr.</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Descriere</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>Cant.</Text>
            <Text style={[styles.tableHeaderCell, styles.colUm]}>UM</Text>
            <Text style={[styles.tableHeaderCell, styles.colPrice]}>Pret unitar</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>Total</Text>
          </View>

          {invoice.lines.length === 0 ? (
            <View style={styles.tableRow}>
              <Text style={styles.tableCell}>Nu exista linii salvate pentru aceasta factura.</Text>
            </View>
          ) : (
            invoice.lines.map((line, index) => (
              <View style={styles.tableRow} key={`${line.lineNumber}-${index}`}>
                <Text style={[styles.tableCell, styles.colNr]}>{line.lineNumber}</Text>
                <Text style={[styles.tableCell, styles.colDesc]}>{line.description || "-"}</Text>
                <Text style={[styles.tableCell, styles.colQty]}>{line.quantity}</Text>
                <Text style={[styles.tableCell, styles.colUm]}>{line.unitCode}</Text>
                <Text style={[styles.tableCell, styles.colPrice]}>
                  {formatAmount(line.unitPrice, invoice.currency)}
                </Text>
                <Text style={[styles.tableCell, styles.colTotal]}>
                  {formatAmount(line.lineTotal, invoice.currency)}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Valoare fara TVA</Text>
            <Text style={styles.totalsValue}>
              {formatAmount(invoice.taxExclusiveAmount, invoice.currency)}
            </Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>TVA</Text>
            <Text style={styles.totalsValue}>
              {formatAmount(invoice.taxAmount, invoice.currency)}
            </Text>
          </View>
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Total de plata</Text>
            <Text style={styles.grandTotalValue}>
              {formatAmount(invoice.payableAmount, invoice.currency)}
            </Text>
          </View>
        </View>

        <Text style={styles.footer}>
          Document generat de IMMapp pe baza datelor inregistrate pentru factura{" "}
          {invoice.invoiceNumber}.
        </Text>
      </Page>
    </Document>
  );
}
