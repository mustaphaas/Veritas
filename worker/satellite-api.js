const encoder = new TextEncoder();
const ESRI_CURRENT_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const WAYBACK_CONFIG_URL = "https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json";
const ANALYSIS_ZOOM = 18;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const hex = (bytes) => [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function digest(value) { return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value))); }
function now() { return new Date().toISOString(); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function parseJson(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }

async function currentUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !env.DB) return null;
  const tokenHash = await digest(bearer);
  return env.DB.prepare(`SELECT u.id,u.name,u.role,u.consultant_firm AS consultantFirm
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`)
    .bind(tokenHash, now()).first();
}

function validProjectCoordinate(project) {
  const latitude = Number(project?.latitude), longitude = Number(project?.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

async function loadProject(env, projectId) {
  return env.DB.prepare(`SELECT id,name,programme,component,contractor,consultant_firm AS consultantFirm,state,lga,community,
      latitude,longitude,verified,portfolio_status AS status,updated_at AS updatedAt
    FROM projects WHERE id=?`).bind(projectId).first();
}

function canReadProject(user, project) {
  if (!user || !project) return false;
  if (String(user.role || "").startsWith("rea_")) return true;
  return user.role === "consultant_admin" && user.consultantFirm && user.consultantFirm === project.consultantFirm;
}
function canRunAnalysis(user) { return Boolean(user && String(user.role || "").startsWith("rea_")); }
function fieldOfficerDenied(user) { return user?.role === "field_officer"; }

function tileXY(latitude, longitude, zoom) {
  const n = 2 ** zoom;
  const lat = clamp(latitude, -85.05112878, 85.05112878);
  const x = Math.floor(((longitude + 180) / 360) * n);
  const latRad = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n);
  return { x: clamp(x, 0, n - 1), y: clamp(y, 0, n - 1), z: zoom };
}

function neighborhood(latitude, longitude, zoom = ANALYSIS_ZOOM) {
  const centre = tileXY(latitude, longitude, zoom), tiles = [];
  const max = (2 ** zoom) - 1;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      tiles.push({ z: zoom, x: clamp(centre.x + dx, 0, max), y: clamp(centre.y + dy, 0, max) });
    }
  }
  return tiles;
}

function applyTileTemplate(template, tile) {
  if (template.includes("{z}") || template.includes("{x}") || template.includes("{y}")) {
    return template.replaceAll("{z}", String(tile.z)).replaceAll("{x}", String(tile.x)).replaceAll("{y}", String(tile.y));
  }
  return `${template.replace(/\/$/, "")}/tile/${tile.z}/${tile.y}/${tile.x}`;
}

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function fetchTileSet(template, latitude, longitude) {
  const tiles = neighborhood(latitude, longitude);
  const images = [];
  for (const tile of tiles) {
    const url = applyTileTemplate(template, tile);
    const response = await fetch(url, { headers: { "User-Agent": "Veritas Satellite Intelligence" } });
    if (!response.ok) continue;
    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) continue;
    const mimeType = response.headers.get("content-type")?.split(";")[0] || "image/jpeg";
    images.push({ ...tile, url, mimeType, data: bytesToBase64(buffer) });
  }
  if (!images.length) throw new Error("Satellite imagery provider returned no readable tiles.");
  return images;
}

function extractReleaseDate(item) {
  const value = String(item?.releaseDateLabel || item?.itemTitle || "");
  const iso = value.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  const words = Date.parse(value);
  return Number.isFinite(words) ? new Date(words).toISOString().slice(0, 10) : null;
}

async function loadWaybackReleases() {
  const response = await fetch(WAYBACK_CONFIG_URL);
  if (!response.ok) throw new Error("Historical imagery catalogue is unavailable.");
  const config = await response.json();
  return Object.entries(config || {}).map(([releaseNumber, item]) => ({
    ...item,
    releaseNumber: Number(releaseNumber),
    releaseDate: extractReleaseDate(item),
  })).filter((item) => Number.isFinite(item.releaseNumber) && item.itemURL && item.metadataLayerUrl && item.releaseDate)
    .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)));
}

