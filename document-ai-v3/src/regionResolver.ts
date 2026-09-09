// Region-dominance resolver: the actual mechanism from RESOLVER_DESIGN.md
// that prevents supplier/customer tax-ID (and name) collapse. A candidate
// whose own bbox falls in the wrong party's region is excluded from that
// role's candidate pool BEFORE scoring runs -- not down-weighted after the
// fact. This is deliberately a hard gate for the two tax-ID relations
// specifically (see RESOLVER_DESIGN.md "Region dominance"), with a narrow,
// evidence-gated override rather than no override at all, so a genuine
// layout-segmentation mistake isn't permanently unrecoverable.
//
// Every field this module resolves also produces a full FieldEvidence trail
// (winner AND every rejected candidate, each with its own relationToRegion)
// so a caller can answer "why was supplierTaxId assigned this value" by
// inspecting Party.evidence, not by re-deriving it from logs.

import type {
  BBox,
  ConfidenceLayers,
  EntityCandidate,
  FieldEvidence,
  Party,
  PartyFieldName,
  PartyRole,
  Region,
  RegionType,
  RelationToRegion,
  ResolvedField,
} from "./types";

function bboxCenter(bbox: BBox): { x: number; y: number } {
  return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
}

function bboxContainsCenter(regionBBox: BBox, candidateBBox: BBox): boolean {
  const center = bboxCenter(candidateBBox);
  return (
    center.x >= regionBBox.x &&
    center.x <= regionBBox.x + regionBBox.width &&
    center.y >= regionBBox.y &&
    center.y <= regionBBox.y + regionBBox.height
  );
}

// Regions can legitimately overlap slightly at their shared boundary (e.g.
// two adjacent columns whose segmentation boxes touch). When a candidate's
// center falls in more than one region, prefer the one the layout engine is
// more confident about, rather than an arbitrary first-match.
export function regionForBBox(regions: Region[], bbox: BBox): Region | null {
  const containing = regions.filter((region) => bboxContainsCenter(region.bbox, bbox));
  if (containing.length === 0) return null;
  return containing.reduce((best, region) =>
    region.boundaryConfidence > best.boundaryConfidence ? region : best,
  );
}

// LayoutXLM entity confidence required before a wrong-region candidate can
// even be considered for override -- deliberately high, since this is the
// exact failure mode (confident-but-wrong) that motivated v3.
const REGION_OVERRIDE_MODEL_CONFIDENCE_THRESHOLD = 0.92;
// Layout engine's own region-boundary confidence below which its assignment
// can be second-guessed at all. Above this, the segmentation is trusted
// outright and no override is possible regardless of model confidence.
const WEAK_BOUNDARY_CONFIDENCE_THRESHOLD = 0.55;

export function checkRoleEligibility(
  candidate: EntityCandidate,
  candidateRegion: Region | null,
  targetRoleRegion: RegionType,
): { eligible: boolean; reason: RelationToRegion } {
  if (candidateRegion === null) {
    // No region membership at all (segmentation gap, e.g. candidate sits
    // outside every detected region's bbox). Region dominance can only gate
    // a candidate we affirmatively know is in the WRONG region -- absence of
    // region data is not evidence of wrongness.
    return { eligible: true, reason: "no_region_data" };
  }
  if (candidateRegion.type === targetRoleRegion) {
    return { eligible: true, reason: "same_region" };
  }

  const boundaryIsWeak = candidateRegion.boundaryConfidence < WEAK_BOUNDARY_CONFIDENCE_THRESHOLD;
  const modelIsVeryConfident = candidate.modelConfidence >= REGION_OVERRIDE_MODEL_CONFIDENCE_THRESHOLD;

  if (boundaryIsWeak && modelIsVeryConfident) {
    return { eligible: true, reason: "weak_boundary_override" };
  }
  return { eligible: false, reason: "excluded_wrong_region" };
}

function emptyField(): ResolvedField {
  return {
    value: null,
    confidence: { modelConfidence: 0, structuralConsistency: 0, calibratedConfidence: null },
    source: null,
  };
}

