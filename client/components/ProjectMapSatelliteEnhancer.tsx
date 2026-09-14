import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Layers3, Map as MapIcon, Satellite } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchReaMapProjects, type ReaMapProjectRecord } from "../lib/rea-project-map-data";

export const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const projectMapSatelliteInitialView = {
  center: [9.08, 8.68] as [number, number],
  zoom: 6,
};

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const MAP_SHELL_SELECTOR = ".veritas-map-canvas";

const layerNames = [
  "Projects",
  "Status",
  "Inspections",
  "Contractors",
  "Critical Findings",
  "Corrective Actions",
  "Coverage Density",
] as const;

type SharedLayers = Record<(typeof layerNames)[number], boolean>;

type SharedMapState = {
  programme: string;
  component: string;
  contractor: string;
  state: string;
  lga: string;
  search: string;
  layers: SharedLayers;
};

const defaultSharedState: SharedMapState = {
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

type LeafletMap = {
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
};

type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (map: LeafletMap) => LeafletMarker;
};

type LeafletApi = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap & {
    setView: (center: [number, number], zoom: number) => LeafletMap;
  };
  tileLayer: (url: string, options?: Record<string, unknown>) => {
    addTo: (map: LeafletMap) => unknown;
  };
  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
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

function programmeColor(programme: string) {
  if (programme === "NEP") return "#128149";
  if (programme === "DARES") return "#2563eb";
  if (programme === "AMP") return "#f59e0b";
  return "#64748b";
}

