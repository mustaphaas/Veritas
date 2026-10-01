import { handleSatelliteVerify } from "./satellite-verify.js";

const SATELLITE_QUERY = /\b(satellite|imagery|image|aerial|earth observation|remote sensing|geospatial verification|verify .*location|visible infrastructure|rooftops?)\b/i;

export function isSatelliteAnalysisQuestion(question) {
  return SATELLITE_QUERY.test(String(question || ""));
}

const SEARCH_STOPWORDS = new Set((
  "check verify verification analyse analyze analysis using with from the satellite imagery image images aerial " +
  "project projects location coordinates coordinate at whether appears appear look show me select selected a an " +
  "please can could you for of on in is are this that it its and houses house rooftops rooftop around near nearby " +
  "surrounding count infrastructure visible there any do does run tell about what how many"
).split(" "));

const MAX_CHOICES = 6;

// Generic project-type and analysis words describe what is being analysed;
// they must never identify a particular project on their own.
const PROJECT_TYPE_WORDS = new Set(
  "mini grid solar street light lights home system systems standalone stand alone extension water pumping pump".split(" "),
);
const ANALYSIS_WORDS = new Set(
  "impact measurable electrification viirs black marble night nighttime lighting radiance increase change before after commissioning completion completed operational energisation energization".split(" "),
);

function projectIdentityTokens(question) {
  return extractSearchTokens(question).filter(
    (token) => !PROJECT_TYPE_WORDS.has(token) && !ANALYSIS_WORDS.has(token),
  );
}

// Portfolio-level questions ("how many mini grids are on the map") name a
// satellite surface but ask about the whole portfolio, not one site's imagery.
// They belong to the D1 analytics path.
const AGGREGATE_QUERY = /\b(how many|number of|count|counts|total|totals|percentage|proportion|share of|breakdown|break down|by state|by component|by programme|by program|per state|which projects|list (?:all|the|of)|all projects|every project)\b/i;

export function isPortfolioAggregateQuestion(question) {
  return AGGREGATE_QUERY.test(String(question || ""));
}

