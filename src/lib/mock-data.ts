// Date locale pentru ecranele care nu sunt inca alimentate din servicii.

export const activeCompany = {
  name: "SC Imatech Solutions SRL",
  cui: "RO12345678",
  regCom: "J40/1234/2020",
  address: "Str. Polona nr. 45, Bucuresti",
  email: "contact@imatech.ro",
  phone: "+40 721 000 000",
};

export const currentUser = {
  firstName: "Andrei",
  lastName: "Popescu",
  email: "andrei.popescu@imatech.ro",
  role: "Administrator",
};

export type DocStatus = "Procesat" | "În procesare" | "Eroare";

export interface DocumentItem {
  id: string;
  name: string;
  type: "XML" | "PDF" | "XLSX" | "CSV";
  uploadedAt: string;
  status: DocStatus;
  user: string;
  total: number;
}

export const documents: DocumentItem[] = [
  { id: "DOC-001", name: "factura_alfa_0125.xml", type: "XML", uploadedAt: "2025-05-12", status: "Procesat", user: "Andrei Popescu", total: 1250 },
  { id: "DOC-002", name: "factura_beta_0212.pdf", type: "PDF", uploadedAt: "2025-05-14", status: "Procesat", user: "Maria Ionescu", total: 3990 },
  { id: "DOC-003", name: "extras_bcr_aprilie.csv", type: "CSV", uploadedAt: "2025-05-15", status: "În procesare", user: "Andrei Popescu", total: 18500 },
  { id: "DOC-004", name: "factura_gamma_xml.xml", type: "XML", uploadedAt: "2025-05-18", status: "Procesat", user: "Andrei Popescu", total: 8500 },
  { id: "DOC-005", name: "raport_vanzari.xlsx", type: "XLSX", uploadedAt: "2025-05-20", status: "Eroare", user: "Maria Ionescu", total: 0 },
  { id: "DOC-006", name: "factura_delta.pdf", type: "PDF", uploadedAt: "2025-05-22", status: "Procesat", user: "Andrei Popescu", total: 2300 },
  { id: "DOC-007", name: "efactura_epsilon.xml", type: "XML", uploadedAt: "2025-05-25", status: "Procesat", user: "Maria Ionescu", total: 5670 },
];

export interface EInvoice {
  id: string;
  number: string;
  date: string;
  supplier: string;
  supplierCui: string;
  client: string;
  clientCui: string;
  net: number;
  vat: number;
  total: number;
  status: DocStatus;
  lines: { product: string; qty: number; price: number; vat: number; total: number }[];
}

export const eInvoices: EInvoice[] = [
  {
    id: "INV-001",
    number: "AFC-0125",
    date: "2025-05-12",
    supplier: "SC Alfa Consulting SRL",
    supplierCui: "RO12345678",
    client: "SC Imatech Solutions SRL",
    clientCui: "RO87654321",
    net: 1050.42,
    vat: 199.58,
    total: 1250,
    status: "Procesat",
    lines: [
      { product: "Consultanță IT", qty: 10, price: 105.04, vat: 19, total: 1250 },
    ],
  },
  {
    id: "INV-002",
    number: "BTR-0212",
    date: "2025-05-14",
    supplier: "SC Beta Retail SRL",
    supplierCui: "RO22345679",
    client: "SC Imatech Solutions SRL",
    clientCui: "RO87654321",
    net: 3352.94,
    vat: 637.06,
    total: 3990,
    status: "Procesat",
    lines: [
      { product: "Echipamente birou", qty: 5, price: 670.59, vat: 19, total: 3990 },
    ],
  },
  {
    id: "INV-003",
    number: "GMM-0099",
    date: "2025-05-18",
    supplier: "SC Gamma Distribuție SRL",
    supplierCui: "RO33456780",
    client: "SC Imatech Solutions SRL",
    clientCui: "RO87654321",
    net: 7142.86,
    vat: 1357.14,
    total: 8500,
    status: "Procesat",
    lines: [
      { product: "Materiale construcții", qty: 100, price: 71.43, vat: 19, total: 8500 },
    ],
  },
  {
    id: "INV-004",
    number: "EPS-0044",
    date: "2025-05-25",
    supplier: "SC Epsilon Software SRL",
    supplierCui: "RO55567892",
    client: "SC Imatech Solutions SRL",
    clientCui: "RO87654321",
    net: 4764.71,
    vat: 905.29,
    total: 5670,
    status: "Procesat",
    lines: [
      { product: "Licențe software", qty: 3, price: 1588.24, vat: 19, total: 5670 },
    ],
  },
  {
    id: "INV-005",
    number: "DLT-0301",
    date: "2025-05-28",
    supplier: "SC Delta Logistic SRL",
    supplierCui: "RO44456781",
    client: "SC Imatech Solutions SRL",
    clientCui: "RO87654321",
    net: 1932.77,
    vat: 367.23,
    total: 2300,
    status: "În procesare",
    lines: [
      { product: "Transport marfă", qty: 1, price: 1932.77, vat: 19, total: 2300 },
    ],
  },
];

