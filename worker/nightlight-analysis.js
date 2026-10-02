import { sameFirm } from "./tenant.js";
import {
  isPortfolioAggregateQuestion,
  projectIdentityTokens,
  rankProjects,
  resolveSatelliteProject,
} from "./satellite-analysis.js";

const encoder = new TextEncoder();
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function digest(value) {
  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      typeof value === "string" ? encoder.encode(value) : value,
    ),
  );
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function currentUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !env.DB) return null;
  const tokenHash = await digest(bearer);
  return env.DB.prepare(
    `SELECT u.id,u.name,u.role,u.consultant_firm AS consultantFirm
     FROM sessions s JOIN users u ON u.id=s.user_id
     WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first();
}

const NIGHTLIGHT_QUERY =
  /\b(VIIRS|Black\s*Marble|night[-\s]?time\s+light(?:s|ing)?|night\s+light(?:s|ing)?|night[-\s]?light|radiance|electrification\s+impact|light\s+impact)\b/i;

export function isNightLightImpactQuestion(question) {
  return NIGHTLIGHT_QUERY.test(String(question || ""));
}

const ELIGIBILITY_QUERY =
  /\b(eligible|eligibility|which projects?|what projects?|projects? .* completion|commission(?:ed|ing)?|ready .* VIIRS|VIIRS .* ready|night[-\s]?light .* eligible)\b/i;

export function isNightLightEligibilityQuestion(question) {
  const text = String(question || "");
  return isNightLightImpactQuestion(text) && ELIGIBILITY_QUERY.test(text);
}

function parseJson(value, fallback) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normaliseImpactRow(row) {
  if (!row) return null;
  return {
    projectId: row.projectId,
    commissioningDate: row.commissioningDate,
    dateBasis: row.dateBasis,
    radiusMetres: Number(row.radiusMetres || 0),
    coreRadiusMetres: Number(row.coreRadiusMetres || 1000),
    controlInnerMetres: Number(row.controlInnerMetres || 0),
    controlOuterMetres: Number(row.controlOuterMetres || 0),
    beforeStart: row.beforeStart || null,
    beforeEnd: row.beforeEnd || null,
    afterStart: row.afterStart || null,
    afterEnd: row.afterEnd || null,
    baselineRadiance: row.baselineRadiance == null ? null : Number(row.baselineRadiance),
    afterRadiance: row.afterRadiance == null ? null : Number(row.afterRadiance),
    radianceDelta: row.radianceDelta == null ? null : Number(row.radianceDelta),
    percentChange: row.percentChange == null ? null : Number(row.percentChange),
    coreBaselineRadiance: row.coreBaselineRadiance == null ? null : Number(row.coreBaselineRadiance),
    coreAfterRadiance: row.coreAfterRadiance == null ? null : Number(row.coreAfterRadiance),
    coreRadianceDelta: row.coreRadianceDelta == null ? null : Number(row.coreRadianceDelta),
    corePercentChange: row.corePercentChange == null ? null : Number(row.corePercentChange),
    coreMeanBaselineRadiance: row.coreMeanBaselineRadiance == null ? null : Number(row.coreMeanBaselineRadiance),
    coreMeanAfterRadiance: row.coreMeanAfterRadiance == null ? null : Number(row.coreMeanAfterRadiance),
    coreP90BaselineRadiance: row.coreP90BaselineRadiance == null ? null : Number(row.coreP90BaselineRadiance),
    coreP90AfterRadiance: row.coreP90AfterRadiance == null ? null : Number(row.coreP90AfterRadiance),
    coreP90PercentChange: row.coreP90PercentChange == null ? null : Number(row.coreP90PercentChange),
    controlBaselineRadiance: row.controlBaselineRadiance == null ? null : Number(row.controlBaselineRadiance),
    controlAfterRadiance: row.controlAfterRadiance == null ? null : Number(row.controlAfterRadiance),
    controlPercentChange: row.controlPercentChange == null ? null : Number(row.controlPercentChange),
    differentialPercentagePoints:
      row.differentialPercentagePoints == null ? null : Number(row.differentialPercentagePoints),
    monthsBefore: Number(row.monthsBefore || 0),
    monthsAfter: Number(row.monthsAfter || 0),
    impactClass: row.impactClass || "insufficient_data",
    dataQuality: row.dataQuality || "insufficient",
    detectionMetric: row.detectionMetric || "",
    detectionReason: row.detectionReason || "",
    series: parseJson(row.seriesJson, []),
    beforeGrid: parseJson(row.beforeGridJson, null),
    afterGrid: parseJson(row.afterGridJson, null),
    sourceProduct: row.sourceProduct || "VNP46A3.002",
    sourceName: row.sourceName || "NASA VIIRS Black Marble",
    sourceUrl: row.sourceUrl || "",
    analysisMethod: row.analysisMethod || "monthly-median-v1",
    checkedAt: row.checkedAt || null,
  };
}

async function loadNightLightImpact(env, projectId) {
  const row = await env.DB.prepare(
    `SELECT
       project_id AS projectId,
       commissioning_date AS commissioningDate,
       date_basis AS dateBasis,
       radius_metres AS radiusMetres,
       core_radius_metres AS coreRadiusMetres,
       control_inner_metres AS controlInnerMetres,
       control_outer_metres AS controlOuterMetres,
       before_start AS beforeStart,
       before_end AS beforeEnd,
       after_start AS afterStart,
       after_end AS afterEnd,
       baseline_radiance AS baselineRadiance,
       after_radiance AS afterRadiance,
       radiance_delta AS radianceDelta,
       percent_change AS percentChange,
       core_baseline_radiance AS coreBaselineRadiance,
       core_after_radiance AS coreAfterRadiance,
       core_radiance_delta AS coreRadianceDelta,
       core_percent_change AS corePercentChange,
       core_mean_baseline_radiance AS coreMeanBaselineRadiance,
       core_mean_after_radiance AS coreMeanAfterRadiance,
       core_p90_baseline_radiance AS coreP90BaselineRadiance,
       core_p90_after_radiance AS coreP90AfterRadiance,
       core_p90_percent_change AS coreP90PercentChange,
       control_baseline_radiance AS controlBaselineRadiance,
       control_after_radiance AS controlAfterRadiance,
       control_percent_change AS controlPercentChange,
       differential_percentage_points AS differentialPercentagePoints,
       months_before AS monthsBefore,
       months_after AS monthsAfter,
       impact_class AS impactClass,
       data_quality AS dataQuality,
       detection_metric AS detectionMetric,
       detection_reason AS detectionReason,
       series_json AS seriesJson,
       before_grid_json AS beforeGridJson,
       after_grid_json AS afterGridJson,
       source_product AS sourceProduct,
       source_name AS sourceName,
       source_url AS sourceUrl,
       analysis_method AS analysisMethod,
       checked_at AS checkedAt
     FROM project_nightlight_impacts WHERE project_id=?`,
  )
    .bind(projectId)
    .first();
  return normaliseImpactRow(row);
}

const ROUTE_PATTERN = /^\/api\/projects\/([^/]+)\/nightlight-impact$/;

export async function handleNightLightImpact(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(ROUTE_PATTERN);
  if (!match) return null;
  if (request.method !== "GET") return response({ error: "Method not allowed." }, 405);

  const user = await currentUser(request, env);
  if (!user) return response({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin" && user.role !== "consultant_admin") {
    return response({ error: "REA or consultant access required." }, 403);
  }

  const projectId = decodeURIComponent(match[1]);
  const project = await env.DB.prepare(
    `SELECT id,name,programme,component,consultant_firm AS consultantFirm,state,lga,community,
       latitude,longitude,commissioned_at AS commissionedAt
     FROM projects WHERE id=?`,
  )
    .bind(projectId)
    .first();
  if (!project) return response({ error: "Project not found." }, 404);
  if (user.role === "consultant_admin" && !sameFirm(project.consultantFirm, user.consultantFirm)) {
    return response({ error: "Project is outside your consultant firm." }, 403);
  }

  const impact = await loadNightLightImpact(env, projectId);
  if (!impact) {
    return response(
      {
        error: "No NASA VIIRS night-time light analysis has been calculated for this project yet.",
        code: project.commissionedAt ? "nightlight_not_processed" : "commissioning_date_required",
        projectId,
      },
      404,
    );
  }
  return response({ project, impact });
}


async function loadNightLightEligibility(env) {
  const result = await env.DB.prepare(
    `SELECT
       p.id,
       p.name,
       p.state,
       p.lga,
       p.community,
       p.programme,
       p.component,
       p.portfolio_status AS status,
       p.verified,
       p.commissioned_at AS commissionedAt,
       CASE WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN 1 ELSE 0 END AS hasCoordinates,
       CASE WHEN n.project_id IS NOT NULL THEN 1 ELSE 0 END AS hasImpact,
       n.checked_at AS impactCheckedAt
     FROM projects p
     LEFT JOIN project_nightlight_impacts n ON n.project_id=p.id
     WHERE p.latitude IS NOT NULL
       AND p.longitude IS NOT NULL
       AND p.commissioned_at IS NOT NULL
     ORDER BY
       CASE WHEN n.project_id IS NOT NULL THEN 0 ELSE 1 END,
       CASE WHEN p.verified=1 THEN 0 ELSE 1 END,
       p.name
     LIMIT 50`
  ).all();

  const rows = result?.results || [];
  const processed = rows.filter((row) => Number(row.hasImpact) === 1);
  const waiting = rows.filter((row) => Number(row.hasImpact) !== 1);
  return {
    eligibleCount: rows.length,
    processedCount: processed.length,
    waitingCount: waiting.length,
    projects: rows.map((row) => ({
      id: row.id,
      name: row.name,
      state: row.state || "",
      lga: row.lga || "",
      community: row.community || "",
      programme: row.programme || "",
      component: row.component || "",
      status: row.status || "",
      verified: Number(row.verified) === 1,
      commissionedAt: row.commissionedAt,
      hasImpact: Number(row.hasImpact) === 1,
      impactCheckedAt: row.impactCheckedAt || null,
    })),
  };
}

function nightLightEligibilityAnswer(result) {
  if (!result?.projects?.length) {
    return [
      "**No projects currently meet the VIIRS before/after eligibility requirements.**",
      "",
      "Veritas checked the live project database for projects with both stored GPS coordinates and a recorded commissioning/completion date. None currently satisfy both requirements.",
      "",
      "This is a data-readiness issue, not a privacy restriction. Record a valid completion/commissioning month for a completed project, then run the VIIRS refresh workflow.",
    ].join("\n");
  }

  const lines = result.projects.slice(0, 12).map((project, index) => {
    const state = project.state ? ` · ${project.state}` : "";
    const status = project.hasImpact ? "VIIRS processed" : "Ready for VIIRS refresh";
    return `${index + 1}. **${project.name}**${state} — ${status} — completion reference ${project.commissionedAt}`;
  });

  return [
    `**${result.eligibleCount} project${result.eligibleCount === 1 ? "" : "s"} currently meet the core VIIRS eligibility requirements.**`,
    "",
    `Of these, ${result.processedCount} already have stored VIIRS results and ${result.waitingCount} are waiting for the VIIRS refresh job.`,
    "",
    ...lines,
    "",
    "Eligibility here means Veritas has stored project coordinates and a recorded completion/commissioning date. Raw coordinates are not shown in chat.",
  ].join("\n");
}

export async function shouldRunNightLightAnalysis(env, question, hints = {}) {
  if (!isNightLightImpactQuestion(question)) return false;
  if (isNightLightEligibilityQuestion(question)) return true;
  if (typeof hints.projectId === "string" && hints.projectId.trim()) return true;

  if (!isPortfolioAggregateQuestion(question)) return true;

  try {
    const noMapHint = { ...hints, mapProjectId: "" };
    const resolution = await resolveSatelliteProject(env, question, noMapHint);
    return resolution.status === "resolved" && ["id", "name", "selection"].includes(resolution.via);
  } catch {
    return false;
  }
}

async function resolveProcessedNightLightProject(env, question) {
  const tokens = projectIdentityTokens(question);
  if (!tokens.length) return null;

  const result = await env.DB.prepare(
    `SELECT
       p.id,p.name,p.programme,p.component,p.state,p.lga,p.community,
       p.latitude,p.longitude,p.commissioned_at AS commissionedAt
     FROM projects p
     INNER JOIN project_nightlight_impacts n ON n.project_id=p.id
     WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
     ORDER BY p.name
     LIMIT 2000`,
  ).all();

  const rows = result?.results || [];
  if (!rows.length) return null;

  const ranked = rankProjects(rows, tokens);
  if (!ranked.length) return null;

  const [top, second] = ranked;
  const coverage = top.matched / tokens.length;
  if (coverage >= 0.5 && (!second || top.score > second.score)) {
    return { status: "resolved", project: top.row, via: "processed-name" };
  }
  return null;
}

export async function runNightLightAnalysis(request, env, question, hints = {}) {
  if (!env.DB) throw new Error("D1 database binding is unavailable.");

  if (isNightLightEligibilityQuestion(question)) {
    const eligibility = await loadNightLightEligibility(env);
    return {
      ok: true,
      kind: "eligibility",
      eligibility,
      answer: nightLightEligibilityAnswer(eligibility),
    };
  }

  const processedResolution =
    !hints?.projectId && !hints?.mapProjectId
      ? await resolveProcessedNightLightProject(env, question)
      : null;
  const resolution = processedResolution || await resolveSatelliteProject(env, question, hints);
  if (resolution.status === "ambiguous") {
    return {
      ok: false,
      kind: "choose",
      candidates: resolution.candidates,
      reason: "Several projects fit that description. Which project should I use for the VIIRS before-and-after analysis?",
    };
  }
  if (resolution.status === "none") {
    return {
      ok: false,
      kind: "none",
      reason: "I can't tell which project you mean. Name the project or community, or open its pin on the Project Map.",
    };
  }

  const project = resolution.project;
  const impact = await loadNightLightImpact(env, project.id);
  if (!impact) {
    const latestReport = await env.DB.prepare(
      `SELECT
        json_extract(report_json,'$.componentValues.completionDateYear') AS completionYear,
        json_extract(report_json,'$.componentValues.completionDateMonth') AS completionMonth,
        verified_at AS verifiedAt
       FROM assignments
       WHERE project_id=? AND report_json IS NOT NULL
       ORDER BY COALESCE(verified_at,approved_at,submitted_at,updated_at) DESC
       LIMIT 1`,
    ).bind(project.id).first();

    const hasCompletionDate = Boolean(
      project.commissionedAt ||
      (latestReport?.completionYear && latestReport?.completionMonth),
    );
    return {
      ok: false,
      kind: "not_ready",
      project,
      reason: hasCompletionDate
        ? `The project has a recorded completion date, but its NASA VIIRS Black Marble analysis has not been processed yet. The scheduled VIIRS ingestion job needs to run before I can make a measured before-and-after comparison.`
        : `I can't calculate a defensible before-and-after night-time light impact for ${project.name} yet because no reliable completion/commissioning month is recorded. Veritas will not invent the comparison date.`,
    };
  }

  return { ok: true, resolvedVia: resolution.via, project, impact };
}