function words(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

export function extractSearchTokens(question) {
  return [...new Set(words(question).filter((word) => word.length >= 3 && !SEARCH_STOPWORDS.has(word)))];
}

// Score every candidate against the question's tokens. Name and id hits weigh
// most; component/programme/state hits only break ties. Pure, so it is testable
// without a database.
export function rankProjects(rows, tokens) {
  return rows
    .map((row) => {
      const fields = [
        [3, words(row.name)],
        [3, words(row.id)],
        [2, words(row.community)],
        [2, words(row.lga)],
        [1, words(`${row.component || ""} ${row.programme || ""} ${row.state || ""}`)],
      ];
      let score = 0;
      let matched = 0;
      let strong = 0;
      for (const token of tokens) {
        const weight = fields.reduce(
          (best, [w, list]) => (list.some((word) => word.startsWith(token)) ? Math.max(best, w) : best),
          0,
        );
        if (weight) {
          score += weight;
          matched += 1;
          if (weight >= 2) strong += 1;
        }
      }
      return { row, score, matched, strong };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.row.name).localeCompare(String(b.row.name)));
}

const PROJECT_COLUMNS = `id,name,programme,component,state,lga,community,installed_capacity_kw AS installedCapacityKw,
  households,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres`;

async function loadMappableProjects(env) {
  const all = await env.DB.prepare(
    `SELECT ${PROJECT_COLUMNS} FROM projects
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY name LIMIT 2000`,
  ).all();
  return all?.results || [];
}

function choiceOf(row) {
  return {
    id: row.id,
    name: row.name,
    state: row.state || "",
    lga: row.lga || "",
    community: row.community || "",
    component: row.component || "",
  };
}

// Resolution order, most to least certain:
//   1. projectId from the picker (or any explicit client hint)
//   2. a project id written in the message
//   3. name/community/LGA match: one clear winner resolves, a tie or weak
//      match returns candidates instead of guessing
//   4. the project open on the Project Map, when the message names nothing
// It never falls back to an arbitrary project: verifying the wrong site and
// presenting the verdict as evidence is worse than asking once.
export async function resolveSatelliteProject(env, question, hints = {}) {
  const byId = async (id) =>
    env.DB.prepare(
      `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id=? AND latitude IS NOT NULL AND longitude IS NOT NULL`,
    ).bind(id).first();

  const hinted = typeof hints.projectId === "string" ? hints.projectId.trim().slice(0, 120) : "";
  if (hinted) {
    const project = await byId(hinted);
    if (project) return { status: "resolved", project, via: "selection" };
  }

  const rows = await loadMappableProjects(env);

  const lowered = String(question || "").toLowerCase();
  const idMatches = rows.filter((row) => row.id && String(row.id).length >= 4 && lowered.includes(String(row.id).toLowerCase()));
  if (idMatches.length === 1) return { status: "resolved", project: idMatches[0], via: "id" };
  if (idMatches.length > 1) return { status: "ambiguous", candidates: idMatches.slice(0, MAX_CHOICES).map(choiceOf) };

  const tokens = extractSearchTokens(question);
  const identityTokens = projectIdentityTokens(question);
  const mapId = typeof hints.mapProjectId === "string" ? hints.mapProjectId.trim().slice(0, 120) : "";
  const fromMap = async () => {
    if (!mapId) return null;
    const project = rows.find((row) => row.id === mapId) || (await byId(mapId));
    return project ? { status: "resolved", project, via: "map" } : null;
  };

  if (!identityTokens.length) return (await fromMap()) || { status: "none", tokens };

  // Resolve only from distinctive identity words (name/community/LGA/id-like
  // wording). Component words such as "mini grid" may describe many projects
  // and cannot be used to manufacture a candidate list when the named place
  // or project does not exist.
  const ranked = rankProjects(rows, identityTokens);
  if (!ranked.length) return (await fromMap()) || { status: "none", tokens };

  const [top, second] = ranked;
  const coverage = top.matched / identityTokens.length;
  if (coverage >= 0.5 && (!second || top.score > second.score)) {
    return { status: "resolved", project: top.row, via: "name" };
  }
  // A genuine tie means only the tied projects are real contenders; a weak
  // unique match means nothing fits well, so show the nearest few.
  const tied = ranked.filter((entry) => entry.score === top.score);
  const pool = tied.length > 1 ? tied : ranked;
  return {
    status: "ambiguous",
    tokens,
    candidates: pool.slice(0, MAX_CHOICES).map((entry) => choiceOf(entry.row)),
  };
}

function parseResponse(response) {
  return response.json().catch(() => ({}));
}

// Decides whether a message should run a per-project satellite check.
//   - a picker choice always does (the person already chose the project)
//   - a non-satellite message never does
//   - a satellite message about the portfolio does only if it singles out one
//     project by ID, or by a distinctive name/community/LGA word that matches
//     exactly one project; otherwise it goes to analytics rather than being
//     answered with an unrelated site's imagery
export async function shouldRunSatelliteAnalysis(env, question, hints = {}) {
  if (typeof hints.projectId === "string" && hints.projectId.trim()) return true;
  if (!isSatelliteAnalysisQuestion(question)) return false;
  if (!isPortfolioAggregateQuestion(question)) return true;
  try {
    const rows = await loadMappableProjects(env);
    const lowered = String(question).toLowerCase();
    if (rows.some((row) => row.id && String(row.id).length >= 4 && lowered.includes(String(row.id).toLowerCase()))) {
      return true;
    }
    const tokens = extractSearchTokens(question).filter((token) => !PROJECT_TYPE_WORDS.has(token));
    if (!tokens.length) return false;
    const ranked = rankProjects(rows, tokens).filter((entry) => entry.strong > 0);
    if (!ranked.length) return false;
    const [top, second] = ranked;
    return top.matched / tokens.length >= 0.5 && (!second || top.score > second.score);
  } catch {
    return false;
  }
}

export async function runSatelliteAnalysis(request, env, question, hints = {}) {
  if (!env.DB) throw new Error("D1 database binding is unavailable.");
  if (!env.GEMINI_API_KEY) return { ok: false, reason: "Satellite vision is not configured." };

  const resolution = await resolveSatelliteProject(env, question, hints);
  if (resolution.status === "ambiguous") {
    return {
      ok: false,
      kind: "choose",
      candidates: resolution.candidates,
      reason: "Several projects fit that description, and a satellite verdict attached to the wrong site would mislead. Which one should I check?",
    };
  }
  if (resolution.status === "none") {
    return {
      ok: false,
      kind: "none",
      reason: "I can't tell which project you mean. Name it by title or community, or open its pin on the Project Map, and I'll run the check.",
    };
  }
  const project = resolution.project;

  // Cache-first by default: Ask Veritas reads the stored result and only
  // performs a new Esri + Gemini check when the user explicitly asks to
  // refresh/re-check, or when no cached result exists yet.
  const explicitRefresh = /\b(re-?check|refresh|run again|fresh check|new check|update the satellite)\b/i.test(
    String(question || ""),
  );
  const makeRequest = (method) =>
    new Request(
      new URL(`/api/projects/${encodeURIComponent(project.id)}/satellite-verify`, request.url),
      {
        method,
        headers: { Authorization: request.headers.get("Authorization") || "" },
      },
    );

  let analysisResponse = await handleSatelliteVerify(makeRequest(explicitRefresh ? "POST" : "GET"), env);
  if (!analysisResponse) return { ok: false, reason: "Satellite analysis route was unavailable." };
  let payload = await parseResponse(analysisResponse);

  if (!explicitRefresh && analysisResponse.status === 404 && payload?.code === "no_cached_satellite_result") {
    analysisResponse = await handleSatelliteVerify(makeRequest("POST"), env);
    if (!analysisResponse) return { ok: false, reason: "Satellite analysis route was unavailable." };
    payload = await parseResponse(analysisResponse);
  }

  if (!analysisResponse.ok) return { ok: false, reason: payload?.error || "Satellite analysis could not be completed." };

  return {
    ok: true,
    resolvedVia: resolution.via,
    project: {
      id: project.id,
      name: project.name,
      programme: project.programme,
      component: project.component,
      state: project.state,
      lga: project.lga,
      community: project.community,
      latitude: Number(project.latitude),
      longitude: Number(project.longitude),
      installedCapacityKw: Number(project.installedCapacityKw || 0),
      households: Number(project.households || 0),
    },
    analysis: payload,
  };
}

export function satelliteAnalysisAnswer(result) {
  if (!result?.ok) return result?.reason || "Satellite analysis is unavailable.";

  const project = result.project;
  const analysis = result.analysis || {};
  const verdict = analysis.verdict || {};
  const component = project.component || "reported component";
  const limitation = verdict.limitation?.message || "";
  const notes = String(verdict.notes || "").trim();
  const confidence = typeof verdict.confidence === "number" ? `${Math.round(verdict.confidence * 100)}%` : "";

  const status = verdict.limitation?.code === "distributed_systems"
    ? "Not verifiable from imagery"
    : verdict.status === "present"
      ? "Infrastructure detected"
      : verdict.status === "absent"
        ? "No qualifying infrastructure detected"
        : "Inconclusive";

  // Lead with the finding and the reasoning behind it, the way an analyst
  // would brief it, then the basis and the limits of the evidence.
  let finding;
  if (verdict.limitation?.code === "distributed_systems") {
    finding = `${limitation}${notes ? ` What the frame does show: ${notes}` : ""}`;
  } else if (verdict.status === "present") {
    finding = `The imagery supports the reported ${component} at the stored project point${confidence ? `, at ${confidence} confidence` : ""}. ${notes}`;
  } else if (verdict.status === "absent") {
    finding = `The imagery does not show the reported ${component} at the stored project point${confidence ? `, at ${confidence} confidence` : ""}. ${notes} Absence in an archived image is not proof of absence on the ground, so read it against the imagery date and the project's completion date.`;
  } else if (verdict.imageQuality === "unusable") {
    finding = `The frame is too degraded to read, so the ${component} can be neither confirmed nor ruled out. ${notes}`;
  } else {
    finding = `The imagery does not settle whether the reported ${component} is present. ${limitation} ${notes}`;
  }

  const rooftops = typeof verdict.estimatedNearbyHouses === "number"
    ? `The frame holds about ${verdict.estimatedNearbyHouses} rooftops (all buildings, not households served). ${verdict.houseEstimateNote || ""}`
    : verdict.houseEstimateNote || "";

  const basis = [
    analysis.imagerySource || "Esri World Imagery",
    typeof analysis.radiusMetres === "number" ? `${analysis.radiusMetres} m radius` : null,
    analysis.imageryDate ? `imagery dated ${analysis.imageryDate}` : "imagery date not supplied",
    `image quality ${verdict.imageQuality || "unknown"}`,
    analysis.analysisMethod ? `${analysis.analysisMethod}${analysis.analysisVersion ? ` v${analysis.analysisVersion}` : ""}` : null,
  ].filter(Boolean).join(", ");

  return [
    `**${project.name}: ${status}**`,
    "",
    finding.replace(/\s+/g, " ").trim(),
    rooftops ? `\n${rooftops.replace(/\s+/g, " ").trim()}` : "",
    "",
    `Basis: ${basis}.`,
    "",
    "This is visual evidence only. It cannot establish installed capacity, equipment specifications, ownership or operational status, and nothing beyond the claimed component's signature was assessed, so anything not mentioned here has not been checked.",
  ].filter((line, index, all) => line !== "" || (all[index - 1] !== "" && index !== all.length - 1)).join("\n");
}

// Structured payload for the chat's verdict card. The markdown answer stays
// alongside it as the plain-text fallback and as conversation history.
export function satelliteCardPayload(result) {
  const analysis = result.analysis || {};
  const verdict = analysis.verdict || {};
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
    verdict: {
      status: verdict.status || "inconclusive",
      imageQuality: verdict.imageQuality || "unknown",
      confidence: typeof verdict.confidence === "number" ? verdict.confidence : null,
      estimatedNearbyHouses: typeof verdict.estimatedNearbyHouses === "number" ? verdict.estimatedNearbyHouses : null,
      notes: verdict.notes || "",
      evidenceClass: verdict.evidenceClass || undefined,
      evidenceLocation: verdict.evidenceLocation ?? null,
      limitation: verdict.limitation || null,
      houseEstimateNote: verdict.houseEstimateNote || null,
    },
    imageUrl: analysis.imageUrl || null,
    checkedAt: analysis.checkedAt || null,
    imagerySource: analysis.imagerySource || "Esri World Imagery",
    imageryDate: analysis.imageryDate || null,
    radiusMetres: typeof analysis.radiusMetres === "number" ? analysis.radiusMetres : null,
    analysisMethod: analysis.analysisMethod || null,
  };
}

export { SATELLITE_QUERY };
