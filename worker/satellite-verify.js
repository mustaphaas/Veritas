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

import { applyEvidencePolicy, classifyComponent } from "./satellite-evidence-policy.js";

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
const ESRI_METADATA_QUERY_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/0/query";
const METRES_PER_DEGREE_LAT = 111320;
const MIN_RADIUS_METRES = 80;
const MAX_RADIUS_METRES = 400;
const SATELLITE_ANALYSIS_VERSION = "2";

export function bboxAround(lat, lon, radiusMetres) {
  const dLat = radiusMetres / METRES_PER_DEGREE_LAT;
  const dLon = radiusMetres / (METRES_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

export function normaliseEsriImageryDate(value) {
  if (value === null || value === undefined || value === "" || value === 99999) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value > 1_000_000_000 ? value * 1000 : null;
    if (millis) {
      const date = new Date(millis);
      if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
    }
  }
  const text = String(value).trim();
  if (/^\d{8}$/.test(text)) {
    const y = text.slice(0, 4);
    const m = text.slice(4, 6);
    const d = text.slice(6, 8);
    const parsed = new Date(`${y}-${m}-${d}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : `${y}-${m}-${d}`;
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

export function parseEsriImageryMetadata(attributes = {}) {
  const entries = Object.entries(attributes || {});
  const pick = (patterns) => {
    for (const pattern of patterns) {
      const entry = entries.find(([key, value]) => value !== null && value !== "" && pattern.test(key));
      if (entry) return entry[1];
    }
    return null;
  };
  const rawDate = pick([/^SRC_DATE2$/i, /^SRC_DATE$/i, /ACQ.*DATE/i, /CAPTURE.*DATE/i, /COLLECT.*DATE/i, /DATE/i]);
  const source = pick([/^SOURCE$/i, /^SRC_NAME$/i, /SOURCE/i, /CITATION/i, /PROVIDER/i]);
  return {
    imageryDate: normaliseEsriImageryDate(rawDate),
    source: source ? String(source).trim() : null,
  };
}

export async function fetchEsriImageryMetadata(lat, lon) {
  const params = new URLSearchParams({
    f: "json",
    geometry: `${lon},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
  });
  try {
    const metadataResponse = await fetch(`${ESRI_METADATA_QUERY_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!metadataResponse.ok) return { imageryDate: null, source: null };
    const payload = await metadataResponse.json().catch(() => ({}));
    const features = Array.isArray(payload?.features) ? payload.features : [];
    for (const feature of features) {
      const parsed = parseEsriImageryMetadata(feature?.attributes || {});
      if (parsed.imageryDate || parsed.source) return parsed;
    }
  } catch {
    // Metadata is supporting provenance only. The image analysis can proceed
    // when Esri's metadata layer is temporarily unavailable.
  }
  return { imageryDate: null, source: null };
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

const SATELLITE_RADIUS_ATTEMPTS = [150, 150, 250, 400];

export async function fetchSatelliteImage(lat, lon, requestedRadius) {
  const radii = [...new Set([requestedRadius, ...SATELLITE_RADIUS_ATTEMPTS])].filter(
    (value) => Number.isFinite(value) && value >= MIN_RADIUS_METRES && value <= MAX_RADIUS_METRES,
  );
  let lastStatus = 0;
  let lastReason = "No imagery response received.";

  for (let attempt = 0; attempt < radii.length; attempt += 1) {
    const radius = radii[attempt];
    const imageUrl = esriExportUrl(lat, lon, radius);
    try {
      const imageResponse = await fetch(imageUrl, {
        headers: { Accept: "image/png,image/*;q=0.9,*/*;q=0.1" },
        signal: AbortSignal.timeout(12000),
      });
      const contentType = imageResponse.headers.get("content-type") || "";
      if (!imageResponse.ok) {
        lastStatus = imageResponse.status;
        lastReason = `Esri export returned HTTP ${imageResponse.status}`;
      } else if (!contentType.toLowerCase().includes("image/")) {
        lastStatus = imageResponse.status;
        lastReason = `Esri returned an unexpected content type: ${contentType || "unknown"}`;
      } else {
        const bytes = new Uint8Array(await imageResponse.arrayBuffer());
        if (!bytes.length) {
          lastStatus = imageResponse.status;
          lastReason = "Esri returned an empty image.";
        } else {
          let binary = "";
          const chunkSize = 0x8000;
          for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
          }
          return {
            ok: true,
            imageBase64: btoa(binary),
            imageUrl,
            radius,
            attempts: attempt + 1,
          };
        }
      }
    } catch (error) {
      lastStatus = 0;
      lastReason = error instanceof Error ? error.message : "Network or timeout error";
    }

    if (attempt < radii.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  return {
    ok: false,
    attempts: radii.length,
    status: lastStatus,
    reason: lastReason,
  };
}

// What each component looks like from above, in the terms a reviewer would
// accept as confirmation. "Strong" is deliberately demanding: a cleared corridor
// is not a line, and a handful of panels is not a mini-grid.
const SIGNATURE_BRIEF = {
  mini_grid:
    "a mini-grid generation site shows as a large contiguous block of solar panels: many rows of ground-mounted or clustered arrays, typically tens of metres across, often fenced and beside a small building. A few panels, a small cluster, or panels on ordinary rooftops do not amount to a mini-grid.",
  grid_extension:
    "a grid extension shows as a continuous run of distribution poles (regularly spaced poles or their shadows, cross-arms, or conductors) along a road or across open ground. A cleared corridor through vegetation shows a way-leave and is NOT a line on its own.",
  street_light:
    "solar street lights show as regularly spaced poles along a road or path, each with a small panel and luminaire head; pole shadows often make them visible. One or two possible poles do not amount to a lighting scheme.",
  unknown:
    "the claimed equipment should be clearly identifiable as its type. Count it as strong only if it is unmistakable.",
};

export function verificationPrompt(project, radiusMetres) {
  const kind = classifyComponent(project.programme, project.component);
  const centreZone = Math.max(15, Math.round((Number(radiusMetres) || 150) / 6));
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
    "ATTRIBUTION: the claimed project sits at the exact centre of the image. Solar panels, poles or arrays elsewhere in the frame - on institutional buildings, businesses, or other people's homes - are NOT evidence for this project. Set evidenceLocation to:",
    `- "at_project_point" only if the claimed component type is visible within about ${centreZone} m of the image centre;`,
    '- "elsewhere_in_frame" if solar equipment is visible but not at the centre;',
    '- "none" if no solar equipment is visible.',
    "",
    ...(SIGNATURE_BRIEF[kind]
      ? [
          `SIGNATURE: ${SIGNATURE_BRIEF[kind]}`,
          `Set signatureStrength to "strong" only if you can see that within about ${centreZone} m of the image centre; "partial" if you see only some of it; "none" if you see none of it.`,
          "",
        ]
      : []),
    ...(kind === "distributed"
      ? [
          "COMPONENT LIMIT: this project is household-scale. Individual household panels cannot be reliably resolved from overhead imagery or tied to one project. Do NOT judge whether this project's systems are present: set infrastructureDetected to \"inconclusive\" and treat rooftop panels as unrelated to the claim. Use notes to describe the built-up character of the area instead (for example dense urban, peri-urban, or rural compounds), and still report imageQuality and the rooftop estimate.",
          "",
        ]
      : []),
    "Judge only what is visible in the image. Do not assume infrastructure exists because it is claimed, and do not infer ground-truth status from the imagery date - you are reporting what the archived image shows, not confirming current conditions.",
    "Estimate the number of houses/rooftops within the frame.",
    "",
    "Respond with ONLY minified JSON, no markdown fences and no commentary, matching exactly this shape:",
    '{"infrastructureDetected":"present"|"absent"|"inconclusive","evidenceLocation":"at_project_point"|"elsewhere_in_frame"|"none","signatureStrength":"strong"|"partial"|"none","imageQuality":"clear"|"degraded"|"unusable","confidence":0-1 number,"estimatedNearbyHouses":integer,"notes":"short string, max 40 words"}',
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
    evidenceLocation: { type: "STRING", enum: ["at_project_point", "elsewhere_in_frame", "none"] },
    signatureStrength: { type: "STRING", enum: ["strong", "partial", "none"] },
    imageQuality: { type: "STRING", enum: ["clear", "degraded", "unusable"] },
    confidence: { type: "NUMBER" },
    estimatedNearbyHouses: { type: "INTEGER" },
    notes: { type: "STRING" },
  },
  required: ["infrastructureDetected", "evidenceLocation", "signatureStrength", "imageQuality", "confidence", "estimatedNearbyHouses", "notes"],
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
      // Only present when the model supplied a valid value; applyEvidencePolicy
      // treats absence as "not localised" rather than assuming the best.
      ...(["at_project_point", "elsewhere_in_frame", "none"].includes(parsed.evidenceLocation)
        ? { evidenceLocation: parsed.evidenceLocation }
        : {}),
      ...(["strong", "partial", "none"].includes(parsed.signatureStrength)
        ? { signatureStrength: parsed.signatureStrength }
        : {}),
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
  if (request.method !== "GET" && request.method !== "POST") {
    return response({ error: "Method not allowed." }, 405);
  }

  const user = await currentUser(request, env);
  if (!user) return response({ error: "Authentication required." }, 401);
  if (user.role !== "rea_admin" && user.role !== "consultant_admin") {
    return response({ error: "REA or consultant access required." }, 403);
  }
  const projectId = decodeURIComponent(match[1]);
  const project = await env.DB.prepare(
    `SELECT id,name,programme,component,consultant_firm AS consultantFirm,
       state,lga,community,latitude,longitude,geofence_radius_metres AS geofenceRadiusMetres,
       installed_capacity_kw AS installedCapacityKw,households,
       satellite_verification_status AS satelliteVerificationStatus,
       satellite_image_quality AS satelliteImageQuality,
       satellite_verification_confidence AS satelliteVerificationConfidence,
       satellite_house_estimate AS satelliteHouseEstimate,
       satellite_verification_notes AS satelliteVerificationNotes,
       satellite_verification_checked_at AS satelliteVerificationCheckedAt,
       satellite_imagery_source AS satelliteImagerySource,
       satellite_imagery_date AS satelliteImageryDate,
       satellite_analysis_radius_metres AS satelliteAnalysisRadiusMetres,
       satellite_analysis_method AS satelliteAnalysisMethod,
       satellite_analysis_image_url AS satelliteAnalysisImageUrl,
       satellite_analysis_version AS satelliteAnalysisVersion
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

  if (request.method === "GET") {
    if (!project.satelliteVerificationCheckedAt || !project.satelliteVerificationStatus) {
      return response(
        {
          error: "No cached satellite verification exists for this project yet.",
          code: "no_cached_satellite_result",
          projectId,
        },
        404,
      );
    }
    return response({
      projectId,
      imageUrl: project.satelliteAnalysisImageUrl || null,
      checkedAt: project.satelliteVerificationCheckedAt,
      verdict: {
        status: project.satelliteVerificationStatus,
        imageQuality: project.satelliteImageQuality || "unusable",
        confidence:
          project.satelliteVerificationConfidence === null || project.satelliteVerificationConfidence === undefined
            ? null
            : Number(project.satelliteVerificationConfidence),
        estimatedNearbyHouses:
          project.satelliteHouseEstimate === null || project.satelliteHouseEstimate === undefined
            ? null
            : Number(project.satelliteHouseEstimate),
        notes: project.satelliteVerificationNotes || "",
      },
      imagerySource: project.satelliteImagerySource || "Esri World Imagery",
      imageryDate: project.satelliteImageryDate || null,
      radiusMetres: Number(project.satelliteAnalysisRadiusMetres || project.geofenceRadiusMetres || 150),
      analysisMethod: project.satelliteAnalysisMethod || null,
      analysisVersion: project.satelliteAnalysisVersion || null,
      cached: true,
    });
  }

  if (!env.GEMINI_API_KEY) {
    return response({ error: "Satellite verification is not configured yet." }, 503);
  }

  const requestedRadius = Math.max(
    MIN_RADIUS_METRES,
    Math.min(MAX_RADIUS_METRES, Number(project.geofenceRadiusMetres) || 150),
  );
  const imageryResult = await fetchSatelliteImage(latitude, longitude, requestedRadius);
  if (!imageryResult.ok) {
    return response(
      {
        error: "Satellite imagery is temporarily unavailable for this project.",
        code: "imagery_unavailable",
        provider: "Esri World Imagery",
        attempts: imageryResult.attempts,
        lastStatus: imageryResult.status || null,
        reason: imageryResult.reason,
      },
      imageryResult.status === 429 ? 429 : 502,
    );
  }

  const { imageBase64, imageUrl, radius } = imageryResult;
  const metadata = await fetchEsriImageryMetadata(latitude, longitude);

  const geminiResult = await callGeminiVision(env, imageBase64, verificationPrompt(project, radius));
  if (!geminiResult.ok) {
    return response(
      { error: "Veritas could not complete the satellite check. Please try again shortly." },
      geminiResult.status === 429 ? 429 : 503,
    );
  }

  const modelVerdict = parseVerdict(geminiResult.text);
  if (!modelVerdict) {
    return response({ error: "Veritas returned an unreadable satellite verdict. Please retry." }, 502);
  }
  // What the model saw is not yet what may be reported: the policy decides
  // whether that evidence can stand for THIS project at THIS point.
  const verdict = applyEvidencePolicy(modelVerdict, project, radius);
  const storedNotes = [verdict.limitation?.message, verdict.houseEstimateNote, verdict.notes]
    .filter(Boolean)
    .join(" ")
    .slice(0, 700);

  const checkedAt = new Date().toISOString();
  const imagerySource = metadata.source
    ? `Esri World Imagery — ${metadata.source}`
    : "Esri World Imagery (World_Imagery/MapServer export)";
  const imageryDate = metadata.imageryDate || null;
  const analysisMethod = `gemini-vision:${geminiResult.model}`;
  await env.DB.prepare(
    `UPDATE projects SET
       satellite_verification_status=?, satellite_image_quality=?, satellite_verification_confidence=?,
       satellite_house_estimate=?, satellite_verification_notes=?, satellite_verification_checked_at=?,
       satellite_imagery_source=?, satellite_imagery_date=?, satellite_analysis_radius_metres=?,
       satellite_analysis_method=?, satellite_analysis_image_url=?, satellite_analysis_version=?
     WHERE id=?`,
  )
    .bind(
      verdict.status,
      verdict.imageQuality,
      verdict.confidence,
      verdict.estimatedNearbyHouses,
      storedNotes,
      checkedAt,
      imagerySource,
      imageryDate,
      radius,
      analysisMethod,
      imageUrl,
      SATELLITE_ANALYSIS_VERSION,
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
      JSON.stringify({
        projectId,
        status: verdict.status,
        modelStatus: verdict.modelStatus,
        limitation: verdict.limitation?.code || null,
        evidenceLocation: verdict.evidenceLocation,
        confidence: verdict.confidence,
        imageryDate,
      }),
      request.headers.get("CF-Connecting-IP"),
      checkedAt,
    )
    .run();

  return response({
    projectId,
    imageUrl,
    checkedAt,
    verdict,
    imagerySource,
    imageryDate,
    radiusMetres: radius,
    analysisMethod,
    analysisVersion: SATELLITE_ANALYSIS_VERSION,
  });
}
