import fs from "node:fs";

const workerPath = "worker/index.js";
let worker = fs.readFileSync(workerPath, "utf8");

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

if (!worker.includes("satelliteResult] = await Promise.all")) {
  worker = replaceOnce(
    worker,
    "const [projectResult, userResult, assignmentResult, consultantResult, evidenceResult, auditResult, sessionResult, userActivityResult] = await Promise.all([",
    "const [projectResult, userResult, assignmentResult, consultantResult, evidenceResult, auditResult, sessionResult, userActivityResult, satelliteResult] = await Promise.all([",
    "satellite Promise result",
  );

  const promiseTail = "    env.DB.prepare(`SELECT u.id AS userId,u.name,u.role,u.consultant_firm AS consultantFirm,u.status AS accountStatus,u.created_at AS accountCreatedAt,MAX(CASE WHEN a.action='login' THEN a.created_at END) AS auditLatestLogin,MAX(a.created_at) AS latestAuditActivity,SUM(CASE WHEN a.action='login' THEN 1 ELSE 0 END) AS auditLoginCount FROM users u LEFT JOIN audit_events a ON a.actor_id=u.id GROUP BY u.id,u.name,u.role,u.consultant_firm,u.status,u.created_at ORDER BY u.role,u.name`).all(),\n  ]);";
  const satelliteQuery = "    env.DB.prepare(`SELECT s.id,s.project_id AS projectId,p.name AS projectName,p.programme,p.component,p.state,p.lga,p.consultant_firm AS consultantFirm,s.analysis_type AS analysisType,s.provider,s.baseline_image_date AS baselineImageDate,s.comparison_image_date AS comparisonImageDate,s.baseline_release_date AS baselineReleaseDate,s.comparison_release_date AS comparisonReleaseDate,s.observations_json AS observationsJson,s.change_json AS changeJson,s.confidence_score AS confidenceScore,s.confidence_level AS confidenceLevel,s.review_required AS reviewRequired,s.review_status AS reviewStatus,s.created_at AS createdAt FROM satellite_analysis_runs s JOIN projects p ON p.id=s.project_id ORDER BY s.created_at DESC LIMIT 120`).all(),\n  ]);";
  worker = replaceOnce(worker, promiseTail, promiseTail.replace("\n  ]);", "\n") + satelliteQuery, "satellite AI query");
}

if (!worker.includes("const satelliteRows = satelliteResult.results || []")) {
  const anchor = "  const sessionRows = sessionResult.results || [];";
  const addition = `${anchor}
  const satelliteRows = satelliteResult.results || [];
  const satelliteConfidenceRows = satelliteRows.filter((row) => Number.isFinite(Number(row.confidenceScore)));
  const satelliteAverageConfidence = satelliteConfidenceRows.length
    ? Math.round(satelliteConfidenceRows.reduce((sum, row) => sum + Number(row.confidenceScore || 0), 0) / satelliteConfidenceRows.length)
    : 0;
  const satelliteByType = Object.fromEntries([...new Set(satelliteRows.map((row) => row.analysisType).filter(Boolean))]
    .map((type) => [type, satelliteRows.filter((row) => row.analysisType === type).length]));
  const satelliteByReview = Object.fromEntries([...new Set(satelliteRows.map((row) => row.reviewStatus).filter(Boolean))]
    .map((status) => [status, satelliteRows.filter((row) => row.reviewStatus === status).length]));
  const satelliteRecentFindings = satelliteRows.slice(0, 40).map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    programme: row.programme,
    component: row.component,
    state: row.state,
    lga: row.lga,
    consultantFirm: row.consultantFirm || "",
    analysisType: row.analysisType,
    provider: row.provider,
    baselineImageDate: row.baselineImageDate,
    comparisonImageDate: row.comparisonImageDate,
    baselineReleaseDate: row.baselineReleaseDate,
    comparisonReleaseDate: row.comparisonReleaseDate,
    confidenceScore: Number(row.confidenceScore || 0),
    confidenceLevel: row.confidenceLevel || "inconclusive",
    manualReview: Number(row.reviewRequired) === 1,
    reviewStatus: row.reviewStatus,
    observations: (() => { try { return JSON.parse(row.observationsJson || "{}"); } catch { return {}; } })(),
    change: (() => { try { return JSON.parse(row.changeJson || "{}"); } catch { return {}; } })(),
    createdAt: row.createdAt,
  }));`;
  worker = replaceOnce(worker, anchor, addition, "satellite AI metrics");
}

if (!worker.includes("satelliteIntelligence: {")) {
  const anchor = "    sessionActivity: {";
  const block = `    satelliteIntelligence: {
      analysisCount: satelliteRows.length,
      projectsAnalysed: new Set(satelliteRows.map((row) => row.projectId)).size,
      manualReview: satelliteRows.filter((row) => Number(row.reviewRequired) === 1).length,
      averageConfidence: satelliteAverageConfidence,
      byAnalysisType: satelliteByType,
      byReviewStatus: satelliteByReview,
      recentFindings: satelliteRecentFindings,
      interpretationRule: "Provider facts, model observations, human review decisions, and management interpretation are separate evidence layers. Satellite analysis is supporting evidence only and cannot independently prove fraud, non-existence, completion, compliance, abandonment, or verification status.",
      provenanceRule: "Wayback release date and actual source-image capture date are distinct. If capture date is unknown, say so explicitly.",
    },
${anchor}`;
  worker = replaceOnce(worker, anchor, block, "satellite AI context");
}

if (!worker.includes("SATELLITE INTELLIGENCE INTERPRETATION RULES:")) {
  const anchor = "SESSION ACTIVITY INTERPRETATION RULES:";
  const rules = `SATELLITE INTELLIGENCE INTERPRETATION RULES:
- satelliteIntelligence contains stored, auditable satellite-analysis records tied to authoritative project coordinates from D1.
- Separate provider facts (coordinates, provider, release date, capture date) from model observations, human review decisions, and management interpretation.
- Wayback release date is not the same as image capture date. If capture date is null or unknown, say it is unknown; never infer one from a release date.
- A model observation such as visible clearing, array-like footprint, road change, or no clear visible change is supporting evidence only.
- Never convert satellite uncertainty or a model observation into a claim of fraud, abandonment, project non-existence, project completion, compliance, or verification.
- A low-confidence, inconclusive, stale, conflicting, or unknown-date finding requires manual review. Explain the recorded limitation instead of strengthening the conclusion.
- If field evidence and satellite findings differ, describe the discrepancy and recommend human review; do not decide which source is truthful without further evidence.

${anchor}`;
  worker = replaceOnce(worker, anchor, rules, "satellite interpretation rules");
}

fs.writeFileSync(workerPath, worker);
