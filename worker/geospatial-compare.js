// Read-only geospatial evidence comparison for the REA Project Map.
//
// Compares the approved project GPS coordinate with the most recent verified
// field-arrival GPS for the same project. It also returns the cached satellite
// verification result when available. No project, assignment, or inspection
// data is modified by this route.

const encoder = new TextEncoder();

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function digest(value) {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function currentUser(request, env) {
  const bearer = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer || !env.DB) return null;
  const tokenHash = await digest(bearer);
  return env.DB.prepare(
    `SELECT u.id,u.name,
       CASE WHEN u.role='rea_admin' AND COALESCE(r.staff_role,'REA Administrator')<>'REA Administrator'
         THEN 'rea_staff' ELSE u.role END AS role,
       u.consultant_firm AS consultantFirm
     FROM sessions s JOIN users u ON u.id=s.user_id
     LEFT JOIN rea_staff_accounts r ON r.user_id=u.id
     WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`,
  ).bind(tokenHash, new Date().toISOString()).first();
}

export function isValidCoordinate(latitude, longitude) {
  return Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number(longitude) >= -180 && Number(longitude) <= 180;
}

export function distanceMetres(aLat, aLon, bLat, bLon) {
  const rad = (value) => (Number(value) * Math.PI) / 180;
  const dLat = rad(Number(bLat) - Number(aLat));
  const dLon = rad(Number(bLon) - Number(aLon));
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function compareGeospatialEvidence(project, arrival) {
  const projectLat = Number(project?.latitude);
  const projectLon = Number(project?.longitude);
  const radius = Number(project?.geofenceRadiusMetres);

  const result = {
    projectGps: isValidCoordinate(projectLat, projectLon)
      ? { latitude: projectLat, longitude: projectLon, source: "Approved project GPS" }
      : null,
    fieldGps: null,
    distanceMetres: null,
    geofenceRadiusMetres: Number.isFinite(radius) && radius > 0 ? radius : null,
    geofenceStatus: "not_available",
    comparisonStatus: "insufficient_evidence",
    satellite: {
      status: project?.satelliteStatus || null,
      imageQuality: project?.satelliteImageQuality || null,
      confidence: Number.isFinite(Number(project?.satelliteConfidence))
        ? Number(project.satelliteConfidence)
        : null,
      checkedAt: project?.satelliteCheckedAt || null,
    },
  };

  if (!isValidCoordinate(projectLat, projectLon)) return result;

  const fieldLat = Number(arrival?.latitude);
  const fieldLon = Number(arrival?.longitude);
  if (!isValidCoordinate(fieldLat, fieldLon)) {
    return result;
  }

  const distance = distanceMetres(projectLat, projectLon, fieldLat, fieldLon);
  result.fieldGps = {
    latitude: fieldLat,
    longitude: fieldLon,
    source: "Verified arrival GPS",
    accuracyMetres: Number.isFinite(Number(arrival?.accuracyMetres))
      ? Number(arrival.accuracyMetres)
      : null,
    verifiedAt: arrival?.verifiedAt || arrival?.serverReceivedAt || null,
  };
  result.distanceMetres = Math.round(distance * 10) / 10;

  if (result.geofenceRadiusMetres == null) {
    result.geofenceStatus = "not_available";
    result.comparisonStatus = "coordinates_available";
  } else if (distance <= result.geofenceRadiusMetres) {
    result.geofenceStatus = "inside";
    result.comparisonStatus = "aligned";
  } else {
    result.geofenceStatus = "outside";
    result.comparisonStatus = "outside_geofence";
  }

  return result;
}

const ROUTE_PATTERN = /^\/api\/projects\/([^/]+)\/geospatial-compare$/;

export async function handleGeospatialCompare(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(ROUTE_PATTERN);
  if (!match) return null;
  if (request.method !== "GET") return response({ error: "Method not allowed." }, 405);

  const user = await currentUser(request, env);
  if (!user) return response({ error: "Authentication required." }, 401);
  if (!["rea_admin", "consultant_admin"].includes(user.role)) {
    return response({ error: "REA or consultant access required." }, 403);
  }
  if (!env.DB) return response({ error: "Database is not configured." }, 503);

  const projectId = decodeURIComponent(match[1]);
  const project = await env.DB.prepare(
    `SELECT id,name,consultant_firm AS consultantFirm,latitude,longitude,
       geofence_radius_metres AS geofenceRadiusMetres,
       satellite_verification_status AS satelliteStatus,
       satellite_image_quality AS satelliteImageQuality,
       satellite_verification_confidence AS satelliteConfidence,
       satellite_verification_checked_at AS satelliteCheckedAt
     FROM projects WHERE id=?`,
  ).bind(projectId).first();

  if (!project) return response({ error: "Project not found." }, 404);
  if (user.role === "consultant_admin" && project.consultantFirm !== user.consultantFirm) {
    return response({ error: "Project is outside your consultant firm." }, 403);
  }

  const assignment = await env.DB.prepare(
    `SELECT id,arrival_json AS arrivalJson,updated_at AS updatedAt
     FROM assignments
     WHERE project_id=? AND arrival_json IS NOT NULL
     ORDER BY updated_at DESC LIMIT 1`,
  ).bind(projectId).first();

  let arrival = null;
  if (assignment?.arrivalJson) {
    try {
      const parsed = JSON.parse(assignment.arrivalJson);
      arrival = parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      arrival = null;
    }
  }

  const comparison = compareGeospatialEvidence(project, arrival);
  return response({
    projectId,
    projectName: project.name,
    assignmentId: assignment?.id || null,
    comparedAt: new Date().toISOString(),
    ...comparison,
  });
}