// Resolves ONE field for ONE party role from a candidate pool, applying
// region-dominance gating first, then picking the highest model-confidence
// survivor. Returns both the resolved field AND the full evidence trail
// (every candidate considered, winner and losers, each tagged with why it
// was or wasn't eligible) -- the trail is what makes the resolution
// inspectable rather than a black box.
export function resolveFieldForRole(
  fieldName: PartyFieldName,
  candidates: EntityCandidate[],
  regions: Region[],
  targetRoleRegion: RegionType,
): { field: ResolvedField; evidence: FieldEvidence[] } {
  const scored = candidates.map((candidate) => {
    const candidateRegion = regionForBBox(regions, candidate.bbox);
    const { eligible, reason } = checkRoleEligibility(candidate, candidateRegion, targetRoleRegion);
    return { candidate, eligible, reason };
  });

  const eligible = scored.filter((entry) => entry.eligible);

  const winner =
    eligible.length === 0
      ? null
      : eligible.reduce((best, current) =>
          current.candidate.modelConfidence > best.candidate.modelConfidence ? current : best,
        );

  const evidence: FieldEvidence[] = scored.map((entry) => ({
    field: fieldName,
    value: entry.candidate.value,
    bbox: entry.candidate.bbox,
    source: entry.candidate.source,
    modelConfidence: entry.candidate.modelConfidence,
    relationToRegion: entry.reason,
    accepted: entry.candidate === winner?.candidate,
  }));

  if (winner === null) {
    return { field: emptyField(), evidence };
  }

  const structuralConsistency = winner.reason === "same_region" ? 1 : 0.5;
  const confidence: ConfidenceLayers = {
    modelConfidence: winner.candidate.modelConfidence,
    structuralConsistency,
    // Deferred until v3 has real predictions on a labeled validation set to
    // fit temperature scaling / isotonic regression against -- see
    // RESOLVER_DESIGN.md "Confidence layering". Never fabricate this number.
    calibratedConfidence: null,
  };

  return {
    field: { value: winner.candidate.value, confidence, source: winner.candidate.source },
    evidence,
  };
}

export type PartyCandidatePools = {
  name: EntityCandidate[];
  taxId: EntityCandidate[];
  registrationNumber: EntityCandidate[];
  address: EntityCandidate[];
  iban?: EntityCandidate[];
  bank?: EntityCandidate[];
};

// Resolves a full party object in one pass from per-field candidate pools,
// all gated against the SAME region (see RESOLVER_DESIGN.md "Party objects"
// -- one region, one object, not five independently-scored fields that
// happen to share a role tag). iban/bank pools are only meaningful for the
// supplier role; pass them omitted (or empty) for a customer and the
// resulting fields are null, not an empty-but-present ResolvedField, since
// "doesn't apply to this role" is a different state from "applies but not
// found."
export function resolveParty(
  role: PartyRole,
  regionType: RegionType,
  regionBBox: BBox | null,
  regions: Region[],
  pools: PartyCandidatePools,
): Party {
  const nameResult = resolveFieldForRole("name", pools.name, regions, regionType);
  const taxIdResult = resolveFieldForRole("taxId", pools.taxId, regions, regionType);
  const regNumberResult = resolveFieldForRole(
    "registrationNumber",
    pools.registrationNumber,
    regions,
    regionType,
  );
  const addressResult = resolveFieldForRole("address", pools.address, regions, regionType);

  const hasIban = pools.iban !== undefined;
  const hasBank = pools.bank !== undefined;
  const ibanResult = hasIban ? resolveFieldForRole("iban", pools.iban!, regions, regionType) : null;
  const bankResult = hasBank ? resolveFieldForRole("bank", pools.bank!, regions, regionType) : null;

  const evidence = [
    ...nameResult.evidence,
    ...taxIdResult.evidence,
    ...regNumberResult.evidence,
    ...addressResult.evidence,
    ...(ibanResult?.evidence ?? []),
    ...(bankResult?.evidence ?? []),
  ];

  return {
    role,
    regionBBox,
    name: nameResult.field,
    taxId: taxIdResult.field,
    registrationNumber: regNumberResult.field,
    address: addressResult.field,
    iban: ibanResult?.field ?? null,
    bank: bankResult?.field ?? null,
    evidence,
  };
}
