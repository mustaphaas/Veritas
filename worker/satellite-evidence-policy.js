// Evidence policy for satellite verification.
//
// The vision model answers "is solar equipment visible in this frame?". The
// question REA needs answered is "is THIS project's equipment visible at THIS
// point?". Those diverge whenever unrelated solar sits elsewhere in the frame
// (an institutional roof in a town) or when the component is too small to
// resolve from overhead. This module closes that gap with rules the backend
// enforces regardless of what the model claims, the same principle already
// applied to unusable imagery in parseVerdict.
//
// Pure functions, no I/O, so every rule is unit-testable.

// How each component type can be evidenced from overhead imagery.
//   direct          - has a distinctive footprint at this resolution
//   limited         - weak overhead signature; presence needs care, absence can't be shown
//   settlement_only - household-scale; imagery can describe the settlement but cannot confirm it
export const EVIDENCE_CLASS = {
  mini_grid: "direct",
  street_light: "direct",
  grid_extension: "limited",
  unknown: "limited",
  distributed: "settlement_only",
};

// Upper bounds on reported confidence per component, applied only once the
// component's signature has been seen (see signatureStrength below). These are
// policy knobs, not measurements: a pole line is harder to confirm from above
// than a block of panels, so the model may not report more certainty than the
// signature allows.
export const CONFIDENCE_CAP = {
  mini_grid: 1,
  street_light: 0.75,
  grid_extension: 0.75,
  unknown: 0.6,
  distributed: null,
};

// A frame cannot physically hold more rooftops than one per this many square
// metres (roughly a single-room footprint with no gap between buildings).
// This is an impossibility guard, deliberately loose, not a density estimate.
const MIN_SQUARE_METRES_PER_ROOFTOP = 50;
const HOUSEHOLD_RATIO_NOTE = 3;

export function classifyComponent(programme, component) {
  const text = `${component || ""} ${programme || ""}`.toLowerCase();
  if (/(solar\s*home|home\s*system|\bshs\b|stand[\s-]*alone)/.test(text)) return "distributed";
  if (/street\s*-?\s*light/.test(text)) return "street_light";
  if (/mini[\s-]*grid/.test(text)) return "mini_grid";
  if (/(grid\s*extension|line\s*extension|distribution\s*line|transformer)/.test(text)) return "grid_extension";
  return "unknown";
}

export function assessHouseEstimate({ estimate, households, radiusMetres }) {
  if (!Number.isFinite(estimate)) return { estimate: null, note: null, discarded: false };
  const side = Number.isFinite(radiusMetres) ? radiusMetres * 2 : null;
  if (side) {
    const ceiling = Math.floor((side * side) / MIN_SQUARE_METRES_PER_ROOFTOP);
    if (estimate > ceiling) {
      return {
        estimate: null,
        discarded: true,
        note: `The model's rooftop count (${estimate}) is more than the frame can physically hold, so it has been discarded.`,
      };
    }
  }
  const served = Number(households);
  if (Number.isFinite(served) && served > 0) {
    if (estimate > served * HOUSEHOLD_RATIO_NOTE) {
      return {
        estimate,
        discarded: false,
        note: `The frame shows about ${estimate} rooftops (all buildings) against ${served} households on record for this project, so the project is at most a small part of what is visible.`,
      };
    }
    if (estimate < served / HOUSEHOLD_RATIO_NOTE) {
      return {
        estimate,
        discarded: false,
        note: `The frame shows about ${estimate} rooftops against ${served} households on record. The frame may cover only part of the served area, or the stored coordinates may be off.`,
      };
    }
  }
  return { estimate, note: null, discarded: false };
}

const LIMITATION_MESSAGE = {
  distributed_systems:
    "Household-scale systems cannot be confirmed from overhead imagery: individual panels are only a few pixels across and cannot be tied to this project. The image describes the settlement only.",
  evidence_elsewhere:
    "Solar equipment is visible in the frame, but not at the stored project point, so it cannot be attributed to this project.",
  evidence_unattributed:
    "The model did not establish that the equipment sits at the stored project point, so presence is not confirmed.",
};

