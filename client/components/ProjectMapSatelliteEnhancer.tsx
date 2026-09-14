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

export const PROJECT_FOCUS_ZOOM = 18;
export const NIGERIA_MAX_BOUNDS = [[3.2, 2.0], [14.9, 15.2]] as [[number, number], [number, number]];
export const NIGERIA_MASK_OPACITY = 0.58;

const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const MAP_SHELL_SELECTOR = ".veritas-map-canvas";

type LeafletMap = {
  remove: () => void;
  invalidateSize: () => void;
  fitBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
  setMaxBounds: (bounds: unknown) => void;
};

type LeafletLayer = {
  addTo: (map: LeafletMap) => LeafletLayer;
};

type LeafletMarker = {
  bindPopup: (html: string) => LeafletMarker;
  addTo: (map: LeafletMap) => LeafletMarker;
  on: (event: string, handler: () => void) => LeafletMarker;
};

type LeafletApi = {
  map: (element: HTMLElement, options?: Record<string, unknown>) => LeafletMap & {
    setView: (center: [number, number], zoom: number) => LeafletMap;
  };
  tileLayer: (url: string, options?: Record<string, unknown>) => {
    addTo: (map: LeafletMap) => unknown;
  };
  circleMarker: (latlng: [number, number], options?: Record<string, unknown>) => LeafletMarker;
  polygon: (latlngs: unknown, options?: Record<string, unknown>) => LeafletLayer;
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

function markerColor(record: ReaMapProjectRecord) {
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

function SatelliteCanvas({ projects }: { projects: ReaMapProjectRecord[] }) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [loadError, setLoadError] = useState(false);

  const mappable = useMemo(() => projects.filter(validCoordinate), [projects]);

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
          maxBounds: NIGERIA_MAX_BOUNDS,
          maxBoundsViscosity: 0.92,
        }).setView(projectMapSatelliteInitialView.center, projectMapSatelliteInitialView.zoom);
        map.setMaxBounds(NIGERIA_MAX_BOUNDS);

        L.tileLayer(SATELLITE_TILE_URL, {
          maxZoom: 19,
          attribution: "Tiles © Esri",
        }).addTo(map);

        fetch("/nigeria-adm1.geojson")
          .then((response) => {
            if (!response.ok) throw new Error("Nigeria boundary request failed");
            return response.json();
          })
          .then((data) => {
            if (cancelled) return;
            const nigeriaRings = extractNigeriaRings(data);
            if (!nigeriaRings.length) return;
            const worldRing = [[-85, -180], [-85, 180], [85, 180], [85, -180], [-85, -180]];
            L.polygon([worldRing, ...nigeriaRings], {
              stroke: false,
              fillColor: "#06130d",
              fillOpacity: NIGERIA_MASK_OPACITY,
              fillRule: "evenodd",
              interactive: false,
            }).addTo(map);
          })
          .catch(() => undefined);

        const points: Array<[number, number]> = [];
        mappable.forEach((project) => {
          const latitude = Number(project.latitude);
          const longitude = Number(project.longitude);
          points.push([latitude, longitude]);
          L.circleMarker([latitude, longitude], {
            radius: 6,
            color: "#ffffff",
            weight: 2,
            fillColor: markerColor(project),
            fillOpacity: 0.96,
          })
            .bindPopup(
              `<div style="min-width:180px;font-family:system-ui,sans-serif"><strong>${escapeHtml(project.name)}</strong><br/><span style="font-size:11px;color:#64748b">${escapeHtml(project.community || project.lga || project.state)}</span><br/><span style="font-size:11px;color:#08733f;font-weight:700">${escapeHtml(project.programme)} · ${escapeHtml(project.status)}</span></div>`,
            )
            .on("click", () => map.setView([latitude, longitude], PROJECT_FOCUS_ZOOM))
            .addTo(map);
        });

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
  }, [mappable]);

  return (
    <div className="absolute inset-0 z-[15] bg-[#101812]" data-veritas-satellite-map="true">
      <div ref={elementRef} className="h-full w-full" />
      {loadError && (
        <div className="absolute inset-x-0 top-16 z-[500] mx-auto w-fit rounded-md border border-amber-200 bg-white px-4 py-2 text-[10px] font-bold text-amber-800 shadow-lg">
          Satellite imagery could not be loaded. Switch back to Map and retry.
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 right-3 z-[500] rounded-md bg-black/60 px-2 py-1 text-[8px] font-semibold text-white/90">
        Satellite imagery · project pins use stored D1 GPS coordinates
      </div>
    </div>
  );
}

export default function ProjectMapSatelliteEnhancer() {
  const { session } = useAuth();
  const [mapShell, setMapShell] = useState<HTMLElement | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [projects, setProjects] = useState<ReaMapProjectRecord[]>([]);

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
      {satellite && <SatelliteCanvas projects={projects} />}
      {satellite && (
        <div className="pointer-events-none absolute left-4 top-16 z-[40] hidden items-center gap-1.5 rounded-md border border-white/20 bg-[#173b2a]/85 px-2.5 py-1.5 text-[9px] font-bold text-white shadow-sm backdrop-blur sm:flex">
          <Layers3 className="h-3 w-3" /> Scroll or pinch to zoom · drag to pan
        </div>
      )}
    </>,
    mapShell,
  );
}
