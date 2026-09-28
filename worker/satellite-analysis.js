import { handleSatelliteVerify } from "./satellite-verify.js";

const SATELLITE_QUERY = /\b(satellite|imagery|image|aerial|earth observation|remote sensing|geospatial verification|verify .*location|visible infrastructure)\b/i;

export function isSatelliteAnalysisQuestion(question) {
  const text = String(question || "");
  if (SATELLITE_QUERY.test(text)) return true;
  // Imperative "verify/check <project>" requests, without hijacking questions
  // such as "how do I verify a project?".
  return /^\s*(?:please\s+)?(?:can you\s+|could you\s+)?(?:verify|check)\b/i.test(text)
    && /\b(project|site|installation|mini-?grid|street ?lights?)\b/i.test(text);
}

const STOP_WORDS = /\b(check|verify|analyse|analyze|analysis|using|with|from|the|satellite|imagery|image|images|aerial|project|projects|location|coordinates?|at|whether|appears?|to|be|look|show|me|select|a|an|for|of|on|in|it|is|are|there|does|do|this|that|please|can|could|you|any|visible|infrastructure|installed|exists?|exist|really|actually)\b/gi;

function cleanSearchText(question) {
  return String(question || "")
    .replace(STOP_WORDS, " ")
    .replace(/[^a-zA-Z0-9\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PROJECT_COLUMNS = `id,name,programme,component,state,lga,community,installed_capacity_kw AS installedCapacityKw,
        households,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres`;

// Never guess: analysing an unrelated project and presenting it as the answer is
// worse than asking which project was meant.
async function findProject(env, question) {
  const q = String(question || "");
  const explicit = q.match(/(?:project)\s+["']?([^"'?.]+)["']?/i)?.[1]?.trim() || "";
  const search = cleanSearchText(explicit) || cleanSearchText(q);
  if (search.length < 3) {
    return { reason: "Tell me which project to check, for example: \"Verify the satellite image for <project name>\"." };
  }

  const whole = await env.DB.prepare(
    `SELECT ${PROJECT_COLUMNS} FROM projects
     WHERE (lower(name) LIKE lower(?) OR lower(id) LIKE lower(?))
       AND latitude IS NOT NULL AND longitude IS NOT NULL
     ORDER BY name LIMIT 1`,
  ).bind(`%${search}%`, `%${search}%`).first();
  if (whole) return { project: whole };

  const tokens = search.split(" ").filter((token) => token.length >= 3).slice(0, 6);
  if (tokens.length) {
    const clauses = tokens.map(() => "(lower(name) LIKE ? OR lower(id) LIKE ? OR lower(community) LIKE ? OR lower(lga) LIKE ?)").join(" AND ");
    const binds = tokens.flatMap((token) => Array(4).fill(`%${token.toLowerCase()}%`));
    const byTokens = await env.DB.prepare(
      `SELECT ${PROJECT_COLUMNS} FROM projects
       WHERE ${clauses} AND latitude IS NOT NULL AND longitude IS NOT NULL
       ORDER BY name LIMIT 1`,
    ).bind(...binds).first();
    if (byTokens) return { project: byTokens };
  }

  return { reason: `I couldn't find a project matching "${search}" that has GPS coordinates. Check the name against the Project Map and try again.` };
}

function parseResponse(response) {
  return response.json().catch(() => ({}));
}

export async function runSatelliteAnalysis(request, env, question) {
  if (!env.DB) throw new Error("D1 database binding is unavailable.");
  if (!env.GEMINI_API_KEY) return { ok: false, reason: "Satellite vision is not configured." };

  const found = await findProject(env, question);
  if (!found.project) return { ok: false, reason: found.reason };
  const project = found.project;

  // Reuse the same authenticated, point-centred satellite pipeline used by
  // Project Map. This guarantees Ask Veritas and the map analyse the same image.
  const analysisRequest = new Request(
    new URL(`/api/projects/${encodeURIComponent(project.id)}/satellite-verify`, request.url),
    {
      method: "POST",
      headers: { Authorization: request.headers.get("Authorization") || "" },
    },
  );
  const analysisResponse = await handleSatelliteVerify(analysisRequest, env);
  if (!analysisResponse) return { ok: false, reason: "Satellite analysis route was unavailable." };
  const payload = await parseResponse(analysisResponse);
  if (!analysisResponse.ok) return { ok: false, reason: payload?.error || "Satellite analysis could not be completed." };

  return {
    ok: true,
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
  const status = verdict.status === "present"
    ? "Infrastructure detected"
    : verdict.status === "absent"
      ? "No qualifying infrastructure detected"
      : "Inconclusive";

  const quality = verdict.imageQuality || "unknown";
  const confidence = typeof verdict.confidence === "number" ? `${Math.round(verdict.confidence * 100)}%` : "not available";
  const houses = typeof verdict.estimatedNearbyHouses === "number" ? String(verdict.estimatedNearbyHouses) : "not estimated";

  return [
    `Satellite analysis was run for **${project.name}** at its stored project point.`,
    "",
    `- **Reported component:** ${project.programme || "—"} / ${project.component || "—"}`,
    `- **Imagery source:** ${analysis.imagerySource || "Esri World Imagery"}`,
    `- **Imagery date:** ${analysis.imageryDate || "Not supplied by the imagery export"}`,
    `- **Analysis radius:** ${typeof analysis.radiusMetres === "number" ? `${analysis.radiusMetres}m` : "not recorded"}`,
    `- **Analysis method:** ${analysis.analysisMethod || "not recorded"}${analysis.analysisVersion ? ` (v${analysis.analysisVersion})` : ""}`,
    `- **Image quality:** ${quality}`,
    `- **Satellite interpretation:** **${status}**`,
    `- **AI confidence:** ${confidence}`,
    `- **Nearby rooftops estimated in image:** ${houses}`,
    verdict.notes ? `- **What is visible:** ${verdict.notes}` : "",
    "",
    "**Verification limitation:** this is visual evidence from the archived imagery returned by the imagery provider. It does not by itself establish installed capacity, equipment specifications, ownership, or operational status.",
  ].filter(Boolean).join("\n");
}

export { SATELLITE_QUERY };
