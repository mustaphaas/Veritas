import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers3, Map as MapIcon, Satellite } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchReaMapProjects, type ReaMapProjectRecord } from "../lib/rea-project-map-data";

export const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MAPBOX_ACCESS_TOKEN = String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "").trim();
const MAPBOX_TILE_URL = MAPBOX_ACCESS_TOKEN
  ? `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_ACCESS_TOKEN}`
  : "";

export const projectMapSatelliteInitialView = {
  center: [9.08, 8.68] as [number, number],
  zoom: 6,
};

export const PROJECT_FOCUS_ZOOM = 18;

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const MAP_SHELL_SELECTOR = ".veritas-map-canvas";
const NIGERIA_MAX_BOUNDS = [[3.2, 2.0], [14.9, 15.2]];

type ImageryProvider = "esri" | "mapbox";
type LayerKey = "Projects" | "Status" | "Inspections" | "Contractors" | "Critical Findings" | "Corrective Actions" | "Coverage Density";
type SharedMapState = {
  programme: string;
  component: string;
  contractor: string;
  state: string;
  lga: string;
  search: string;
  layers: Record<LayerKey, boolean>;
};

const DEFAULT_SHARED_STATE: SharedMapState = {
  programme: "All Programmes",
  component: "All Components",
  contractor: "All Contractors",
  state: "All States",
  lga: "All LGAs",
  search: "",
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

type LeafletLayer = {
  addTo: (map: LeafletMap) => LeafletLayer;
};
type LeafletTileLayer = LeafletLayer & { remove: () => void };
type LeafletLayerGroup = LeafletLayer & { clearLayers: () => void };
type LeafletMap = {
  remove: () => void;
  removeLayer: (layer: LeafletLayer) => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
  setMaxBounds: (bounds: unknown) => void;
  setView: (center: [number, number], zoom: number) => LeafletMap;
};
type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (target: LeafletMap | LeafletLayerGroup) => LeafletMarker;
};
type LeafletApi = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, options?: Record<string, unknown>) => LeafletTileLayer;
  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  polygon: (latlngs: unknown, options?: Record<string, unknown>) => LeafletLayer;
  layerGroup: () => LeafletLayerGroup;
  latLngBounds: (latlngs: Array<[number, number]>) => unknown;
};