export interface Partner {
  name: string;
  cui: string;
  invoices: number;
  total: number;
  lastInvoice: string;
  status: "Activ" | "Inactiv";
}

export const suppliers: Partner[] = [
  { name: "SC Alfa Consulting SRL", cui: "RO12345678", invoices: 12, total: 18500, lastInvoice: "2025-05-12", status: "Activ" },
  { name: "SC Beta Retail SRL", cui: "RO22345679", invoices: 8, total: 31200, lastInvoice: "2025-05-14", status: "Activ" },
  { name: "SC Gamma Distribuție SRL", cui: "RO33456780", invoices: 5, total: 42500, lastInvoice: "2025-05-18", status: "Activ" },
  { name: "SC Delta Logistic SRL", cui: "RO44456781", invoices: 3, total: 6900, lastInvoice: "2025-05-28", status: "Activ" },
  { name: "SC Epsilon Software SRL", cui: "RO55567892", invoices: 2, total: 11340, lastInvoice: "2025-05-25", status: "Inactiv" },
];

export const clients: Partner[] = [
  { name: "SC Omega Trading SRL", cui: "RO99887766", invoices: 14, total: 54300, lastInvoice: "2025-05-27", status: "Activ" },
  { name: "SC Sigma Industries SRL", cui: "RO88776655", invoices: 9, total: 38900, lastInvoice: "2025-05-22", status: "Activ" },
  { name: "SC Tau Construct SRL", cui: "RO77665544", invoices: 6, total: 22150, lastInvoice: "2025-05-15", status: "Activ" },
  { name: "PFA Mihai Georgescu", cui: "RO66554433", invoices: 4, total: 8400, lastInvoice: "2025-05-08", status: "Inactiv" },
];

export const monthlyInvoiceValue = [
  { month: "Ian", value: 32000 },
  { month: "Feb", value: 28500 },
  { month: "Mar", value: 41200 },
  { month: "Apr", value: 37800 },
  { month: "Mai", value: 52400 },
  { month: "Iun", value: 46100 },
];

export const vatDistribution = [
  { name: "TVA Colectată", value: 12450 },
  { name: "TVA Deductibilă", value: 8730 },
];

export const topSuppliers = suppliers
  .slice()
  .sort((a, b) => b.total - a.total)
  .slice(0, 5)
  .map((s) => ({ name: s.name.replace("SC ", "").replace(" SRL", ""), value: s.total }));

export const docsPerMonth = [
  { month: "Ian", docs: 18 },
  { month: "Feb", docs: 22 },
  { month: "Mar", docs: 31 },
  { month: "Apr", docs: 27 },
  { month: "Mai", docs: 42 },
  { month: "Iun", docs: 35 },
];

export const incomeVsExpenses = [
  { month: "Ian", venituri: 45000, cheltuieli: 32000 },
  { month: "Feb", venituri: 38000, cheltuieli: 28500 },
  { month: "Mar", venituri: 52000, cheltuieli: 41200 },
  { month: "Apr", venituri: 47000, cheltuieli: 37800 },
  { month: "Mai", venituri: 61000, cheltuieli: 52400 },
  { month: "Iun", venituri: 55000, cheltuieli: 46100 },
];

export const companyUsers = [
  { name: "Andrei Popescu", email: "andrei.popescu@imatech.ro", role: "Administrator", status: "Activ" },
  { name: "Maria Ionescu", email: "maria.ionescu@imatech.ro", role: "Contabil", status: "Activ" },
  { name: "Cristian Dumitru", email: "cristian.d@imatech.ro", role: "Vizualizare", status: "Inactiv" },
];

export const formatRON = (n: number) =>
  new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 2 }).format(n);