function markerColor(record: ReaMapProjectRecord, showStatus: boolean) {
  if (!showStatus) return programmeColor(record.programme);
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

function findSelectValue(root: HTMLElement, labelText: string, fallback: string) {
  const labels = Array.from(root.querySelectorAll("label"));
  const label = labels.find((candidate) =>
    Array.from(candidate.querySelectorAll("span")).some((span) => span.textContent?.trim() === labelText),
  );
  return label?.querySelector("select")?.value || fallback;
}

function readLayerState(root: HTMLElement, layer: keyof SharedLayers, fallback: boolean) {
  const button = Array.from(root.querySelectorAll("button")).find((candidate) =>
    Array.from(candidate.querySelectorAll(":scope > span")).some((span) => span.textContent?.trim() === layer),
  );
  if (!button) return fallback;
  const knob = button.querySelector("i");
  if (!knob) return fallback;
  return knob.className.includes("left-3.5");
}

function readSharedState(root: HTMLElement, previous: SharedMapState): SharedMapState {
  const searchInput = root.querySelector<HTMLInputElement>('input[placeholder="Search project ID or name"]');
  const layers = { ...previous.layers };
  layerNames.forEach((layer) => {
    layers[layer] = readLayerState(root, layer, previous.layers[layer]);
  });

  return {
    programme: findSelectValue(root, "Programme", previous.programme || "All Programmes"),
    component: findSelectValue(root, "Component", previous.component || "All Components"),
    contractor: findSelectValue(root, "Contractor", previous.contractor || "All Contractors"),
    state: findSelectValue(root, "State", previous.state || "All States"),
    lga: findSelectValue(root, "Local Government", previous.lga || "All LGAs"),
    search: searchInput?.value ?? previous.search,
    layers,
  };
}

function sameSharedState(a: SharedMapState, b: SharedMapState) {
  return (
    a.programme === b.programme &&
    a.component === b.component &&
    a.contractor === b.contractor &&
    a.state === b.state &&
    a.lga === b.lga &&
    a.search === b.search &&
    layerNames.every((layer) => a.layers[layer] === b.layers[layer])
  );
}

function filterProjects(projects: ReaMapProjectRecord[], state: SharedMapState) {
  const query = state.search.trim().toLowerCase();
  return projects.filter((project) =>
    (state.programme === "All Programmes" || project.programme === state.programme) &&
    (state.component === "All Components" || project.component === state.component) &&
    (state.contractor === "All Contractors" || project.contractor === state.contractor) &&
    (state.state === "All States" || project.state === state.state) &&
    (state.lga === "All LGAs" || project.lga === state.lga) &&
    (!query || `${project.id} ${project.name} ${project.state} ${project.lga} ${project.contractor}`.toLowerCase().includes(query)),
  );
}

function SatelliteCanvas({ projects, sharedState }: { projects: ReaMapProjectRecord[]; sharedState: SharedMapState }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [loadError, setLoadError] = useState(false);

  const filteredProjects = useMemo(() => filterProjects(projects, sharedState), [projects, sharedState]);
  const mappable = useMemo(() => filteredProjects.filter(validCoordinate), [filteredProjects]);
  const verifiedCount = filteredProjects.filter((project) => project.verified === true || Number(project.verified) === 1).length;
  const capacityKw = filteredProjects.reduce((sum, project) => sum + Number(project.installedCapacityKw || 0), 0);
  const households = filteredProjects.reduce((sum, project) => sum + Number(project.households || 0), 0);

  useEffect(() => {
    let cancelled = false;
    const element = elementRef.current;
    if (!element) return;

    ensureLeaflet()
      .then((L) => {
        if (cancelled || !elementRef.current) return;
        const map = L.map(elementRef.current, {
          zoomControl: true,
          minZoom: 5,
          maxZoom: 19,
          attributionControl: true,
        }).setView(projectMapSatelliteInitialView.center, projectMapSatelliteInitialView.zoom);

        L.tileLayer(SATELLITE_TILE_URL, {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }).addTo(map);

        const points: Array<[number, number]> = [];
        if (sharedState.layers.Projects) {
          mappable.forEach((project) => {
            const latitude = Number(project.latitude);
            const longitude = Number(project.longitude);
            points.push([latitude, longitude]);
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
            })
              .bindPopup(`<div style="min-width:210px;font-family:system-ui,sans-serif;display:grid;gap:4px">${details.join("")}</div>`)
              .addTo(map);
          });
        }

        if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 12 });
        mapRef.current = map;
        setLoadError(false);
        requestAnimationFrame(() => map.invalidateSize());
      })
      .catch(() => setLoadError(true));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mappable, sharedState.layers.Contractors, sharedState.layers.Inspections, sharedState.layers.Projects, sharedState.layers.Status]);

  return (
    <div className="absolute inset-0 z-[15] bg-[#101812]" data-veritas-satellite-map="true">
      <div ref={elementRef} className="h-full w-full" />
      <div className="pointer-events-none absolute left-4 top-16 z-[500] flex flex-wrap gap-2">
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{filteredProjects.length.toLocaleString()} Projects</span>
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{verifiedCount.toLocaleString()} Verified</span>
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{(capacityKw / 1000).toFixed(1)} MW</span>
        <span className="rounded-md border border-white/20 bg-[#173b2a]/90 px-2.5 py-1.5 text-[9px] font-extrabold text-white shadow-sm backdrop-blur">{households.toLocaleString()} Households</span>
      </div>
      {loadError && (
        <div className="absolute inset-x-0 top-28 z-[500] mx-auto w-fit rounded-md border border-amber-200 bg-white px-4 py-2 text-[10px] font-bold text-amber-800 shadow-lg">
          Satellite imagery could not be loaded. Switch back to Map and retry.
        </div>
      )}
      {!sharedState.layers.Projects && (
        <div className="absolute inset-x-0 bottom-14 z-[500] mx-auto w-fit rounded-md border border-white/20 bg-black/65 px-3 py-2 text-[10px] font-bold text-white shadow-lg">
          Project locations are hidden by the Projects layer toggle.
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md bg-black/60 px-2 py-1 text-[8px] font-semibold text-white/90">
        Satellite imagery · filters and layers synchronized with Project Map
      </div>
    </div>
  );
}

export default function ProjectMapSatelliteEnhancer() {
  const { session } = useAuth();
  const [mapShell, setMapShell] = useState<HTMLElement | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [projects, setProjects] = useState<ReaMapProjectRecord[]>([]);
  const [sharedState, setSharedState] = useState<SharedMapState>(defaultSharedState);

  useEffect(() => {
    const locate = () => setMapShell(document.querySelector<HTMLElement>(MAP_SHELL_SELECTOR));
    locate();
    const observer = new MutationObserver(locate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mapShell) return;
    const root = mapShell.closest<HTMLElement>(".fixed.bottom-0.left-0.right-0") ?? mapShell.parentElement ?? mapShell;
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setSharedState((previous) => {
          const next = readSharedState(root, previous);
          return sameSharedState(previous, next) ? previous : next;
        });
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { childList: true, subtree: true, attributes: true, characterData: true });
    root.addEventListener("input", sync, true);
    root.addEventListener("change", sync, true);
    root.addEventListener("click", sync, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      root.removeEventListener("input", sync, true);
      root.removeEventListener("change", sync, true);
      root.removeEventListener("click", sync, true);
    };
  }, [mapShell]);

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
    return () => {
      cancelled = true;
    };
  }, [satellite, session?.apiToken]);

  useEffect(() => {
    if (!mapShell) return;
    const zoomToolbar = mapShell.querySelector<HTMLDivElement>('button[aria-label="Zoom in"]')?.parentElement;
    if (zoomToolbar) zoomToolbar.style.display = satellite ? "none" : "flex";
    return () => {
      if (zoomToolbar) zoomToolbar.style.display = "flex";
    };
  }, [mapShell, satellite]);

  useEffect(() => {
    if (!mapShell) setSatellite(false);
  }, [mapShell]);

  if (!mapShell) return null;

  return createPortal(
    <>
      <div className="absolute right-4 top-4 z-[40] flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" aria-label="Project map imagery mode">
        <button
          type="button"
          onClick={() => setSatellite(false)}
          className={`flex h-9 items-center gap-1.5 px-3 text-[10px] font-extrabold transition ${!satellite ? "bg-[#edf8f0] text-[#08733f]" : "text-slate-500 hover:bg-slate-50"}`}
          aria-pressed={!satellite}
          title="Standard project map"
        >
          <MapIcon className="h-3.5 w-3.5" /> Map
        </button>
        <button
          type="button"
          onClick={() => setSatellite(true)}
          className={`flex h-9 items-center gap-1.5 border-l border-slate-200 px-3 text-[10px] font-extrabold transition ${satellite ? "bg-[#173b2a] text-white" : "text-slate-500 hover:bg-slate-50"}`}
          aria-pressed={satellite}
          title="Satellite imagery"
        >
          <Satellite className="h-3.5 w-3.5" /> Satellite
        </button>
      </div>
      {satellite && <SatelliteCanvas projects={projects} sharedState={sharedState} />}
      {satellite && (
        <div className="pointer-events-none absolute left-4 top-4 z-[40] hidden items-center gap-1.5 rounded-md border border-white/20 bg-[#173b2a]/85 px-2.5 py-1.5 text-[9px] font-bold text-white shadow-sm backdrop-blur sm:flex">
          <Layers3 className="h-3 w-3" /> Scroll or pinch to zoom · drag to pan
        </div>
      )}
    </>,
    mapShell,
  );
}