// What "seen" means differs by component, so the explanation does too.
const SIGNATURE_PARTIAL_MESSAGE = {
  mini_grid:
    "Only a small or ambiguous cluster of panels is visible. A mini-grid generation site shows as a large block of panels, so presence is not confirmed.",
  grid_extension:
    "A cleared corridor alone does not establish a line. Confirmation needs poles or conductors along it, and none could be established here.",
  street_light:
    "No regular run of poles or luminaires could be established at the project point.",
  unknown:
    "The claimed equipment is only partly identifiable, so presence is not confirmed.",
};

const WEAK_SIGNATURE_MESSAGE = {
  grid_extension:
    "No pole line could be established. Poles are thin and often hidden by canopy or lost to resolution, so this is not proof that the line is missing, and it does not confirm it either.",
  unknown:
    "This component has a weak overhead signature. Imagery can show possible presence but cannot show that it is absent.",
};

function limitationMessage(code, kind) {
  if (code === "signature_partial") return SIGNATURE_PARTIAL_MESSAGE[kind] || SIGNATURE_PARTIAL_MESSAGE.unknown;
  if (code === "weak_signature") return WEAK_SIGNATURE_MESSAGE[kind] || WEAK_SIGNATURE_MESSAGE.unknown;
  return LIMITATION_MESSAGE[code];
}

// Returns a new verdict; never mutates the input. `modelStatus` preserves what
// the model said before policy, so overrides stay auditable.
export function applyEvidencePolicy(verdict, project, radiusMetres) {
  const kind = classifyComponent(project?.programme, project?.component);
  const evidenceClass = EVIDENCE_CLASS[kind];
  const cap = CONFIDENCE_CAP[kind];

  let status = verdict.status;
  let confidence = verdict.confidence;
  let limitationCode = null;

  if (kind === "distributed") {
    status = "inconclusive";
    confidence = null;
    limitationCode = "distributed_systems";
  } else {
    if (status === "present") {
      if (verdict.evidenceLocation === "elsewhere_in_frame") {
        status = "inconclusive";
        limitationCode = "evidence_elsewhere";
      } else if (verdict.evidenceLocation !== "at_project_point") {
        // "none" contradicts "present"; a missing or invalid value means the
        // model never localised the equipment. Neither confirms the claim.
        status = "inconclusive";
        limitationCode = "evidence_unattributed";
      } else if (verdict.signatureStrength === "partial") {
        // Something is at the point, but not the thing the project should
        // show: a cleared corridor is not a pole line, three panels are not
        // a mini-grid.
        status = "inconclusive";
        limitationCode = "signature_partial";
      } else if (verdict.signatureStrength !== "strong") {
        status = "inconclusive";
        limitationCode = "evidence_unattributed";
      }
    }
    if (status === "absent" && verdict.signatureStrength === "partial") {
      // Some of the signature is visible, so "absent" would overstate.
      status = "inconclusive";
      limitationCode = "signature_partial";
    }
    if (evidenceClass === "limited" && status === "absent") {
      status = "inconclusive";
      limitationCode = "weak_signature";
    }
    if (status === "inconclusive" && verdict.imageQuality === "unusable") {
      // Image quality already explains this one; keep that as the sole reason.
      limitationCode = null;
    }
    if (typeof cap === "number" && typeof confidence === "number") {
      confidence = Math.min(confidence, cap);
    }
    if (status === "inconclusive" && limitationCode) confidence = null;
  }

  const houses = assessHouseEstimate({
    estimate: verdict.estimatedNearbyHouses,
    households: project?.households,
    radiusMetres,
  });

  return {
    ...verdict,
    status,
    confidence,
    estimatedNearbyHouses: houses.estimate,
    modelStatus: verdict.status,
    evidenceClass,
    evidenceLocation: verdict.evidenceLocation ?? null,
    signatureStrength: verdict.signatureStrength ?? null,
    limitation: limitationCode ? { code: limitationCode, message: limitationMessage(limitationCode, kind) } : null,
    houseEstimateNote: houses.note,
  };
}