async function waybackMetadata(release, latitude, longitude, zoom = ANALYSIS_ZOOM) {
  const layerId = Math.max(0, Math.min(13, 23 - zoom));
  const params = new URLSearchParams({
    f: "json", where: "1=1", outFields: "SRC_DATE2,NICE_DESC,SRC_DESC,SAMP_RES,SRC_ACC",
    geometry: JSON.stringify({ spatialReference: { wkid: 4326 }, x: longitude, y: latitude }),
    returnGeometry: "false", geometryType: "esriGeometryPoint", spatialRel: "esriSpatialRelIntersects",
  });
  const response = await fetch(`${release.metadataLayerUrl.replace(/\/$/, "")}/${layerId}/query?${params}`);
  if (!response.ok) return null;
  const payload = await response.json();
  const attrs = payload?.features?.[0]?.attributes;
  if (!attrs) return null;
  const sourceDate = attrs.SRC_DATE2;
  let captureDate = null;
  if (typeof sourceDate === "number" && Number.isFinite(sourceDate)) captureDate = new Date(sourceDate).toISOString().slice(0, 10);
  else if (sourceDate) {
    const parsed = Date.parse(String(sourceDate));
    if (Number.isFinite(parsed)) captureDate = new Date(parsed).toISOString().slice(0, 10);
  }
  return { captureDate, provider: attrs.NICE_DESC || "Esri Wayback", source: attrs.SRC_DESC || null, resolution: attrs.SAMP_RES ?? null, accuracy: attrs.SRC_ACC ?? null };
}

function chooseHistoricalPair(releases) {
  if (!releases.length) return null;
  const latest = releases[0];
  const latestMs = Date.parse(latest.releaseDate);
  const baseline = releases.find((release) => latestMs - Date.parse(release.releaseDate) >= 180 * 86400000) || releases[releases.length - 1];
  if (!baseline || baseline.releaseNumber === latest.releaseNumber) return null;
  return { baseline, comparison: latest };
}

function normalizeFinding(raw, analysisType, quality) {
  const level = ["high", "medium", "low", "inconclusive"].includes(raw?.confidenceLevel) ? raw.confidenceLevel : "inconclusive";
  const score = Number.isFinite(Number(raw?.confidenceScore)) ? clamp(Number(raw.confidenceScore), 0, 100) : 0;
  const limitations = Array.isArray(raw?.limitations) ? raw.limitations.map(String).slice(0, 8) : [];
  const reviewRequired = Boolean(raw?.reviewRequired) || level === "low" || level === "inconclusive" || !quality.captureDateKnown;
  return {
    summary: String(raw?.summary || "Satellite imagery was analysed, but no reliable summary was returned."),
    observations: Array.isArray(raw?.observations) ? raw.observations.map(String).slice(0, 12) : [],
    visibleInfrastructure: Array.isArray(raw?.visibleInfrastructure) ? raw.visibleInfrastructure.map(String).slice(0, 12) : [],
    changeCategories: analysisType === "historical_compare" && Array.isArray(raw?.changeCategories) ? raw.changeCategories.map(String).slice(0, 10) : [],
    confidenceLevel: level,
    confidenceScore: score,
    limitations,
    reviewRequired,
  };
}

function visionPrompt(project, analysisType, provenance) {
  return `You are Veritas Satellite Intelligence for Nigeria's Rural Electrification Agency. Analyse only what is visually supportable in the supplied satellite imagery. Project: ${project.name}; programme: ${project.programme}; component: ${project.component}; location: ${project.community || project.lga || project.state}. The coordinate is authoritative from the Veritas D1 project record. Analysis type: ${analysisType}. Imagery provenance: ${JSON.stringify(provenance)}. Never conclude fraud, abandonment, non-existence, completion, compliance, or verification from satellite imagery alone. Distinguish no clear visible change from no project. Return JSON only with keys summary (string), observations (string[]), visibleInfrastructure (string[]), changeCategories (string[]), confidenceLevel (high|medium|low|inconclusive), confidenceScore (0-100), limitations (string[]), reviewRequired (boolean).`;
}

async function analyseWithGemini(env, prompt, imageGroups) {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL || "gemini-3.6-flash";
  const parts = [{ text: prompt }];
  for (const group of imageGroups) {
    parts.push({ text: group.label });
    for (const image of group.images) parts.push({ inlineData: { mimeType: image.mimeType, data: image.data } });
  }
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
  });
  if (!response.ok) throw new Error(`Gemini vision failed (${response.status}).`);
  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini vision returned an empty response.");
  return { raw: JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/, "").trim()), provider: "Gemini", model };
}

