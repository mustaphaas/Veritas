import { presentVerdict } from "../lib/satellite-verdict-presentation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers3, Map as MapIcon, Satellite } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  fetchCachedProjectSatelliteImagery,
  fetchReaMapProjects,
  fetchProjectNightLightImpact,
  verifyProjectSatelliteImagery,
  type ReaMapProjectRecord,
  type SatelliteVerificationResult,
  type SatelliteVerificationVerdict,
} from "../lib/rea-project-map-data";

export const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const PROJECT_MAP_STATE_EVENT = "veritas:project-map-state";

export const projectMapSatelliteInitialView = {
  center: [9.08, 8.68] as [number, number],
  zoom: 6,
};

export const PROJECT_FOCUS_ZOOM = 18;
export const NIGERIA_MAX_BOUNDS = [[3.2, 2.0], [14.9, 15.2]] as [[number, number], [number, number]];
export const NIGERIA_MASK_OPACITY = 0.58;

const GOOGLE_MAPS_API_KEY = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "").trim();
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const MAP_SHELL_SELECTOR = ".veritas-map-canvas";

type LayerKey =
  | "Projects"
  | "Status"
  | "Inspections"
  | "Contractors"
  | "Critical Findings"
  | "Corrective Actions"
  | "Coverage Density";

type ProjectMapSharedState = {
  filters: {
    programme: string;
    component: string;
    contractor: string;
    state: string;
    lga: string;
    search: string;
  };
  selectedState: string | null;
  selectedLga: string | null;
  layers: Record<LayerKey, boolean>;
};

const defaultSharedState: ProjectMapSharedState = {
  filters: {
    programme: "All Programmes",
    component: "All Components",
    contractor: "All Contractors",
    state: "All States",
    lga: "All LGAs",
    search: "",
  },
  selectedState: null,
  selectedLga: null,
  layers: {
    Projects: true,
    Status: true,
    Inspections: false,
    Contractors: false,
    "Critical Findings": true,
    "Corrective Actions": false,
    "Coverage Density": true,
  },
};

type LeafletMap = {
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
  setMaxBounds: (bounds: unknown) => void;
  setView: (center: [number, number], zoom: number) => LeafletMap;
  on: (event: string, handler: (event: any) => void) => void;
};

type LeafletLayerGroup = {
  addTo: (map: LeafletMap) => LeafletLayerGroup;
  clearLayers: () => void;
};

type LeafletLayer = { addTo: (map: LeafletMap | LeafletLayerGroup) => LeafletLayer };

type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (map: LeafletMap | LeafletLayerGroup) => LeafletMarker;
  on: (event: string, handler: () => void) => LeafletMarker;
};

type LeafletApi = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options?: Record<string, unknown>) => { addTo: (map: LeafletMap) => unknown };
  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  polygon: (latlngs: unknown, options?: Record<string, unknown>) => LeafletLayer;
  latLngBounds: (latlngs: Array<[number, number]>) => unknown;
  layerGroup: () => LeafletLayerGroup;
};

type GoogleMapsApi = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => any;
  Marker: new (options: Record<string, unknown>) => any;
  InfoWindow: new (options?: Record<string, unknown>) => any;
  event: { addListenerOnce: (target: unknown, event: string, handler: () => void) => void };
};

declare global {
  interface Window {
    L?: LeafletApi;
    google?: { maps: GoogleMapsApi };
    __veritasLeafletPromise?: Promise<LeafletApi>;
    __veritasGoogleMapsPromise?: Promise<GoogleMapsApi>;
    __veritasMapSelectedProjectId?: string;
    __veritasProjectMapState?: ProjectMapSharedState;
  }
}

export function filterProjectsByMapState(
  projects: ReaMapProjectRecord[],
  state: ProjectMapSharedState,
) {
  const query = state.filters.search.trim().toLowerCase();
  const effectiveState =
    state.filters.state !== "All States" ? state.filters.state : state.selectedState;
  const effectiveLga =
    state.filters.lga !== "All LGAs" ? state.filters.lga : state.selectedLga;

  return projects.filter((project) => (
    (state.filters.programme === "All Programmes" || project.programme === state.filters.programme) &&
    (state.filters.component === "All Components" || project.component === state.filters.component) &&
    (state.filters.contractor === "All Contractors" || project.contractor === state.filters.contractor) &&
    (!effectiveState || project.state === effectiveState) &&
    (!effectiveLga || project.lga === effectiveLga) &&
    (!query ||
      `${project.id} ${project.name} ${project.state} ${project.lga} ${project.contractor} ${project.community}`
        .toLowerCase()
        .includes(query))
  ));
}