declare global {
  interface Window {
    L?: LeafletApi;
    __veritasLeafletPromise?: Promise<LeafletApi>;
  }
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

function validCoordinate(record: ReaMapProjectRecord) {
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function programmeMarkerColor(programme: string) {
  if (programme === "NEP") return "#128149";
  if (programme === "DARES") return "#2563eb";
  if (programme === "AMP") return "#f59e0b";
  return "#64748b";
}

function markerColor(record: ReaMapProjectRecord, showStatus = true) {
  if (!showStatus) return programmeMarkerColor(record.programme);
  if (record.verified === true || Number(record.verified) === 1) return "#159254";
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

function readLabeledSelect(label: string) {
  const labels = Array.from(document.querySelectorAll("label"));
  const owner = labels.find((node) => node.textContent?.includes(label));
  return owner?.querySelector("select")?.value;
}

function readSharedMapState(previous: SharedMapState): SharedMapState {
  const search = document.querySelector<HTMLInputElement>('input[placeholder="Search project ID or name"]');
  const layers = { ...previous.layers };
  document.querySelectorAll<HTMLButtonElement>('button[aria-pressed]').forEach((button) => {
    const text = button.textContent?.trim() as LayerKey | undefined;
    if (text && text in layers) layers[text] = button.getAttribute("aria-pressed") === "true";
  });
  return {
    programme: readLabeledSelect("Programme") ?? previous.programme,
    component: readLabeledSelect("Component") ?? previous.component,
    contractor: readLabeledSelect("Contractor") ?? previous.contractor,
    state: readLabeledSelect("State") ?? previous.state,
    lga: readLabeledSelect("Local Government") ?? previous.lga,
    search: search?.value ?? previous.search,
    layers,
  };
}

function filterProjects(projects: ReaMapProjectRecord[], sharedState: SharedMapState) {
  const query = sharedState.search.trim().toLowerCase();
  return projects.filter((project) => {
    const text = `${project.id} ${project.name} ${project.state} ${project.lga} ${project.community} ${project.contractor}`.toLowerCase();
    return (
      (sharedState.programme === "All Programmes" || project.programme === sharedState.programme) &&
      (sharedState.component === "All Components" || project.component === sharedState.component) &&
      (sharedState.contractor === "All Contractors" || project.contractor === sharedState.contractor) &&
      (sharedState.state === "All States" || project.state === sharedState.state) &&
      (sharedState.lga === "All LGAs" || project.lga === sharedState.lga) &&
      (!query || text.includes(query))
    );
  });
}

function renderSatelliteMarkers(L: LeafletApi, layer: LeafletLayerGroup, projects: ReaMapProjectRecord[], sharedState: SharedMapState) {
  layer.clearLayers();
  if (!sharedState.layers.Projects) return;
  projects.forEach((project) => {
    const latitude = Number(project.latitude);
    const longitude = Number(project.longitude);
    const details = [
      `<strong>${escapeHtml(project.name)}</strong>`,
      `<span style="font-size:11px;color:#64748b">${escapeHtml(project.community || project.lga || project.state)}</span>`,
      `<span style="font-size:11px;color:#08733f;font-weight:700">${escapeHtml(project.programme)} · ${escapeHtml(project.status)}</span>`,
      `<span style="font-size:11px;color:#475569">${Number(project.installedCapacityKw || 0).toLocaleString()} kW · ${Number(project.households || 0).toLocaleString()} households</span>`,
    ];
    if (sharedState.layers.Contractors) details.push(`<span style="font-size:11px;color:#475569">Contractor: ${escapeHtml(project.contractor)}</span>`);
    if (sharedState.layers.Inspections) details.push(`<span style="font-size:11px;color:#475569">Verification: ${project.verified === true || Number(project.verified) === 1 ? "Verified" : "Pending"}</span>`);
    L.circleMarker([latitude, longitude], {
      radius: 6,
      color: "#ffffff",
      weight: 2,
      fillColor: markerColor(project, sharedState.layers.Status),
      fillOpacity: 0.96,
    }).bindPopup(`<div style="min-width:210px;font-family:system-ui,sans-serif;display:grid;gap:4px">${details.join("")}</div>`).addTo(layer);
  });
}

function makeTileLayer(L: LeafletApi, provider: ImageryProvider) {
  if (provider === "mapbox" && MAPBOX_TILE_URL) {
    return L.tileLayer(MAPBOX_TILE_URL, {
      maxZoom: 22,
      maxNativeZoom: 22,
      attribution: "© Mapbox © OpenStreetMap",
    });
  }
  return L.tileLayer(SATELLITE_TILE_URL, {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: "Tiles © Esri",
  });
}

function SatelliteCanvas({ projects, sharedState, imageryProvider }: { projects: ReaMapProjectRecord[]; sharedState: SharedMapState; imageryProvider: ImageryProvider }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const leafletRef = useRef<LeafletApi | null>(null);
  const markerLayerRef = useRef<LeafletLayerGroup | null>(null);
  const tileLayerRef = useRef<LeafletTileLayer | null>(null);
  const [loadError, setLoadError] = useState(false);
  const mappable = useMemo(() => filterProjects(projects, sharedState).filter(validCoordinate), [projects, sharedState]);

  useEffect(() => {
    let cancelled = false;
    const element = elementRef.current;
    if (!element) return;
    ensureLeaflet().then((L) => {
      if (cancelled || !elementRef.current) return;
      const map = L.map(elementRef.current, {
        zoomControl: true,
        minZoom: 5,
        maxZoom: 22,
        attributionControl: true,
        maxBounds: NIGERIA_MAX_BOUNDS,
        maxBoundsViscosity: 0.92,
      }).setView(projectMapSatelliteInitialView.center, projectMapSatelliteInitialView.zoom);
      map.setMaxBounds(NIGERIA_MAX_BOUNDS);
      leafletRef.current = L;
      mapRef.current = map;
      tileLayerRef.current = makeTileLayer(L, imageryProvider).addTo(map) as LeafletTileLayer;

      fetch("/nigeria-adm1.geojson")
        .then((response) => {
          if (!response.ok) throw new Error("Nigeria boundary request failed");
          return response.json();
        })
        .then((data) => {
          if (cancelled) return;
          const features = Array.isArray(data?.features) ? data.features : [];
          const nigeriaRings = features.flatMap((feature: any) => {
            const geometry = feature?.geometry;
            if (!geometry || !Array.isArray(geometry.coordinates)) return [];
            const rings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.type === "MultiPolygon" ? geometry.coordinates.map((polygon: any) => polygon[0]) : [];
            return rings.filter(Array.isArray).map((ring: any[]) => ring.map(([longitude, latitude]) => [latitude, longitude]));
          });
          if (!nigeriaRings.length) return;
          const worldRing = [[-85, -180], [-85, 180], [85, 180], [85, -180], [-85, -180]];
          L.polygon([worldRing, ...nigeriaRings], {
            stroke: false,
            fillColor: "#06130d",
            fillOpacity: 0.58,
            fillRule: "evenodd",
            interactive: false,
          }).addTo(map);
        })
        .catch(() => undefined);

      const markerLayer = L.layerGroup().addTo(map);
      markerLayerRef.current = markerLayer;
      renderSatelliteMarkers(L, markerLayer, mappable, sharedState);
      if (mappable.length > 1) {
        map.fitBounds(L.latLngBounds(mappable.map((project) => [Number(project.latitude), Number(project.longitude)])), { padding: [36, 36], maxZoom: 12 });
      }
      setLoadError(false);
      requestAnimationFrame(() => map.invalidateSize());
    }).catch(() => setLoadError(true));

    return () => {
      cancelled = true;
      markerLayerRef.current = null;
      tileLayerRef.current = null;
      leafletRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    tileLayerRef.current = makeTileLayer(L, imageryProvider).addTo(map) as LeafletTileLayer;
  }, [imageryProvider]);

  useEffect(() => {
    const L = leafletRef.current;
    const layer = markerLayerRef.current;
    if (!L || !layer) return;
    renderSatelliteMarkers(L, layer, mappable, sharedState);
  }, [mappable, sharedState]);

  return (
    <div className="absolute inset-0 z-[15] bg-[#101812]" data-veritas-satellite-map="true">
      <div ref={elementRef} className="h-full w-full" />
      {loadError && (
        <div className="absolute inset-x-0 top-16 z-[500] mx-auto w-fit rounded-md border border-amber-200 bg-white px-4 py-2 text-[10px] font-bold text-amber-800 shadow-lg">
          Satellite imagery could not be loaded. Switch back to Map and retry.
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md bg-black/60 px-2 py-1 text-[8px] font-semibold text-white/90">
        {imageryProvider === "mapbox" ? "Mapbox" : "Esri"} satellite · project pins use stored D1 GPS coordinates
      </div>
    </div>
  );
}

export default function ProjectMapSatelliteEnhancer() {
  const { session } = useAuth();
  const [mapShell, setMapShell] = useState<HTMLElement | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [projects, setProjects] = useState<ReaMapProjectRecord[]>([]);
  const [sharedState, setSharedState] = useState<SharedMapState>(DEFAULT_SHARED_STATE);
  const [imageryProvider, setImageryProvider] = useState<ImageryProvider>(() => {
    const saved = localStorage.getItem("veritas-satellite-provider");
    return saved === "mapbox" && MAPBOX_ACCESS_TOKEN ? "mapbox" : "esri";
  });

  useEffect(() => {
    const locate = () => setMapShell(document.querySelector<HTMLElement>(MAP_SHELL_SELECTOR));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!satellite || !session?.apiToken) return;
    let cancelled = false;
    fetchReaMapProjects(session.apiToken)
      .then((records) => {
        if (!cancelled) setProjects(records);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => { cancelled = true; };
  }, [satellite, session?.apiToken]);

  useEffect(() => {
    if (!satellite || !mapShell) return;
    const sync = () => setSharedState((current) => {
      const next = readSharedMapState(current);
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(mapShell, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
    document.addEventListener("input", sync, true);
    document.addEventListener("change", sync, true);
    document.addEventListener("click", sync, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("input", sync, true);
      document.removeEventListener("change", sync, true);
      document.removeEventListener("click", sync, true);
    };
  }, [mapShell, satellite]);

  useEffect(() => {
    if (!mapShell) return;
    const zoomToolbar = mapShell.querySelector<HTMLDivElement>('button[aria-label="Zoom in"]')?.parentElement;
    if (zoomToolbar) zoomToolbar.style.display = satellite ? "none" : "flex";
    return () => { if (zoomToolbar) zoomToolbar.style.display = "flex"; };
  }, [mapShell, satellite]);

  useEffect(() => { if (!mapShell) setSatellite(false); }, [mapShell]);
  useEffect(() => { localStorage.setItem("veritas-satellite-provider", imageryProvider); }, [imageryProvider]);

  if (!mapShell) return null;

  return createPortal(
    <>
      <div className="absolute right-4 top-4 z-[40] flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" aria-label="Project map imagery mode">
        <button type="button" onClick={() => setSatellite(false)} className={`flex h-9 items-center gap-1.5 px-3 text-[10px] font-extrabold transition ${!satellite ? "bg-[#edf8f0] text-[#08733f]" : "text-slate-500 hover:bg-slate-50"}`} aria-pressed={!satellite} title="Standard project map">
          <MapIcon className="h-3.5 w-3.5" /> Map
        </button>
        <button type="button" onClick={() => setSatellite(true)} className={`flex h-9 items-center gap-1.5 border-l border-slate-200 px-3 text-[10px] font-extrabold transition ${satellite ? "bg-[#173b2a] text-white" : "text-slate-500 hover:bg-slate-50"}`} aria-pressed={satellite} title="Satellite imagery">
          <Satellite className="h-3.5 w-3.5" /> Satellite
        </button>
      </div>
      {satellite && (
        <div className="absolute right-4 top-14 z-[41] flex overflow-hidden rounded-md border border-white/20 bg-white shadow-sm" aria-label="Satellite imagery provider">
          <button type="button" onClick={() => setImageryProvider("esri")} className={`h-8 px-3 text-[9px] font-extrabold ${imageryProvider === "esri" ? "bg-[#173b2a] text-white" : "text-slate-600 hover:bg-slate-50"}`} aria-pressed={imageryProvider === "esri"}>Esri</button>
          <button type="button" onClick={() => MAPBOX_ACCESS_TOKEN && setImageryProvider("mapbox")} disabled={!MAPBOX_ACCESS_TOKEN} title={MAPBOX_ACCESS_TOKEN ? "Mapbox Satellite" : "Add MAPBOX_ACCESS_TOKEN to enable Mapbox"} className={`h-8 border-l border-slate-200 px-3 text-[9px] font-extrabold ${imageryProvider === "mapbox" ? "bg-[#173b2a] text-white" : MAPBOX_ACCESS_TOKEN ? "text-slate-600 hover:bg-slate-50" : "cursor-not-allowed text-slate-300"}`} aria-pressed={imageryProvider === "mapbox"}>Mapbox</button>
        </div>
      )}
      {satellite && <SatelliteCanvas projects={projects} sharedState={sharedState} imageryProvider={imageryProvider} />}
      {satellite && (
        <div className="pointer-events-none absolute left-4 top-16 z-[40] hidden items-center gap-1.5 rounded-md border border-white/20 bg-[#173b2a]/85 px-2.5 py-1.5 text-[9px] font-bold text-white shadow-sm backdrop-blur sm:flex">
          <Layers3 className="h-3 w-3" /> Scroll or pinch to zoom · drag to pan
        </div>
      )}
    </>,
    mapShell,
  );
}