async function analyseWithOpenRouter(env, prompt, imageGroups) {
  if (!env.OPENROUTER_API_KEY) return null;
  const model = env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
  const content = [{ type: "text", text: prompt }];
  for (const group of imageGroups) {
    content.push({ type: "text", text: group.label });
    for (const image of group.images) content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
  }
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST", headers: { "Authorization": `Bearer ${env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "user", content }] }),
  });
  if (!response.ok) throw new Error(`OpenRouter vision failed (${response.status}).`);
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter vision returned an empty response.");
  return { raw: JSON.parse(String(text).replace(/^```json\s*/i, "").replace(/```$/, "").trim()), provider: "OpenRouter", model };
}

async function runVision(env, prompt, imageGroups) {
  const errors = [];
  try { const result = await analyseWithGemini(env, prompt, imageGroups); if (result) return result; } catch (error) { errors.push(error?.message || String(error)); }
  try { const result = await analyseWithOpenRouter(env, prompt, imageGroups); if (result) return result; } catch (error) { errors.push(error?.message || String(error)); }
  throw new Error(errors.join(" ") || "No multimodal AI provider is configured.");
}

async function audit(env, request, user, action, details) {
  await env.DB.prepare("INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at) VALUES(?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), null, user.id, action, JSON.stringify(details), request.headers.get("CF-Connecting-IP"), now()).run();
}

function recordJson(row) {
  if (!row) return null;
  return {
    id: row.id, projectId: row.projectId, projectName: row.projectName, analysisType: row.analysisType, provider: row.provider,
    latitudeUsed: Number(row.latitudeUsed), longitudeUsed: Number(row.longitudeUsed),
    baselineImageDate: row.baselineImageDate || null, comparisonImageDate: row.comparisonImageDate || null,
    baselineReleaseDate: row.baselineReleaseDate || null, comparisonReleaseDate: row.comparisonReleaseDate || null,
    baselineSourceRef: row.baselineSourceRef || null, comparisonSourceRef: row.comparisonSourceRef || null,
    quality: parseJson(row.qualityJson, {}), observations: parseJson(row.observationsJson, {}), change: parseJson(row.changeJson, {}),
    confidenceScore: Number(row.confidenceScore || 0), confidenceLevel: row.confidenceLevel || "inconclusive",
    reviewRequired: Number(row.reviewRequired) === 1, reviewStatus: row.reviewStatus, reviewNote: row.reviewNote || "",
    reviewedAt: row.reviewedAt || null, modelProvider: row.modelProvider || null, modelName: row.modelName || null, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

const RECORD_SELECT = `SELECT s.id,s.project_id AS projectId,p.name AS projectName,s.analysis_type AS analysisType,s.provider,
  s.latitude_used AS latitudeUsed,s.longitude_used AS longitudeUsed,s.baseline_image_date AS baselineImageDate,s.comparison_image_date AS comparisonImageDate,
  s.baseline_release_date AS baselineReleaseDate,s.comparison_release_date AS comparisonReleaseDate,s.baseline_source_ref AS baselineSourceRef,
  s.comparison_source_ref AS comparisonSourceRef,s.quality_json AS qualityJson,s.observations_json AS observationsJson,s.change_json AS changeJson,
  s.confidence_score AS confidenceScore,s.confidence_level AS confidenceLevel,s.review_required AS reviewRequired,s.review_status AS reviewStatus,
  s.review_note AS reviewNote,s.reviewed_at AS reviewedAt,s.model_provider AS modelProvider,s.model_name AS modelName,s.created_at AS createdAt,s.updated_at AS updatedAt,
  p.consultant_firm AS consultantFirm FROM satellite_analysis_runs s JOIN projects p ON p.id=s.project_id`;

async function listProjectAnalyses(request, env, user, project) {
  if (!canReadProject(user, project)) return json({ error: "Project is outside your permitted scope." }, 403);
  const result = await env.DB.prepare(`${RECORD_SELECT} WHERE s.project_id=? ORDER BY s.created_at DESC LIMIT 50`).bind(project.id).all();
  return json({ project: { id: project.id, name: project.name, latitude: Number(project.latitude), longitude: Number(project.longitude) }, analyses: (result.results || []).map(recordJson) });
}

async function createAnalysis(request, env, user, project, analysisType) {
  if (!canRunAnalysis(user) || fieldOfficerDenied(user)) return json({ error: "REA access is required to run satellite analysis." }, 403);
  if (!validProjectCoordinate(project)) return json({ error: "This project does not have valid authoritative GPS coordinates." }, 422);
  const latitude = Number(project.latitude), longitude = Number(project.longitude);
  let baseline = null, comparison = null, baselineMetadata = null, comparisonMetadata = null;
  let imageGroups = [], provider = "Esri World Imagery";
  try {
    if (analysisType === "historical_compare") {
      const releases = await loadWaybackReleases();
      const pair = chooseHistoricalPair(releases);
      if (!pair) return json({ error: "Historical imagery unavailable: no sufficiently separated Wayback releases were found for comparison." }, 422);
      baseline = pair.baseline; comparison = pair.comparison; provider = "Esri World Imagery Wayback";
      [baselineMetadata, comparisonMetadata] = await Promise.all([
        waybackMetadata(baseline, latitude, longitude), waybackMetadata(comparison, latitude, longitude),
      ]);
      const [baselineImages, comparisonImages] = await Promise.all([
        fetchTileSet(baseline.itemURL, latitude, longitude), fetchTileSet(comparison.itemURL, latitude, longitude),
      ]);
      imageGroups = [
        { label: `BASELINE imagery. Wayback release date: ${baseline.releaseDate}; image capture date: ${baselineMetadata?.captureDate || "unknown"}.`, images: baselineImages },
        { label: `COMPARISON imagery. Wayback release date: ${comparison.releaseDate}; image capture date: ${comparisonMetadata?.captureDate || "unknown"}.`, images: comparisonImages },
      ];
    } else {
      comparison = (await loadWaybackReleases().catch(() => []))[0] || null;
      comparisonMetadata = comparison ? await waybackMetadata(comparison, latitude, longitude).catch(() => null) : null;
      const currentImages = await fetchTileSet(ESRI_CURRENT_TILE, latitude, longitude);
      imageGroups = [{ label: `CURRENT Esri World Imagery. Closest available Wayback provenance: release ${comparison?.releaseDate || "unknown"}; capture ${comparisonMetadata?.captureDate || "unknown"}.`, images: currentImages }];
    }

    const quality = {
      captureDateKnown: analysisType === "historical_compare" ? Boolean(baselineMetadata?.captureDate && comparisonMetadata?.captureDate) : Boolean(comparisonMetadata?.captureDate),
      baseline: baselineMetadata, comparison: comparisonMetadata,
      note: "Wayback release date and source-image capture date are distinct provenance fields.",
    };
    const provenance = {
      provider, latitude, longitude,
      baseline: baseline ? { releaseDate: baseline.releaseDate, captureDate: baselineMetadata?.captureDate || null, source: baselineMetadata?.source || null } : null,
      comparison: comparison ? { releaseDate: comparison.releaseDate, captureDate: comparisonMetadata?.captureDate || null, source: comparisonMetadata?.source || null } : { releaseDate: null, captureDate: null },
    };
    const vision = await runVision(env, visionPrompt(project, analysisType, provenance), imageGroups);
    const finding = normalizeFinding(vision.raw, analysisType, quality);
    const timestamp = now(), id = crypto.randomUUID();
    const observations = { summary: finding.summary, observations: finding.observations, visibleInfrastructure: finding.visibleInfrastructure, limitations: finding.limitations };
    const change = { categories: finding.changeCategories, summary: analysisType === "historical_compare" ? finding.summary : null };
    await env.DB.prepare(`INSERT INTO satellite_analysis_runs
      (id,project_id,requested_by_user_id,analysis_type,provider,latitude_used,longitude_used,footprint_json,baseline_image_date,comparison_image_date,
       baseline_release_date,comparison_release_date,baseline_source_ref,comparison_source_ref,quality_json,observations_json,change_json,confidence_score,
       confidence_level,review_required,review_status,model_provider,model_name,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(id, project.id, user.id, analysisType, provider, latitude, longitude, JSON.stringify({ zoom: ANALYSIS_ZOOM, tileNeighborhood: "3x3" }),
        baselineMetadata?.captureDate || null, comparisonMetadata?.captureDate || null, baseline?.releaseDate || null, comparison?.releaseDate || null,
        baseline?.itemURL || null, analysisType === "current" ? ESRI_CURRENT_TILE : comparison?.itemURL || null, JSON.stringify(quality), JSON.stringify(observations), JSON.stringify(change),
        finding.confidenceScore, finding.confidenceLevel, finding.reviewRequired ? 1 : 0, "unreviewed", vision.provider, vision.model, timestamp, timestamp).run();
    await audit(env, request, user, "satellite-analysis-run", { projectId: project.id, analysisId: id, analysisType, provider, latitudeUsed: latitude, longitudeUsed: longitude });
    const row = await env.DB.prepare(`${RECORD_SELECT} WHERE s.id=?`).bind(id).first();
    return json({ analysis: recordJson(row), note: "Satellite findings are supporting evidence only. Manual review is required before any verification decision." }, 201);
  } catch (error) {
    console.error(JSON.stringify({ event: "satellite-analysis-failed", projectId: project.id, analysisType, message: error?.message || String(error) }));
    return json({ error: error?.message || "Satellite analysis failed.", manualReviewRequired: true }, 503);
  }
}

async function reviewAnalysis(request, env, user, analysisId) {
  if (!canRunAnalysis(user)) return json({ error: "REA access is required to review satellite analysis." }, 403);
  const body = await request.json().catch(() => null);
  const status = body?.reviewStatus;
  if (!["accepted", "needs_followup", "dismissed"].includes(status)) return json({ error: "Review status must be accepted, needs_followup or dismissed." }, 400);
  const existing = await env.DB.prepare(`${RECORD_SELECT} WHERE s.id=?`).bind(analysisId).first();
  if (!existing) return json({ error: "Satellite analysis not found." }, 404);
  const timestamp = now(), note = String(body?.reviewNote || "").slice(0, 2000);
  await env.DB.prepare("UPDATE satellite_analysis_runs SET review_status=?,reviewed_by_user_id=?,reviewed_at=?,review_note=?,updated_at=? WHERE id=?")
    .bind(status, user.id, timestamp, note, timestamp, analysisId).run();
  await audit(env, request, user, "satellite-analysis-reviewed", { analysisId, projectId: existing.projectId, reviewStatus: status });
  const row = await env.DB.prepare(`${RECORD_SELECT} WHERE s.id=?`).bind(analysisId).first();
  return json({ analysis: recordJson(row) });
}

export async function handleSatelliteApi(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.includes("satellite-analysis")) return null;
  const user = await currentUser(request, env);
  if (!user) return json({ error: "Authentication required." }, 401);
  if (fieldOfficerDenied(user)) return json({ error: "Field officers do not have administrative satellite-analysis access." }, 403);

  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/satellite-analysis(?:\/(compare))?$/);
  if (projectMatch) {
    const projectId = decodeURIComponent(projectMatch[1]);
    const project = await loadProject(env, projectId);
    if (!project) return json({ error: "Project not found." }, 404);
    if (request.method === "GET" && !projectMatch[2]) return listProjectAnalyses(request, env, user, project);
    if (request.method === "POST" && projectMatch[2] === "compare") return createAnalysis(request, env, user, project, "historical_compare");
    if (request.method === "POST" && !projectMatch[2]) return createAnalysis(request, env, user, project, "current");
    return json({ error: "Method not allowed." }, 405);
  }

  const analysisMatch = url.pathname.match(/^\/api\/satellite-analysis\/([^/]+)(?:\/(review))?$/);
  if (analysisMatch) {
    const analysisId = decodeURIComponent(analysisMatch[1]);
    if (request.method === "PATCH" && analysisMatch[2] === "review") return reviewAnalysis(request, env, user, analysisId);
    if (request.method === "GET" && !analysisMatch[2]) {
      const row = await env.DB.prepare(`${RECORD_SELECT} WHERE s.id=?`).bind(analysisId).first();
      if (!row) return json({ error: "Satellite analysis not found." }, 404);
      const project = await loadProject(env, row.projectId);
      if (!canReadProject(user, project)) return json({ error: "Analysis is outside your permitted scope." }, 403);
      return json({ analysis: recordJson(row) });
    }
    return json({ error: "Method not allowed." }, 405);
  }

  return json({ error: "Satellite analysis route not found." }, 404);
}