function ensureLeaflet(): Promise<LeafletApi> {
  if (window.L) return Promise.resolve(window.L);
  if (window.__veritasLeafletPromise) return window.__veritasLeafletPromise;

  window.__veritasLeafletPromise = new Promise<LeafletApi>((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LEAFLET_JS}"]`);
    if (existing) {
      existing.addEventListener("load", () => (window.L ? resolve(window.L) : reject(new Error("Leaflet unavailable"))), { once: true });
      existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.onload = () => (window.L ? resolve(window.L) : reject(new Error("Leaflet unavailable")));
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(script);
  });
  return window.__veritasLeafletPromise;
}

function ensureGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (window.__veritasGoogleMapsPromise) return window.__veritasGoogleMapsPromise;
  window.__veritasGoogleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async`;
    script.async = true;
    script.defer = true;
    script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error("Google Maps unavailable"));
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return window.__veritasGoogleMapsPromise;
}

function validCoordinate(record: ReaMapProjectRecord) {
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function markerColor(record: ReaMapProjectRecord, showStatus = true) {
  if (!showStatus) return "#128149";
  if (record.verified) return "#159254";
  if (record.status === "In progress") return "#2d78c4";
  if (record.status === "Submitted") return "#d4a514";
  return "#df7b22";
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function extractNigeriaRings(data: any) {
  const features = Array.isArray(data?.features) ? data.features : [];
  return features.flatMap((feature: any) => {
    const geometry = feature?.geometry;
    if (!geometry || !Array.isArray(geometry.coordinates)) return [];
    const rings = geometry.type === "Polygon"
      ? [geometry.coordinates[0]]
      : geometry.type === "MultiPolygon"
        ? geometry.coordinates.map((polygon: any) => polygon[0])
        : [];
    return rings
      .filter(Array.isArray)
      .map((ring: any[]) => ring.map(([longitude, latitude]) => [latitude, longitude]));
  });
}

function nightLightButtonHtml() {
  return `<button type="button" data-nightlight-impact-btn style="margin-left:5px;font-size:10px;font-weight:700;color:#312e81;background:#eef2ff;border:1px solid #c7d2fe;border-radius:4px;padding:4px 8px;cursor:pointer">Night-light impact</button>`;
}

function nightLightImpactHtml(impact: any) {
  const fmt = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toFixed(2) : "—";
  const pct = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%` : "—";
  const labels: Record<string, string> = {
    strong_increase: "Strong increase",
    moderate_increase: "Moderate increase",
    no_clear_change: "No clear change",
    decrease: "Decrease",
    insufficient_data: "Insufficient data",
  };
  return `<div style="margin-top:7px;border-top:1px solid #e2e8f0;padding-top:7px;font-size:10px;line-height:1.5">
    <div style="font-weight:800;color:#312e81">NASA VIIRS night-light impact</div>
    <div style="margin-top:3px;color:#475569">Before <b>${escapeHtml(fmt(impact.baselineRadiance))}</b> → After <b>${escapeHtml(fmt(impact.afterRadiance))}</b> nW/cm²/sr</div>
    <div style="color:#475569">Change <b>${escapeHtml(pct(impact.percentChange))}</b> · ${escapeHtml(labels[impact.impactClass] || "Insufficient data")}</div>
    <div style="margin-top:2px;color:#64748b">Comparison area: ${escapeHtml(pct(impact.controlPercentChange))} · ${escapeHtml(String(impact.monthsBefore || 0))} before / ${escapeHtml(String(impact.monthsAfter || 0))} after months</div>
    <div style="margin-top:3px;color:#64748b">Supporting impact evidence only; not proof of causation.</div>
  </div>`;
}