function fmt(value, digits = 2) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "not available";
}

function classLabel(value) {
  if (value === "strong_increase") return "Strong increase";
  if (value === "moderate_increase") return "Moderate increase";
  if (value === "decrease") return "Decrease";
  if (value === "no_clear_change") return "No clear change";
  return "Inconclusive";
}

export function nightLightImpactAnswer(result) {
  if (!result?.ok) return result?.reason || "Night-time light impact analysis is unavailable.";

  const { project, impact } = result;
  const coreRadiusMetres =
    typeof impact.coreRadiusMetres === "number" && Number.isFinite(impact.coreRadiusMetres)
      ? impact.coreRadiusMetres
      : 1000;
  const pct = typeof impact.percentChange === "number" ? `${impact.percentChange >= 0 ? "+" : ""}${impact.percentChange.toFixed(1)}%` : "not available";
  const control = typeof impact.controlPercentChange === "number"
    ? `${impact.controlPercentChange >= 0 ? "+" : ""}${impact.controlPercentChange.toFixed(1)}%`
    : "not available";

  return [
    `**${project.name}: ${classLabel(impact.impactClass)} in night-time light**`,
    "",
    `NASA VIIRS Black Marble was analysed using a ${coreRadiusMetres.toLocaleString()} m project core plus the wider ${impact.radiusMetres.toLocaleString()} m context area. The core 90th-percentile radiance changed from ${fmt(impact.coreP90BaselineRadiance, 4)} to ${fmt(impact.coreP90AfterRadiance, 4)} nW/cm²/sr${typeof impact.coreP90PercentChange === "number" ? ` (${impact.coreP90PercentChange >= 0 ? "+" : ""}${impact.coreP90PercentChange.toFixed(1)}%)` : ""}.`,
    `The 2 km median changed from ${fmt(impact.baselineRadiance, 4)} to ${fmt(impact.afterRadiance, 4)} nW/cm²/sr (${pct}); the comparison area changed by ${control}. Veritas used ${impact.monthsBefore} valid pre-project months and ${impact.monthsAfter} valid post-project months; data quality is ${impact.dataQuality}.`,
    impact.detectionReason ? `Detection basis: ${impact.detectionReason}` : "",
    "",
    `Commissioning/completion reference: ${impact.commissioningDate} (${impact.dateBasis}). Source: ${impact.sourceName} ${impact.sourceProduct}.`,
    "",
    "Interpretation: this is supporting evidence of a change in nighttime illumination, not proof that the project alone caused the change. Nearby development, other electricity infrastructure, outages and temporary lighting can also affect VIIRS radiance.",
  ].join("\n");
}

export function nightLightCardPayload(result) {
  if (!result?.ok) return null;
  return {
    project: {
      id: result.project.id,
      name: result.project.name,
      programme: result.project.programme || "",
      component: result.project.component || "",
      state: result.project.state || "",
      lga: result.project.lga || "",
      community: result.project.community || "",
    },
    resolvedVia: result.resolvedVia || "name",
    impact: result.impact,
  };
}

export { NIGHTLIGHT_QUERY };
