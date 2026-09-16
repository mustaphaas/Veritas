import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, History, Layers3, Loader2, Map as MapIcon, Satellite, ScanSearch, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchReaMapProjects, type ReaMapProjectRecord } from "../lib/rea-project-map-data";
import {
  compareSatelliteImagery,
  fetchSatelliteAnalyses,
  runSatelliteAnalysis,
  type SatelliteAnalysisRecord,
} from "../lib/satellite-intelligence";

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

function SatelliteCanvas({ projects, onSelectProject }: { projects: ReaMapProjectRecord[]; onSelectProject: (project: ReaMapProjectRecord) => void }) {
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
              `<div style="min-width:180px;font-family:system-ui,sans-serif"><strong>${escapeHtml(project.name)}</strong><br/><span style="font-size:11px;color:#64748b">${escapeHtml(project.community || project.lga || project.state)}</span><br/><span style="font-size:11px;color:#08733f;font-weight:700">${escapeHtml(project.programme)} · ${escapeHtml(project.status)}</span><br/><span style="font-size:10px;color:#475569">Click for Satellite Intelligence</span></div>`,
            )
            .on("click", () => {
              map.setView([latitude, longitude], PROJECT_FOCUS_ZOOM);
              onSelectProject(project);
            })
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
  }, [mappable, onSelectProject]);

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

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function SatelliteIntelligencePanel({ project, apiToken, canAnalyse, onClose }: {
  project: ReaMapProjectRecord;
  apiToken: string;
  canAnalyse: boolean;
  onClose: () => void;
}) {
  const [analyses, setAnalyses] = useState<SatelliteAnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<"current" | "historical" | null>(null);
  const [error, setError] = useState("");

  const reload = async () => {
    setLoading(true);
    try {
      setAnalyses(await fetchSatelliteAnalyses(apiToken, project.id));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load satellite analysis history.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, [project.id, apiToken]);
  const latest = analyses[0];

  const run = async (kind: "current" | "historical") => {
    setRunning(kind);
    setError("");
    try {
      const record = kind === "current"
        ? await runSatelliteAnalysis(apiToken, project.id)
        : await compareSatelliteImagery(apiToken, project.id);
      setAnalyses((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Satellite analysis failed.");
    } finally {
      setRunning(null);
    }
  };

  return (
    <aside className="absolute bottom-4 right-4 top-16 z-[520] flex w-[min(390px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-white/30 bg-white/95 shadow-2xl backdrop-blur">
      <div className="flex items-start justify-between border-b border-slate-100 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[#08733f]"><ScanSearch className="h-4 w-4"/><span className="text-[10px] font-extrabold uppercase tracking-[0.16em]">Satellite Intelligence</span></div>
          <h3 className="mt-1 truncate text-sm font-extrabold text-[#173b2a]">{project.name}</h3>
          <p className="mt-1 text-[10px] text-slate-500">Authoritative D1 coordinates · {Number(project.latitude).toFixed(6)}, {Number(project.longitude).toFixed(6)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close satellite intelligence"><X className="h-4 w-4"/></button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {canAnalyse && (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={Boolean(running)} onClick={() => void run("current")} className="flex items-center justify-center gap-1.5 rounded-lg bg-[#08733f] px-3 py-2 text-[10px] font-extrabold text-white disabled:opacity-60">
              {running === "current" ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <ScanSearch className="h-3.5 w-3.5"/>} Analyse latest imagery
            </button>
            <button type="button" disabled={Boolean(running)} onClick={() => void run("historical")} className="flex items-center justify-center gap-1.5 rounded-lg border border-[#08733f]/20 bg-emerald-50 px-3 py-2 text-[10px] font-extrabold text-[#08733f] disabled:opacity-60">
              {running === "historical" ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <History className="h-3.5 w-3.5"/>} Compare historical imagery
            </button>
          </div>
        )}

        {error && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-semibold text-amber-800">{error}</div>}
        {loading && <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-[10px] font-semibold text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin"/>Loading analysis history…</div>}

        {!loading && !latest && (
          <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center">
            <Satellite className="mx-auto h-5 w-5 text-slate-400"/>
            <p className="mt-2 text-xs font-bold text-slate-700">No satellite analysis yet</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">Map imagery remains available. Run an analysis to create an auditable AI-assisted finding.</p>
          </div>
        )}

        {latest && (
          <>
            {latest.reviewRequired && (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><div><p className="text-[10px] font-extrabold">Manual review required</p><p className="mt-0.5 text-[9px] leading-4">Satellite findings support REA review and never automatically verify or reject a project.</p></div></div>
            )}
            <section className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-[10px]">
                <div><p className="font-bold uppercase text-slate-400">Provider</p><p className="mt-0.5 font-semibold text-slate-700">{latest.provider}</p></div>
                <div><p className="font-bold uppercase text-slate-400">Confidence</p><p className="mt-0.5 font-semibold capitalize text-slate-700">{latest.confidenceLevel} · {latest.confidenceScore}%</p></div>
                <div><p className="font-bold uppercase text-slate-400">Release date</p><p className="mt-0.5 font-semibold text-slate-700">{formatDate(latest.comparisonReleaseDate || latest.baselineReleaseDate)}</p></div>
                <div><p className="font-bold uppercase text-slate-400">Capture date</p><p className="mt-0.5 font-semibold text-slate-700">{formatDate(latest.comparisonImageDate || latest.baselineImageDate)}</p></div>
              </div>
              <p className="mt-3 border-t border-slate-100 pt-3 text-[10px] leading-4 text-slate-600">{latest.observations?.summary || latest.change?.summary || "No narrative summary recorded."}</p>
              {latest.observations?.limitations?.length ? <div className="mt-2"><p className="text-[9px] font-extrabold uppercase text-slate-400">Limitations</p><ul className="mt-1 space-y-1 text-[9px] leading-4 text-slate-500">{latest.observations.limitations.slice(0, 4).map((item) => <li key={item}>• {item}</li>)}</ul></div> : null}
            </section>
          </>
        )}

        {analyses.length > 1 && (
          <section>
            <div className="mb-2 flex items-center gap-1.5"><History className="h-3.5 w-3.5 text-slate-400"/><h4 className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Analysis history</h4></div>
            <div className="space-y-2">{analyses.slice(1, 6).map((record) => <div key={record.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5"><div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold capitalize text-slate-600">{record.analysisType.replace("_", " ")}</span><span className="text-[9px] text-slate-400">{formatDate(record.createdAt)}</span></div><p className="mt-1 line-clamp-2 text-[9px] leading-4 text-slate-500">{record.observations?.summary || record.change?.summary || "Stored satellite finding"}</p></div>)}</div>
          </section>
        )}
      </div>
    </aside>
  );
}

export default function ProjectMapSatelliteEnhancer() {
  const { session } = useAuth();
  const [mapShell, setMapShell] = useState<HTMLElement | null>(null);
  const [satellite, setSatellite] = useState(false);
  const [projects, setProjects] = useState<ReaMapProjectRecord[]>([]);
  const [selectedSatelliteProject, setSelectedSatelliteProject] = useState<ReaMapProjectRecord | null>(null);

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
    if (!satellite) setSelectedSatelliteProject(null);
  }, [mapShell, satellite]);

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
      {satellite && <SatelliteCanvas projects={projects} onSelectProject={setSelectedSatelliteProject} />}
      {satellite && (
        <div className="pointer-events-none absolute left-4 top-16 z-[40] hidden items-center gap-1.5 rounded-md border border-white/20 bg-[#173b2a]/85 px-2.5 py-1.5 text-[9px] font-bold text-white shadow-sm backdrop-blur sm:flex">
          <Layers3 className="h-3 w-3" /> Scroll or pinch to zoom · drag to pan · select a project for AI analysis
        </div>
      )}
      {satellite && selectedSatelliteProject && session?.apiToken && (
        <SatelliteIntelligencePanel
          project={selectedSatelliteProject}
          apiToken={session.apiToken}
          canAnalyse={session.role === "rea"}
          onClose={() => setSelectedSatelliteProject(null)}
        />
      )}
    </>,
    mapShell,
  );
}
