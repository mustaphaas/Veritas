// Satellite-based project verification for the Project Map tab.
//
// Given a project ID, this fetches an Esri World Imagery export centered on
// the project's stored D1 GPS coordinates (the same tile source the Project
// Map's "Satellite" toggle already renders - see
// client/components/ProjectMapSatelliteEnhancer.tsx), sends it to Gemini as
// an image input, and asks the model to judge whether infrastructure
// consistent with the claimed project type (solar street light, mini-grid,
// standalone solar) is visible, and to estimate nearby houses. The verdict
// is cached on the project row so repeat map views don't re-spend imagery
// or model calls; a caller can force a refresh via POST.
//
// Route: POST /api/projects/:id/satellite-verify
// Auth: rea_admin (any project) or consultant_admin (own consultant_firm only)

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

const ESRI_EXPORT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export";
const METRES_PER_DEGREE_LAT = 111320;
const MIN_RADIUS_METRES = 80;
const MAX_RADIUS_METRES = 400;

export function bboxAround(lat, lon, radiusMetres) {
  const dLat = radiusMetres / METRES_PER_DEGREE_LAT;
  const dLon = radiusMetres / (METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

export function esriExportUrl(lat, lon, radiusMetres) {
  const [minLon, minLat, maxLon, maxLat] = bboxAround(lat, lon, radiusMetres);
  const params = new URLSearchParams({
    bbox: `${minLon},${minLat},${maxLon},${maxLat}`,
    bboxSR: "4326",
    imageSR: "4326",
    size: "1024,1024",
    format: "png32",
    f: "image",
  });
  return `${ESRI_EXPORT_URL}?${params.toString()}`;
}

function verificationPrompt(project) {
  return [
    "You are assisting a Rural Electrification Agency (REA) verification reviewer in Nigeria.",
    "You are shown a satellite image centered on a claimed rural electrification project.",
    "",
    `Claimed project: ${project.name}`,
    `Claimed programme/component: ${project.programme} / ${project.component}`,
    `Claimed installed capacity: ${Number(project.installedCapacityKw || 0)} kW`,
    `Claimed households served: ${Number(project.households || 0)}`,
    `Location: ${project.community}, ${project.lga}, ${project.state}, Nigeria.`,
    "",
    "VISUAL REFERENCE for each component type, as it appears from directly overhead:",
    "- Solar street light: a line of small individual poles along a road, spaced roughly 4-8m apart, each casting a short pole-shaped shadow with no larger structure attached.",
    "- Mini-grid: a fenced rectangular array of solar panels (a distinct grid-like texture) adjacent to a small powerhouse building, often with thin line-pole shadows radiating toward nearby houses.",
    "- Standalone solar: a single small panel or box immediately next to one house, with no shared array or pole line.",
    "",
    "IMAGE QUALITY: satellite imagery archives are not always current or high-resolution. If cloud cover, shadow, low resolution, or off-nadir angle makes the area genuinely hard to read, say so in imageQuality rather than guessing - do not let poor image quality produce a false 'absent'.",
    "",
    "CONFIDENCE CALIBRATION: use 0.8-1.0 only when the claimed infrastructure's distinctive shape is unambiguous. Use 0.4-0.7 when something is visible but doesn't clearly match the claimed type, or the match is plausible but not certain. Use below 0.4 when the image gives little to go on.",
    "",
    "Judge only what is visible in the image. Do not assume infrastructure exists because it is claimed, and do not infer ground-truth status from the imagery date - you are reporting what the archived image shows, not confirming current conditions.",
    "Estimate the number of houses/rooftops within the frame.",
    "",
    "Respond with ONLY minified JSON, no markdown fences and no commentary, matching exactly this shape:",
    '{"infrastructureDetected":"present"|"absent"|"inconclusive","imageQuality":"clear"|"degraded"|"unusable","confidence":0-1 number,"estimatedNearbyHouses":integer,"notes":"short string, max 40 words"}',
  ].join("\n");
}

function geminiModelsToTry(env) {
  const primary = env.GEMINI_MODEL || "gemini-3.8-flash";
  const builtInFallbacks = [
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
  ];
  return [...new Set([primary, ...builtInFallbacks])];
}

const VERDICT_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    infrastructureDetected: { type: "STRING", enum: ["present", "absent", "inconclusive"] },
    imageQuality: { type: "STRING", enum: ["clear", "degraded", "unusable"] },
    confidence: { type: "NUMBER" },
    estimatedNearbyHouses: { type: "INTEGER" },
    notes: { type: "STRING" },
  },
  required: ["infrastructureDetected", "imageQuality", "confidence", "estimatedNearbyHouses", "notes"],
};

