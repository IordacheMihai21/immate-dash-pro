// document-ai-v3 prototype types. Standalone -- nothing in document-ai-backend/
// or src/ imports from here, and this file imports nothing from them either
// (BBox is redefined to match src/lib/layoutLines.ts's OcrWord bbox shape
// exactly, so a future real integration can share values without translation,
// without creating a dependency edge during the prototype phase).

export type BBox = { x: number; y: number; width: number; height: number };

export type RegionType =
  | "supplier_block"
  | "customer_block"
  | "metadata_block"
  | "items_table"
  | "totals_region"
  | "footer";

// boundaryConfidence comes from the layout/segmentation engine (PP-StructureV3
// or equivalent) -- how sure IT is that this bbox is really this region type,
// not a probability about the fields inside it.
export type Region = {
  type: RegionType;
  bbox: BBox;
  boundaryConfidence: number;
};

export type EntitySource = "layoutxlm" | "ocr_regex";

export type EntityCandidate = {
  value: string;
  source: EntitySource;
  modelConfidence: number;
  bbox: BBox;
};

export type TableColumn = {
  headerText: string;
  headerBBox: BBox;
  xRange: [number, number];
};

export type TableCell = {
  value: string;
  bbox: BBox;
  columnIndex: number | null;
};

export type TableRow = {
  cells: TableCell[];
};

export type ItemsTable = {
  region: Region;
  columns: TableColumn[];
  rows: TableRow[];
};

export type RegionGraph = {
  regions: Region[];
  itemsTable: ItemsTable | null;
};

// Three separate numbers, never blended into one displayed "confidence %"
// until calibration is actually fitted -- see RESOLVER_DESIGN.md.
export type ConfidenceLayers = {
  modelConfidence: number;
  structuralConsistency: number;
  calibratedConfidence: number | null;
};

export type PartyFieldName = "name" | "taxId" | "registrationNumber" | "address" | "iban" | "bank";

// Why a candidate's own bbox was or wasn't accepted for its field's region --
// same values checkRoleEligibility in regionResolver.ts already produces, so
// every evidence entry can carry the exact reason the gate made its call.
export type RelationToRegion =
  | "same_region"
  | "no_region_data"
  | "weak_boundary_override"
  | "excluded_wrong_region";

// One entry per candidate CONSIDERED for a field, winner and losers alike --
// this is the "why was supplierTaxId assigned this value" trail the user
// asked for. `accepted` marks the single winner per field; every other
// candidate for that field stays in the array with accepted: false and its
// own relationToRegion, so a rejection is always visible, not just implied
// by absence.
export type FieldEvidence = {
  field: PartyFieldName;
  value: string;
  bbox: BBox;
  source: EntitySource;
  modelConfidence: number;
  relationToRegion: RelationToRegion;
  accepted: boolean;
};

export type ResolvedField = {
  value: string | null;
  confidence: ConfidenceLayers;
  source: EntitySource | null;
};

export type PartyRole = "supplier" | "customer";

// One shape for both roles -- iban/bank are null (not omitted) for a
// customer party, since customers don't carry payment routing info on an
// invoice; null here is a genuine "this field doesn't apply to this role,"
// distinct from a supplier field that applies but wasn't found (value: null
// inside a present ResolvedField).
export type Party = {
  role: PartyRole;
  regionBBox: BBox | null;
  name: ResolvedField;
  taxId: ResolvedField;
  registrationNumber: ResolvedField;
  address: ResolvedField;
  iban: ResolvedField | null;
  bank: ResolvedField | null;
  // Every FieldEvidence entry from every field this party resolved, flat --
  // filter by `field` to inspect one field's full candidate trail (e.g.
  // evidence.filter(e => e.field === "taxId") to see exactly why
  // supplierTaxId was assigned, including every candidate that lost).
  evidence: FieldEvidence[];
};
