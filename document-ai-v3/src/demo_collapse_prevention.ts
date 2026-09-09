// Standalone proof that region-dominance gating structurally prevents the
// exact v2 bug this session diagnosed repeatedly: a tax ID landing on the
// wrong company, and supplierTaxId/customerTaxId collapsing to the same
// value -- AND that the resolution is inspectable via Party.evidence, not a
// black box. Run with:
//   node --experimental-strip-types demo_collapse_prevention.ts
//
// Region bboxes below approximate the real layout of
// samples/waystar_two_column_party_block.png (supplier block left column,
// customer block right column, at genuine invoice proportions) -- not a
// contrived toy layout.

import { resolveParty } from "./regionResolver.ts";
import type { EntityCandidate, PartyCandidatePools, Region } from "./types.ts";

const regions: Region[] = [
  { type: "supplier_block", bbox: { x: 60, y: 170, width: 700, height: 130 }, boundaryConfidence: 0.9 },
  { type: "customer_block", bbox: { x: 900, y: 170, width: 700, height: 130 }, boundaryConfidence: 0.9 },
];

// The genuinely-correct supplier tax ID, positioned inside supplier_block.
const supplierTaxId: EntityCandidate = {
  value: "RO12345678",
  source: "layoutxlm",
  modelConfidence: 0.88,
  bbox: { x: 150, y: 270, width: 180, height: 24 },
};

// The genuinely-correct customer tax ID, positioned inside customer_block.
const customerTaxId: EntityCandidate = {
  value: "RO123456",
  source: "layoutxlm",
  modelConfidence: 0.85,
  bbox: { x: 1000, y: 270, width: 160, height: 24 },
};

// The adversarial case this file exists to catch: a candidate whose TEXT
// pattern is a strong tax-ID match (which is why a text-first heuristic can
// rank it above the real answer) but whose bbox sits inside customer_block,
// being considered for the SUPPLIER role. In v2, a nearby text cue or a
// pattern-quality bonus could let this win; here it must be excluded before
// scoring runs.
const wrongRegionCandidateForSupplierRole: EntityCandidate = {
  value: "RO123456",
  source: "ocr_regex",
  modelConfidence: 0.91, // deliberately higher than the correct candidate's own score
  bbox: { x: 1000, y: 270, width: 160, height: 24 }, // physically inside customer_block
};

const supplierNameCandidate: EntityCandidate = {
  value: "WAYSTAR ROYCO SRL",
  source: "layoutxlm",
  modelConfidence: 0.9,
  bbox: { x: 150, y: 210, width: 300, height: 24 },
};
const customerNameCandidate: EntityCandidate = {
  value: "KENDALL ROY",
  source: "layoutxlm",
  modelConfidence: 0.87,
  bbox: { x: 1000, y: 210, width: 200, height: 24 },
};

const supplierPools: PartyCandidatePools = {
  name: [supplierNameCandidate],
  taxId: [supplierTaxId, wrongRegionCandidateForSupplierRole],
  registrationNumber: [],
  address: [],
  iban: [],
  bank: [],
};
const customerPools: PartyCandidatePools = {
  name: [customerNameCandidate],
  taxId: [customerTaxId],
  registrationNumber: [],
  address: [],
};

const supplierParty = resolveParty(
  "supplier",
  "supplier_block",
  regions[0].bbox,
  regions,
  supplierPools,
);
const customerParty = resolveParty(
  "customer",
  "customer_block",
  regions[1].bbox,
  regions,
  customerPools,
);

console.log("supplierParty.taxId:", JSON.stringify(supplierParty.taxId, null, 2));
console.log(
  "supplierParty evidence for taxId (WHY it was assigned):",
  JSON.stringify(
    supplierParty.evidence.filter((e) => e.field === "taxId"),
    null,
    2,
  ),
);
console.log("customerParty.taxId:", JSON.stringify(customerParty.taxId, null, 2));

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`PASS: ${message}`);
}

assert(
  supplierParty.taxId.value === "RO12345678",
  "supplier tax ID resolves to the region-correct value, not the higher-scoring wrong-region candidate",
);

const taxIdEvidence = supplierParty.evidence.filter((e) => e.field === "taxId");
assert(taxIdEvidence.length === 2, "evidence trail retains BOTH taxId candidates considered, not just the winner");
const rejectedEvidence = taxIdEvidence.find((e) => e.value === "RO123456");
assert(
    rejectedEvidence !== undefined &&
    rejectedEvidence.accepted === false &&
    rejectedEvidence.relationToRegion === "excluded_wrong_region",
  "the higher-confidence wrong-region candidate is explicitly recorded as rejected, with its exact reason -- not silently outscored",
);
assert(
  supplierParty.taxId.value !== customerParty.taxId.value,
  "supplierTaxId and customerTaxId do not collapse to the same value",
);
assert(
  supplierParty.regionBBox === regions[0].bbox && customerParty.regionBBox === regions[1].bbox,
  "each party carries its own region bbox, not a shared/global one",
);