function verifyButtonHtml() {
  return `<button type="button" data-satellite-verify-btn style="font-size:10px;font-weight:700;color:#fff;background:#173b2a;border:none;border-radius:4px;padding:4px 8px;cursor:pointer">Verify via satellite</button>${nightLightButtonHtml()}`;
}

function verdictHtml(result: SatelliteVerificationResult) {
  const verdict = result.verdict;
  const confidence = typeof verdict.confidence === "number" ? `confidence ${Math.round(verdict.confidence * 100)}%` : null;
  const houses = typeof verdict.estimatedNearbyHouses === "number" ? `~${verdict.estimatedNearbyHouses} rooftops in frame` : null;
  const { label, color } = presentVerdict(verdict);
  const figures = [confidence, houses].filter(Boolean).join(" · ");
  const qualityNote = verdict.imageQuality !== "clear"
    ? `<div style="margin-top:3px;color:#b8860b">Imagery quality: ${escapeHtml(verdict.imageQuality)} — treat this read with extra caution.</div>`
    : "";
  const dateLine = result.imageryDate
    ? `<div style="margin-top:3px;color:#475569">Imagery date: <b>${escapeHtml(result.imageryDate)}</b></div>`
    : `<div style="margin-top:3px;color:#64748b">Imagery acquisition date unavailable from provider metadata.</div>`;
  const limitation = verdict.limitation?.message ? `<div style="margin-top:3px;color:#475569">${escapeHtml(verdict.limitation.message)}</div>` : "";
  const houseNote = verdict.houseEstimateNote ? `<div style="margin-top:3px;color:#64748b">${escapeHtml(verdict.houseEstimateNote)}</div>` : "";
  return `<div style="font-size:10px;line-height:1.5">
    <span style="display:inline-block;padding:1px 6px;border-radius:3px;color:#fff;font-weight:700;background:${color}">${escapeHtml(label)}</span>
    ${figures ? `<span style="color:#64748b"> · ${escapeHtml(figures)}</span>` : ""}
    ${dateLine}${limitation}
    ${verdict.notes ? `<div style="margin-top:3px;color:#475569">${escapeHtml(verdict.notes)}</div>` : ""}
    ${houseNote}${qualityNote}
    <button type="button" data-satellite-verify-btn style="margin-top:4px;font-size:9px;font-weight:700;color:#173b2a;background:none;border:1px solid #173b2a;border-radius:4px;padding:2px 6px;cursor:pointer">Re-check</button>
    ${nightLightButtonHtml()}
  </div>`;
}

function errorHtml(message: string) {
  return `<div style="font-size:10px;color:#c0392b">${escapeHtml(message)}
    <button type="button" data-satellite-verify-btn style="margin-left:4px;font-size:9px;font-weight:700;color:#173b2a;background:none;border:1px solid #173b2a;border-radius:4px;padding:2px 6px;cursor:pointer">Retry</button>
  </div>`;
}

function popupHtml(project: ReaMapProjectRecord, state: ProjectMapSharedState) {
  const extras = [
    state.layers.Contractors && project.contractor ? `Contractor: ${escapeHtml(project.contractor)}` : "",
    state.layers.Inspections ? `Verification: ${project.verified ? "Verified" : "Pending"}` : "",
  ].filter(Boolean);
  return `<div style="min-width:210px;font-family:system-ui,sans-serif">
    <strong>${escapeHtml(project.name)}</strong><br/>
    <span style="font-size:11px;color:#64748b">${escapeHtml(project.community || project.lga || project.state)}</span><br/>
    <span style="font-size:11px;color:#08733f;font-weight:700">${escapeHtml(project.programme)} · ${escapeHtml(project.status)}</span>
    ${extras.length ? `<div style="margin-top:4px;font-size:10px;color:#64748b">${extras.join("<br/>")}</div>` : ""}
    <div data-satellite-verify-slot="${escapeHtml(project.id)}" style="margin-top:6px"><span style="font-size:10px;color:#64748b">Loading saved verification…</span></div>
  </div>`;
}