// Mirrors the retry behaviour of callGeminiWithFallback in worker/index.js
// (only advances to the next model on 429/404/503), but sends an image part
// alongside the prompt rather than plain text, and constrains the response
// to VERDICT_RESPONSE_SCHEMA so the model can't drift into free text.
async function callGeminiVision(env, imageBase64, prompt) {
  const models = geminiModelsToTry(env);
  let lastStatus = 0;
  let lastMessage = "Veritas AI service is currently unavailable.";

  for (const model of models) {
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: "image/png", data: imageBase64 } },
                ],
              },
            ],
            generationConfig: {
              maxOutputTokens: 400,
              temperature: 0,
              thinkingConfig: { thinkingLevel: "low" },
              responseMimeType: "application/json",
              responseSchema: VERDICT_RESPONSE_SCHEMA,
            },
          }),
          signal: AbortSignal.timeout(25000),
        },
      );
      const payload = await upstream.json().catch(() => ({}));
      if (upstream.ok) {
        const text = (payload?.candidates?.[0]?.content?.parts || [])
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .join("")
          .trim();
        if (text) return { ok: true, model, text };
        lastMessage = "Gemini returned HTTP 200 without visible answer text.";
        continue;
      }
      lastStatus = upstream.status;
      lastMessage = String(payload?.error?.message || payload?.error || `HTTP ${upstream.status}`);
      if (upstream.status !== 429 && upstream.status !== 404 && upstream.status !== 503) {
        return { ok: false, status: upstream.status, message: lastMessage };
      }
    } catch (error) {
      lastStatus = 0;
      lastMessage = error instanceof Error ? error.message : "Network or timeout error";
    }
  }

  return { ok: false, status: lastStatus, message: lastMessage };
}

// With VERDICT_RESPONSE_SCHEMA constraining the API response, Gemini should
// return exactly this shape as the full text - but this still validates and
// clamps defensively rather than trusting an upstream guarantee blindly.
// Enforced independently of what the model claims: an unusable image can
// never produce a "present"/"absent" verdict, only "inconclusive" - this is
// a backend rule, not something left to the model to self-apply.
export function parseVerdict(text) {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const imageQuality = ["clear", "degraded", "unusable"].includes(parsed.imageQuality)
      ? parsed.imageQuality
      : "degraded";
    const rawStatus = ["present", "absent", "inconclusive"].includes(parsed.infrastructureDetected)
      ? parsed.infrastructureDetected
      : "inconclusive";
    const status = imageQuality === "unusable" ? "inconclusive" : rawStatus;
    const confidence = Number(parsed.confidence);
    const houses = Number(parsed.estimatedNearbyHouses);
    return {
      status,
      imageQuality,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      estimatedNearbyHouses: Number.isFinite(houses) ? Math.max(0, Math.round(houses)) : null,
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 400) : "",
    };
  } catch {
    return null;
  }
}

const ROUTE_PATTERN = /^\/api\/projects\/([^/]+)\/satellite-verify$/;

export async function handleSatelliteVerify(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(ROUTE_PATTERN);
  if (!match) return null;
  if (request.method !== "POST") return response({ error: "Method not allowed." }, 405);

  const user = await currentUser(request, env);
  if (!user) return response({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin" && user.role !== "consultant_admin") {
    return response({ error: "REA or consultant access required." }, 403);
  }
  if (!env.GEMINI_API_KEY) {
    return response({ error: "Satellite verification is not configured yet." }, 503);
  }

  const projectId = decodeURIComponent(match[1]);
  const project = await env.DB.prepare(
    `SELECT id,name,programme,component,consultant_firm AS consultantFirm,
       state,lga,community,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres,
       installed_capacity_kw AS installedCapacityKw,households
     FROM projects WHERE id=?`,
  )
    .bind(projectId)
    .first();
  if (!project) return response({ error: "Project not found." }, 404);
  if (user.role === "consultant_admin" && project.consultantFirm !== user.consultantFirm) {
    return response({ error: "Project is outside your consultant firm." }, 403);
  }

  const latitude = Number(project.latitude);
  const longitude = Number(project.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return response({ error: "Project has no usable GPS coordinates on file." }, 422);
  }

  const radius = Math.max(
    MIN_RADIUS_METRES,
    Math.min(MAX_RADIUS_METRES, Number(project.geofenceRadiusMetres) || 150),
  );
  const imageUrl = esriExportUrl(latitude, longitude, radius);

  let imageBase64;
  try {
    const imageResponse = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!imageResponse.ok) throw new Error(`Esri export returned HTTP ${imageResponse.status}`);
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    imageBase64 = btoa(binary);
  } catch {
    return response({ error: "Could not fetch satellite imagery for this project right now." }, 502);
  }

  const geminiResult = await callGeminiVision(env, imageBase64, verificationPrompt(project));
  if (!geminiResult.ok) {
    return response(
      { error: "Veritas could not complete the satellite check. Please try again shortly." },
      geminiResult.status === 429 ? 429 : 503,
    );
  }

  const verdict = parseVerdict(geminiResult.text);
  if (!verdict) {
    return response({ error: "Veritas returned an unreadable satellite verdict. Please retry." }, 502);
  }

  const checkedAt = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE projects SET
       satellite_verification_status=?, satellite_image_quality=?, satellite_verification_confidence=?,
       satellite_house_estimate=?, satellite_verification_notes=?, satellite_verification_checked_at=?
     WHERE id=?`,
  )
    .bind(
      verdict.status,
      verdict.imageQuality,
      verdict.confidence,
      verdict.estimatedNearbyHouses,
      verdict.notes,
      checkedAt,
      projectId,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO audit_events(id,assignment_id,actor_id,action,details_json,ip_address,created_at)
     VALUES(?,?,?,?,?,?,?)`,
  )
    .bind(
      crypto.randomUUID(),
      null,
      user.id,
      "project-satellite-verified",
      JSON.stringify({ projectId, status: verdict.status, confidence: verdict.confidence }),
      request.headers.get("CF-Connecting-IP"),
      checkedAt,
    )
    .run();

  return response({ projectId, imageUrl, checkedAt, verdict });
}