async function hydrateCachedVerdict(slot: HTMLElement, projectId: string, apiToken?: string) {
  if (!apiToken) {
    slot.innerHTML = verifyButtonHtml();
    return;
  }
  try {
    const cached = await fetchCachedProjectSatelliteImagery(projectId, apiToken);
    slot.innerHTML = verdictHtml(cached);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    const code = (error as Error & { code?: string }).code;
    if (status === 404 && code === "no_cached_satellite_result") slot.innerHTML = verifyButtonHtml();
    else slot.innerHTML = errorHtml(error instanceof Error ? error.message : "Saved satellite result is unavailable.");
  }
}

function bindPopupControls(container: HTMLElement, apiToken?: string) {
  if (container.dataset.veritasVerifyBound === "true") return;
  container.dataset.veritasVerifyBound = "true";
  const slot = container.querySelector<HTMLElement>("[data-satellite-verify-slot]");
  const projectId = slot?.getAttribute("data-satellite-verify-slot");
  if (slot && projectId) void hydrateCachedVerdict(slot, projectId, apiToken);

  container.addEventListener("click", async (clickEvent) => {
    const target = clickEvent.target as HTMLElement | null;
    const nightLightButton = target?.closest<HTMLElement>("[data-nightlight-impact-btn]");
    const satelliteButton = target?.closest<HTMLElement>("[data-satellite-verify-btn]");
    const control = nightLightButton || satelliteButton;
    const activeSlot = control?.closest<HTMLElement>("[data-satellite-verify-slot]");
    const activeProjectId = activeSlot?.getAttribute("data-satellite-verify-slot");
    if (!control || !activeSlot || !activeProjectId) return;
    clickEvent.stopPropagation();

    if (!apiToken) {
      activeSlot.innerHTML = errorHtml("Sign in again to run this geospatial check.");
      return;
    }
    if (nightLightButton) {
      const existing = activeSlot.innerHTML;
      activeSlot.innerHTML = `<span style="font-size:10px;color:#64748b">Loading NASA VIIRS impact…</span>`;
      try {
        const result = await fetchProjectNightLightImpact(activeProjectId, apiToken);
        activeSlot.innerHTML = existing + nightLightImpactHtml(result.impact);
      } catch (error) {
        activeSlot.innerHTML = existing + `<div style="margin-top:6px;font-size:10px;color:#b45309">${escapeHtml(error instanceof Error ? error.message : "Night-light impact is not available yet.")}</div>`;
      }
      return;
    }
    activeSlot.innerHTML = `<span style="font-size:10px;color:#64748b">Refreshing satellite imagery…</span>`;
    try {
      const result = await verifyProjectSatelliteImagery(activeProjectId, apiToken);
      activeSlot.innerHTML = verdictHtml(result);
    } catch (error) {
      activeSlot.innerHTML = errorHtml(error instanceof Error ? error.message : "Satellite check failed.");
    }
  });
}

function EsriSatelliteCanvas({
  projects,
  apiToken,
  sharedState,
}: {
  projects: ReaMapProjectRecord[];
  apiToken?: string;
  sharedState: ProjectMapSharedState;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletLayerGroup | null>(null);
  const leafletRef = useRef<LeafletApi | null>(null);
  const [loadError, setLoadError] = useState(false);
  const mappable = useMemo(() => projects.filter(validCoordinate), [projects]);

  useEffect(() => {
    let cancelled = false;
    if (!elementRef.current) return;
    ensureLeaflet()
      .then((L) => {
        if (cancelled || !elementRef.current) return;
        leafletRef.current = L;
        const map = L.map(elementRef.current, {
          zoomControl: true,
          minZoom: 5,
          maxZoom: 19,
          attributionControl: true,
          maxBounds: NIGERIA_MAX_BOUNDS,
          maxBoundsViscosity: 0.92,
        }).setView(projectMapSatelliteInitialView.center, projectMapSatelliteInitialView.zoom);
        map.setMaxBounds(NIGERIA_MAX_BOUNDS);
        L.tileLayer(SATELLITE_TILE_URL, { maxZoom: 19, attribution: "Tiles © Esri" }).addTo(map);
        markerLayerRef.current = L.layerGroup().addTo(map);
        map.on("popupclose", () => delete window.__veritasMapSelectedProjectId);
        map.on("popupopen", (event) => {
          const container = event.popup?.getElement?.();
          if (container) bindPopupControls(container, apiToken);
        });
        fetch("/nigeria-adm1.geojson")
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("Nigeria boundary request failed")))
          .then((data) => {
            if (cancelled) return;
            const rings = extractNigeriaRings(data);
            if (!rings.length) return;
            const worldRing = [[-85, -180], [-85, 180], [85, 180], [85, -180], [-85, -180]];
            L.polygon([worldRing, ...rings], {
              stroke: false,
              fillColor: "#06130d",
              fillOpacity: NIGERIA_MASK_OPACITY,
              fillRule: "evenodd",
              interactive: false,
            }).addTo(map);
          })
          .catch(() => undefined);
        mapRef.current = map;
        setLoadError(false);
        requestAnimationFrame(() => map.invalidateSize());
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
      delete window.__veritasMapSelectedProjectId;
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      leafletRef.current = null;
    };
  }, [apiToken]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const markerLayer = markerLayerRef.current;
    if (!L || !map || !markerLayer) return;
    markerLayer.clearLayers();
    if (!sharedState.layers.Projects) return;
    const points: Array<[number, number]> = [];
    mappable.forEach((project) => {
      const latitude = Number(project.latitude);
      const longitude = Number(project.longitude);
      points.push([latitude, longitude]);
      L.circleMarker([latitude, longitude], {
        radius: 6,
        color: "#ffffff",
        weight: 2,
        fillColor: markerColor(project, sharedState.layers.Status),
        fillOpacity: 0.96,
      })
        .bindPopup(popupHtml(project, sharedState))
        .on("click", () => {
          window.__veritasMapSelectedProjectId = project.id;
          map.setView([latitude, longitude], PROJECT_FOCUS_ZOOM);
        })
        .addTo(markerLayer);
    });
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 12 });
    if (points.length === 1) map.setView(points[0], PROJECT_FOCUS_ZOOM);
  }, [mappable, sharedState]);

  return (
    <div className="absolute inset-0 z-[15] bg-[#101812]" data-veritas-satellite-map="true">
      <div ref={elementRef} className="h-full w-full" />
      {loadError && (
        <div className="absolute inset-x-0 top-16 z-[500] mx-auto w-fit rounded-md border border-amber-200 bg-white px-4 py-2 text-[10px] font-bold text-amber-800 shadow-lg">
          Esri satellite imagery could not be loaded. Switch back to Map and retry.
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md bg-black/60 px-2 py-1 text-[8px] font-semibold text-white/90">
        Esri World Imagery · project pins use stored D1 GPS coordinates
      </div>
    </div>
  );
}

function GoogleSatelliteCanvas({
  projects,
  apiToken,
  sharedState,
}: {
  projects: ReaMapProjectRecord[];
  apiToken?: string;
  sharedState: ProjectMapSharedState;
}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const mapsRef = useRef<GoogleMapsApi | null>(null);
  const [loadError, setLoadError] = useState(false);
  const mappable = useMemo(() => projects.filter(validCoordinate), [projects]);

  useEffect(() => {
    let cancelled = false;
    if (!elementRef.current || !GOOGLE_MAPS_API_KEY) {
      setLoadError(true);
      return;
    }
    ensureGoogleMaps(GOOGLE_MAPS_API_KEY)
      .then((maps) => {
        if (cancelled || !elementRef.current) return;
        mapsRef.current = maps;
        mapRef.current = new maps.Map(elementRef.current, {
          center: { lat: projectMapSatelliteInitialView.center[0], lng: projectMapSatelliteInitialView.center[1] },
          zoom: projectMapSatelliteInitialView.zoom,
          mapTypeId: "satellite",
          minZoom: 5,
          maxZoom: 21,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          restriction: {
            latLngBounds: {
              south: NIGERIA_MAX_BOUNDS[0][0],
              west: NIGERIA_MAX_BOUNDS[0][1],
              north: NIGERIA_MAX_BOUNDS[1][0],
              east: NIGERIA_MAX_BOUNDS[1][1],
            },
            strictBounds: false,
          },
        });
        infoWindowRef.current = new maps.InfoWindow();
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
    return () => {
      cancelled = true;
      markersRef.current.forEach((marker) => marker.setMap?.(null));
      markersRef.current = [];
      infoWindowRef.current?.close?.();
      mapRef.current = null;
      mapsRef.current = null;
    };
  }, [apiToken]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    const infoWindow = infoWindowRef.current;
    if (!maps || !map || !infoWindow) return;
    markersRef.current.forEach((marker) => marker.setMap?.(null));
    markersRef.current = [];
    if (!sharedState.layers.Projects) return;

    const boundsPoints: Array<{ lat: number; lng: number }> = [];
    mappable.forEach((project) => {
      const latitude = Number(project.latitude);
      const longitude = Number(project.longitude);
      const position = { lat: latitude, lng: longitude };
      boundsPoints.push(position);
      const marker = new maps.Marker({
        map,
        position,
        title: project.name,
        icon: {
          path: 0,
          fillColor: markerColor(project, sharedState.layers.Status),
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
          scale: 7,
        },
      });
      marker.addListener("click", () => {
        window.__veritasMapSelectedProjectId = project.id;
        map.setCenter({ lat: latitude, lng: longitude });
        map.setZoom(PROJECT_FOCUS_ZOOM);
        infoWindow.setContent(popupHtml(project, sharedState));
        infoWindow.open({ map, anchor: marker });
        maps.event.addListenerOnce(infoWindow, "domready", () => {
          const slot = document.querySelector<HTMLElement>(`[data-satellite-verify-slot="${CSS.escape(project.id)}"]`);
          const container = slot?.parentElement;
          if (container) bindPopupControls(container, apiToken);
        });
      });
      markersRef.current.push(marker);
    });

    if (boundsPoints.length === 1) {
      map.setCenter(boundsPoints[0]);
      map.setZoom(PROJECT_FOCUS_ZOOM);
    } else if (boundsPoints.length > 1 && window.google?.maps) {
      const Bounds = (window.google.maps as any).LatLngBounds;
      if (Bounds) {
        const bounds = new Bounds();
        boundsPoints.forEach((point) => bounds.extend(point));
        map.fitBounds(bounds, 36);
      }
    }
  }, [mappable, sharedState, apiToken]);

  return (
    <div className="absolute inset-0 z-[15] bg-[#101812]" data-veritas-google-satellite-map="true">
      <div ref={elementRef} className="h-full w-full" />
      {loadError && (
        <div className="absolute inset-x-0 top-16 z-[500] mx-auto w-fit max-w-[440px] rounded-md border border-amber-200 bg-white px-4 py-2 text-center text-[10px] font-bold text-amber-800 shadow-lg">
          Google Satellite is unavailable. Configure the restricted VITE_GOOGLE_MAPS_API_KEY / GOOGLE_MAPS_API_KEY deployment secret, or use Esri.
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md bg-black/60 px-2 py-1 text-[8px] font-semibold text-white/90">
        Google Satellite · project pins use the same stored D1 GPS coordinates
      </div>
    </div>
  );
}

export default function ProjectMapSatelliteEnhancer() {
  const { session } = useAuth();
  const [mapShell, setMapShell] = useState<HTMLElement | null>(null);
  const [imageryProvider, setImageryProvider] = useState<"map" | "esri" | "google">("map");
  const [projects, setProjects] = useState<ReaMapProjectRecord[]>([]);
  const [sharedState, setSharedState] = useState<ProjectMapSharedState>(
    () => window.__veritasProjectMapState || defaultSharedState,
  );

  useEffect(() => {
    const locate = () => setMapShell(document.querySelector<HTMLElement>(MAP_SHELL_SELECTOR));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const receiveState = (event: Event) => {
      const detail = (event as CustomEvent<ProjectMapSharedState>).detail;
      if (detail?.filters && detail?.layers) setSharedState(detail);
    };
    window.addEventListener(PROJECT_MAP_STATE_EVENT, receiveState);
    if (window.__veritasProjectMapState) setSharedState(window.__veritasProjectMapState);
    return () => window.removeEventListener(PROJECT_MAP_STATE_EVENT, receiveState);
  }, []);

  useEffect(() => {
    if (imageryProvider === "map" || !session?.apiToken) return;
    let cancelled = false;
    fetchReaMapProjects(session.apiToken)
      .then((records) => { if (!cancelled) setProjects(records); })
      .catch(() => { if (!cancelled) setProjects([]); });
    return () => { cancelled = true; };
  }, [imageryProvider, session?.apiToken]);

  const filteredProjects = useMemo(
    () => filterProjectsByMapState(projects, sharedState),
    [projects, sharedState],
  );

  useEffect(() => {
    if (!mapShell) return;
    const zoomToolbar = mapShell.querySelector<HTMLDivElement>('button[aria-label="Zoom in"]')?.parentElement;
    if (zoomToolbar) zoomToolbar.style.display = imageryProvider === "map" ? "flex" : "none";
    return () => { if (zoomToolbar) zoomToolbar.style.display = "flex"; };
  }, [mapShell, imageryProvider]);

  useEffect(() => {
    if (!mapShell) setImageryProvider("map");
  }, [mapShell]);

  if (!mapShell) return null;
  const googleReady = Boolean(GOOGLE_MAPS_API_KEY);

  return createPortal(
    <>
      <div className="absolute right-4 top-4 z-[40] flex overflow-hidden rounded-2xl border border-[#d8e5dc] bg-white/95 p-1 shadow-[0_10px_26px_rgba(21,70,43,.10)] backdrop-blur" aria-label="Project map imagery mode">
        <button
          type="button"
          onClick={() => setImageryProvider("map")}
          className={`flex h-9 items-center gap-2 rounded-xl px-3 text-[10px] font-extrabold transition-all duration-200 ${imageryProvider === "map" ? "bg-[#e9f7ed] text-[#08733f] shadow-sm" : "text-slate-500 hover:bg-[#f5f8f6]"}`}
          aria-pressed={imageryProvider === "map"}
          title="Standard project map"
        >
          <MapIcon className="h-3.5 w-3.5" /> Map
        </button>
        <button
          type="button"
          onClick={() => setImageryProvider("esri")}
          className={`flex h-9 items-center gap-2 rounded-xl px-3 text-[10px] font-extrabold transition-all duration-200 ${imageryProvider === "esri" ? "bg-[#173b2a] text-white shadow-sm" : "text-slate-500 hover:bg-[#f5f8f6]"}`}
          aria-pressed={imageryProvider === "esri"}
          title="Esri World Imagery"
        >
          <Satellite className="h-3.5 w-3.5" /> Esri
        </button>
        <button
          type="button"
          onClick={() => googleReady && setImageryProvider("google")}
          disabled={!googleReady}
          className={`flex h-9 items-center gap-2 rounded-xl px-3 text-[10px] font-extrabold transition-all duration-200 ${imageryProvider === "google" ? "bg-[#173b2a] text-white shadow-sm" : googleReady ? "text-slate-500 hover:bg-[#f5f8f6]" : "cursor-not-allowed text-slate-300"}`}
          aria-pressed={imageryProvider === "google"}
          title={googleReady ? "Google Satellite" : "Google Satellite requires VITE_GOOGLE_MAPS_API_KEY"}
        >
          <Satellite className="h-3.5 w-3.5" /> Google
        </button>
      </div>

      {imageryProvider === "esri" && (
        <EsriSatelliteCanvas projects={filteredProjects} apiToken={session?.apiToken} sharedState={sharedState} />
      )}
      {imageryProvider === "google" && (
        <GoogleSatelliteCanvas projects={filteredProjects} apiToken={session?.apiToken} sharedState={sharedState} />
      )}
      {imageryProvider !== "map" && (
        <div className="pointer-events-none absolute left-4 top-[72px] z-[40] hidden items-center gap-2 rounded-xl border border-white/20 bg-[#173b2a]/88 px-3 py-2 text-[9px] font-bold text-white shadow-lg backdrop-blur sm:flex">
          <Layers3 className="h-3 w-3" />
          {filteredProjects.length.toLocaleString()} filtered project{filteredProjects.length === 1 ? "" : "s"} · same Project Map filters/layers
        </div>
      )}
    </>,
    mapShell,
  );
}
