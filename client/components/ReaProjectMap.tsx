import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Filter,
  Layers3,
  LocateFixed,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UsersRound,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { projects, type Project } from "../lib/dashboard-data";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};
type Point = { x: number; y: number };
type Projector = (coordinate: number[]) => Point;
type MapStatus =
  | "Verified"
  | "Active"
  | "Under Inspection"
  | "Pending Verification"
  | "At Risk"
  | "Planned";
type LayerKey =
  | "Projects"
  | "Status"
  | "Inspections"
  | "Contractors"
  | "Critical Findings"
  | "Corrective Actions"
  | "Coverage Density";
type MapProject = Project & {
  id: string;
  lga: string;
  community: string;
  projectType: string;
  mapStatus: MapStatus;
  phase: string;
  consultant: string;
  inspectionStatus: string;
  inspectionScore: number;
  progress: number;
  startDate: string;
  completionDate: string;
  beneficiaries: number;
  communities: number;
  findings: { critical: number; major: number; minor: number };
  openCorrectiveActions: number;
};
type FilterState = {
  state: string;
  lga: string;
  community: string;
  programme: string;
  component: string;
  type: string;
  status: string;
  phase: string;
  contractor: string;
  consultant: string;
  inspection: string;
  from: string;
  to: string;
};
type HoverInfo = {
  name: string;
  count: number;
  x: number;
  y: number;
  breakdown: Partial<Record<MapStatus, number>>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NATIONAL_VIEW = { width: 850, height: 525 };
const STATE_VIEW = { width: 920, height: 560 };
const LGA_SOURCE =
  "https://cdn.jsdelivr.net/gh/qedsoftware/geojson_data@main/nigeria-lga.geojson";
const densityPalette = ["#f1f5f2", "#dcece1", "#b7d9c1", "#78b98b", "#19844b"];
const statusColors: Record<MapStatus, string> = {
  Verified: "#159254",
  Active: "#2d78c4",
  "Under Inspection": "#d4a514",
  "Pending Verification": "#df7b22",
  "At Risk": "#c83d3d",
  Planned: "#8a95a3",
};
const statusOrder: MapStatus[] = [
  "Verified",
  "Active",
  "Under Inspection",
  "Pending Verification",
  "At Risk",
  "Planned",
];
const layerNames: LayerKey[] = [
  "Projects",
  "Status",
  "Inspections",
  "Contractors",
  "Critical Findings",
  "Corrective Actions",
  "Coverage Density",
];
const consultants = [
  "Northstar Engineering",
  "GreenLine Advisory",
  "Sahel Energy Partners",
  "GridWorks Consulting",
];
const defaultFilters: FilterState = {
  state: "All States",
  lga: "All LGAs",
  community: "All Communities",
  programme: "All Programmes",
  component: "All Components",
  type: "All Project Types",
  status: "All Statuses",
  phase: "All Phases",
  contractor: "All Contractors",
  consultant: "All Consultants",
  inspection: "All Inspection Statuses",
  from: "",
  to: "",
};

// Injected once. Keeps every animation in one place and keyed off small,
// composable classnames so the JSX below stays legible.
const MAP_STYLES = `
@keyframes vt-fade-poly { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
@keyframes vt-pop-in { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: scale(1); } }
@keyframes vt-drop-in { from { opacity: 0; transform: translateY(-6px) scale(0.6); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes vt-pulse-ring { 0% { transform: scale(0.55); opacity: 0.65; } 75% { opacity: 0; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes vt-panel-in { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
@keyframes vt-view-in { from { opacity: 0; transform: scale(0.985); } to { opacity: 1; transform: scale(1); } }
@keyframes vt-shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
@keyframes vt-bounce-in { 0% { opacity: 0; transform: translateY(6px); } 60% { opacity: 1; transform: translateY(-1px); } 100% { transform: translateY(0); } }
.vt-fade-poly { animation: vt-fade-poly 420ms cubic-bezier(0.22,1,0.36,1) backwards; transform-box: fill-box; transform-origin: center; }
.vt-pop-in { animation: vt-pop-in 380ms cubic-bezier(0.34,1.56,0.64,1) backwards; transform-box: fill-box; transform-origin: center; }
.vt-drop-in { animation: vt-drop-in 420ms cubic-bezier(0.34,1.56,0.64,1) backwards; transform-box: fill-box; transform-origin: center; }
.vt-pulse-ring { animation: vt-pulse-ring 1.9s ease-out infinite; transform-box: fill-box; transform-origin: center; }
.vt-panel-in { animation: vt-panel-in 340ms cubic-bezier(0.22,1,0.36,1) both; }
.vt-view-in { animation: vt-view-in 320ms cubic-bezier(0.22,1,0.36,1) both; }
.vt-bounce-in { animation: vt-bounce-in 460ms cubic-bezier(0.22,1,0.36,1) backwards; }
.vt-hoverable { transition: transform 180ms ease, filter 180ms ease, opacity 180ms ease; transform-box: fill-box; transform-origin: center; }
.vt-hoverable:hover { filter: brightness(0.95); }
.vt-pin:hover { transform: scale(1.18); }
.vt-shimmer-block { background: linear-gradient(90deg, #eef3f0 25%, #f8fbf9 37%, #eef3f0 63%); background-size: 300px 100%; animation: vt-shimmer 1.4s ease-in-out infinite; }
`;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function hashText(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}
function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
function normaliseStateName(value: unknown) {
  const state = String(value ?? "").replace(/ State$/i, "").trim();
  if (/Federal Capital Territory/i.test(state) || /^Abuja$/i.test(state)) return "FCT";
  return state;
}
function stateName(feature: GeoFeature) {
  return normaliseStateName(
    feature.properties.NAME_1 ?? feature.properties.shapeName ?? feature.properties.name ?? feature.properties.STATE,
  );
}
function lgaName(feature: GeoFeature) {
  return String(
    feature.properties.VARNAME_2 || feature.properties.NAME_2 || feature.properties.shapeName || feature.properties.name || "LGA",
  ).trim();
}
function geometryRings(geometry: GeoFeature["geometry"]) {
  return geometry.type === "Polygon"
    ? (geometry.coordinates as number[][][])
    : (geometry.coordinates as number[][][][]).flat();
}
function allCoordinates(features: GeoFeature[]) {
  return features.flatMap((feature) => geometryRings(feature.geometry).flat());
}
function makeProjector(features: GeoFeature[], width: number, height: number, padding = 30): Projector {
  const coordinates = allCoordinates(features);
  if (!coordinates.length) return () => ({ x: width / 2, y: height / 2 });
  const lons = coordinates.map((c) => c[0]);
  const lats = coordinates.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lonSpan = Math.max(maxLon - minLon, 0.001);
  const latSpan = Math.max(maxLat - minLat, 0.001);
  const scale = Math.min((width - padding * 2) / lonSpan, (height - padding * 2) / latSpan);
  const usedWidth = lonSpan * scale;
  const usedHeight = latSpan * scale;
  const offsetX = (width - usedWidth) / 2;
  const offsetY = (height - usedHeight) / 2;
  return ([lon, lat]) => ({ x: offsetX + (lon - minLon) * scale, y: offsetY + (maxLat - lat) * scale });
}
function geometryPath(geometry: GeoFeature["geometry"], project: Projector) {
  return geometryRings(geometry)
    .map(
      (ring) =>
        ring
          .map((coordinate, index) => {
            const point = project(coordinate);
            return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
          })
          .join(" ") + " Z",
    )
    .join(" ");
}
function largestRing(feature: GeoFeature) {
  const rings = geometryRings(feature.geometry);
  return rings.reduce((largest, candidate) => (candidate.length > largest.length ? candidate : largest), rings[0] ?? []);
}
function featureCentroid(feature: GeoFeature, project: Projector) {
  const ring = largestRing(feature);
  if (!ring.length) return { x: 0, y: 0 };
  return ring.reduce(
    (total, coordinate) => {
      const point = project(coordinate);
      return { x: total.x + point.x / ring.length, y: total.y + point.y / ring.length };
    },
    { x: 0, y: 0 },
  );
}
function averageLatitude(features: GeoFeature[]) {
  const coordinates = allCoordinates(features);
  if (!coordinates.length) return 9.08;
  return coordinates.reduce((sum, c) => sum + c[1], 0) / coordinates.length;
}
/** Scatters a deterministic point inside a feature's footprint so every project
 * gets a stable location, without needing per-project real-world coordinates. */
function jitterWithin(feature: GeoFeature, seed: number, project: Projector, fraction: number, nudge = 0): Point {
  const centroid = featureCentroid(feature, project);
  const ring = largestRing(feature);
  if (!ring.length) return centroid;
  const points = ring.map((coordinate) => project(coordinate));
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const radius = (Math.min(maxX - minX, maxY - minY) / 2) * fraction;
  const angle = ((seed % 360) * Math.PI) / 180;
  const spread = 0.18 + 0.78 * (((seed >>> 5) % 97) / 97);
  return {
    x: centroid.x + Math.cos(angle) * (radius * spread + nudge),
    y: centroid.y + Math.sin(angle) * (radius * spread + nudge),
  };
}
function densityBand(value: number, maximum: number) {
  if (!value) return 0;
  const ratio = maximum ? value / maximum : 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
function mapStatus(project: Project, seed: number): MapStatus {
  if (project.verified) return "Verified";
  if (seed % 13 === 0) return "At Risk";
  if (seed % 11 === 0) return "Planned";
  if (project.status === "In progress") return "Active";
  if (project.status === "Submitted") return "Under Inspection";
  return "Pending Verification";
}
function enrichProjects(lgaFeatures: GeoFeature[]): MapProject[] {
  const byState = new Map<string, GeoFeature[]>();
  lgaFeatures.forEach((feature) => {
    const state = stateName(feature);
    if (!state) return;
    const list = byState.get(state) ?? [];
    list.push(feature);
    byState.set(state, list);
  });
  return projects.map((project, index) => {
    const seed = hashText(`${project.state}-${project.name}-${index}`);
    const available = byState.get(project.state) ?? [];
    const lgaFeature = available.length ? available[seed % available.length] : undefined;
    const lga = lgaFeature ? lgaName(lgaFeature) : `${project.state} LGA`;
    const monthDate = new Date(project.month);
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1 + (seed % 20));
    const completion = new Date(start);
    completion.setMonth(completion.getMonth() + 4 + (seed % 8));
    const status = mapStatus(project, seed);
    const progress = status === "Verified" ? 100 : status === "Planned" ? 10 + (seed % 10) : 35 + (seed % 61);
    return {
      ...project,
      id: `REA-${project.programme}-${project.state.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(4, "0")}`,
      lga,
      community: `${lga.replace(/[^a-zA-Z ]/g, "").split(" ")[0] || project.state} Community ${(seed % 4) + 1}`,
      projectType: project.component,
      mapStatus: status,
      phase: ["Planning", "Construction", "Commissioning", "Operations"][(seed >>> 3) % 4],
      consultant: consultants[(seed >>> 5) % consultants.length],
      inspectionStatus:
        status === "Verified"
          ? "Verified"
          : status === "Under Inspection"
            ? "Inspection In Progress"
            : seed % 3 === 0
              ? "Inspection Due"
              : "Inspection Completed",
      inspectionScore: 58 + (seed % 40),
      progress,
      startDate: start.toISOString().slice(0, 10),
      completionDate: completion.toISOString().slice(0, 10),
      beneficiaries: project.households * (4 + (seed % 2)),
      communities: 1 + (seed % 3),
      findings: {
        critical: status === "At Risk" ? 1 + (seed % 3) : seed % 9 === 0 ? 1 : 0,
        major: seed % 5,
        minor: 1 + (seed % 7),
      },
      openCorrectiveActions: seed % 6,
    };
  });
}
function scaleBarFor(projector: Projector, latitude: number) {
  const a = projector([0, latitude]);
  const b = projector([1, latitude]);
  const pxPerDegree = Math.abs(b.x - a.x) || 1;
  const kmPerDegree = 111.32 * Math.cos((latitude * Math.PI) / 180);
  const pxPerKm = pxPerDegree / Math.max(kmPerDegree, 1);
  const rawKm = 90 / pxPerKm;
  const steps = [10, 20, 25, 50, 100, 150, 200, 250, 500];
  const km = steps.reduce((best, step) => (Math.abs(step - rawKm) < Math.abs(best - rawKm) ? step : best), steps[0]);
  return { km, px: Math.max(24, km * pxPerKm) };
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function SelectFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 outline-none transition focus:border-[#16824b] focus:ring-2 focus:ring-[#16824b]/10"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
function DetailRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-[10px] font-semibold text-slate-500">{label}</span>
      <span className="text-right text-[11px] font-bold text-[#173b2a]">{value}</span>
    </div>
  );
}
/** Small self-animating number used in the header stat pills. */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    let frame = 0;
    const from = display;
    const delta = value - from;
    const start = performance.now();
    const duration = 480;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + delta * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <>{display.toLocaleString()}</>;
}
function CompassRose({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} className="vt-drop-in" style={{ animationDelay: "80ms" }}>
      <circle r="17" fill="#ffffff" stroke="#d7e3da" strokeWidth="1" />
      <circle r="17" fill="none" stroke="#16824b" strokeWidth="0.6" strokeDasharray="1.4 2.4" opacity="0.5" />
      <path d="M0 -12 L3.6 0 L0 12 L-3.6 0 Z" fill="#16824b" />
      <path d="M-12 0 L0 3.6 L12 0 L0 -3.6 Z" fill="#c3d3c9" />
      <text y="-21" textAnchor="middle" fontSize="6.4" fontWeight="800" fill="#173b2a">
        N
      </text>
    </g>
  );
}
function ScaleBar({ x, y, projector, latitude }: { x: number; y: number; projector: Projector; latitude: number }) {
  const { km, px } = scaleBarFor(projector, latitude);
  return (
    <g transform={`translate(${x} ${y})`} className="vt-drop-in" style={{ animationDelay: "140ms" }}>
      <line x1="0" y1="0" x2={px} y2="0" stroke="#284438" strokeWidth="1.6" />
      <line x1="0" y1="-4" x2="0" y2="4" stroke="#284438" strokeWidth="1.4" />
      <line x1={px} y1="-4" x2={px} y2="4" stroke="#284438" strokeWidth="1.4" />
      <text x={px / 2} y="-6" textAnchor="middle" fontSize="6.6" fontWeight="700" fill="#284438">
        {km} km
      </text>
    </g>
  );
}
/** Tiny stacked status breakdown shown inside hover tooltips. */
function StatusBreakdownBar({ breakdown, total }: { breakdown: Partial<Record<MapStatus, number>>; total: number }) {
  if (!total) return null;
  return (
    <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      {statusOrder.map((status) => {
        const count = breakdown[status] ?? 0;
        if (!count) return null;
        return <span key={status} style={{ width: `${(count / total) * 100}%`, backgroundColor: statusColors[status] }} />;
      })}
    </div>
  );
}

function ProjectMap({ onClose, onOpenSection }: { onClose: () => void; onOpenSection: (section: string) => void }) {
  const [stateFeatures, setStateFeatures] = useState<GeoFeature[]>([]);
  const [lgaFeatures, setLgaFeatures] = useState<GeoFeature[]>([]);
  const [lgaLoadError, setLgaLoadError] = useState(false);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<MapProject | null>(null);
  const [hoveredArea, setHoveredArea] = useState<HoverInfo | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    Projects: true,
    Status: true,
    Inspections: false,
    Contractors: false,
    "Critical Findings": true,
    "Corrective Actions": false,
    "Coverage Density": true,
  });

  useEffect(() => {
    fetch("/nigeria-adm1.geojson")
      .then((r) => r.json())
      .then((data: { features: GeoFeature[] }) => setStateFeatures(data.features ?? []))
      .catch(() => setStateFeatures([]));
    fetch(LGA_SOURCE)
      .then((r) => {
        if (!r.ok) throw new Error("LGA boundary request failed");
        return r.json();
      })
      .then((data: { features: GeoFeature[] }) => {
        setLgaFeatures(data.features ?? []);
        setLgaLoadError(false);
      })
      .catch(() => setLgaLoadError(true));
  }, []);

  const mappedProjects = useMemo(() => enrichProjects(lgaFeatures), [lgaFeatures]);
  const filteredProjects = useMemo(() => {
    const from = filters.from ? Date.parse(filters.from) : Number.NEGATIVE_INFINITY;
    const to = filters.to ? Date.parse(filters.to) : Number.POSITIVE_INFINITY;
    const query = search.trim().toLowerCase();
    return mappedProjects.filter((project) => {
      const date = Date.parse(project.startDate);
      return (
        (filters.state === "All States" || project.state === filters.state) &&
        (filters.lga === "All LGAs" || project.lga === filters.lga) &&
        (filters.community === "All Communities" || project.community === filters.community) &&
        (filters.programme === "All Programmes" || project.programme === filters.programme) &&
        (filters.component === "All Components" || project.component === filters.component) &&
        (filters.type === "All Project Types" || project.projectType === filters.type) &&
        (filters.status === "All Statuses" || project.mapStatus === filters.status) &&
        (filters.phase === "All Phases" || project.phase === filters.phase) &&
        (filters.contractor === "All Contractors" || project.contractor === filters.contractor) &&
        (filters.consultant === "All Consultants" || project.consultant === filters.consultant) &&
        (filters.inspection === "All Inspection Statuses" || project.inspectionStatus === filters.inspection) &&
        date >= from &&
        date <= to &&
        (!query || `${project.id} ${project.name} ${project.community} ${project.contractor}`.toLowerCase().includes(query))
      );
    });
  }, [filters, mappedProjects, search]);

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredProjects.forEach((project) => counts.set(project.state, (counts.get(project.state) ?? 0) + 1));
    return counts;
  }, [filteredProjects]);
  const stateBreakdowns = useMemo(() => {
    const map = new Map<string, Partial<Record<MapStatus, number>>>();
    filteredProjects.forEach((project) => {
      const entry = map.get(project.state) ?? {};
      entry[project.mapStatus] = (entry[project.mapStatus] ?? 0) + 1;
      map.set(project.state, entry);
    });
    return map;
  }, [filteredProjects]);
  const selectedStateLgas = useMemo(() => lgaFeatures.filter((feature) => stateName(feature) === selectedState), [lgaFeatures, selectedState]);
  const stateProjects = useMemo(() => filteredProjects.filter((project) => !selectedState || project.state === selectedState), [filteredProjects, selectedState]);
  const lgaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    stateProjects.forEach((project) => counts.set(project.lga, (counts.get(project.lga) ?? 0) + 1));
    return counts;
  }, [stateProjects]);
  const lgaBreakdowns = useMemo(() => {
    const map = new Map<string, Partial<Record<MapStatus, number>>>();
    stateProjects.forEach((project) => {
      const entry = map.get(project.lga) ?? {};
      entry[project.mapStatus] = (entry[project.mapStatus] ?? 0) + 1;
      map.set(project.lga, entry);
    });
    return map;
  }, [stateProjects]);
  const lgaProjects = useMemo(() => stateProjects.filter((project) => !selectedLga || project.lga === selectedLga), [stateProjects, selectedLga]);
  const selectedLgaFeature = useMemo(() => selectedStateLgas.find((feature) => lgaName(feature) === selectedLga), [selectedStateLgas, selectedLga]);
  const stateProjector = useMemo(() => makeProjector(stateFeatures, NATIONAL_VIEW.width, NATIONAL_VIEW.height, 34), [stateFeatures]);
  const lgaProjector = useMemo(() => makeProjector(selectedStateLgas, STATE_VIEW.width, STATE_VIEW.height, 42), [selectedStateLgas]);
  const stateFeatureByName = useMemo(() => new Map(stateFeatures.map((f) => [stateName(f), f])), [stateFeatures]);
  const lgaFeatureByName = useMemo(() => new Map(selectedStateLgas.map((f) => [lgaName(f), f])), [selectedStateLgas]);
  const stateOptions = useMemo(() => ["All States", ...unique(mappedProjects.map((p) => p.state))], [mappedProjects]);
  const lgaOptions = useMemo(() => {
    const state = filters.state !== "All States" ? filters.state : selectedState;
    return ["All LGAs", ...unique(mappedProjects.filter((p) => !state || p.state === state).map((p) => p.lga))];
  }, [filters.state, mappedProjects, selectedState]);
  const communityOptions = useMemo(
    () => [
      "All Communities",
      ...unique(
        mappedProjects
          .filter((p) => filters.state === "All States" || p.state === filters.state)
          .filter((p) => filters.lga === "All LGAs" || p.lga === filters.lga)
          .map((p) => p.community),
      ),
    ],
    [filters.lga, filters.state, mappedProjects],
  );
  const maximumStateCount = Math.max(0, ...stateCounts.values());
  const maximumLgaCount = Math.max(0, ...lgaCounts.values());
  const verifiedCount = filteredProjects.filter((p) => p.mapStatus === "Verified").length;
  const atRiskCount = filteredProjects.filter((p) => p.mapStatus === "At Risk").length;
  const activeCount = filteredProjects.filter((p) => p.mapStatus === "Active").length;

  // National-level scatter: one point per project, placed inside its state's footprint.
  const nationalPoints = useMemo(() => {
    const map = new Map<string, Point>();
    filteredProjects.forEach((project) => {
      const feature = stateFeatureByName.get(project.state);
      if (!feature) return;
      map.set(project.id, jitterWithin(feature, hashText(project.id), stateProjector, 0.58));
    });
    return map;
  }, [filteredProjects, stateFeatureByName, stateProjector]);

  // State-overview scatter: one point per project, placed inside its LGA's footprint.
  const overviewPoints = useMemo(() => {
    const map = new Map<string, Point>();
    stateProjects.forEach((project) => {
      const feature = lgaFeatureByName.get(project.lga);
      if (!feature) return;
      map.set(project.id, jitterWithin(feature, hashText(project.id), lgaProjector, 0.62));
    });
    return map;
  }, [stateProjects, lgaFeatureByName, lgaProjector]);

  // LGA-detail pins: fuller spread once we're looking at a single LGA.
  const pinPositions = useMemo(() => {
    if (!selectedLgaFeature) return new Map<string, Point>();
    const positions = new Map<string, Point>();
    lgaProjects.forEach((project, index) => {
      const seed = hashText(project.id);
      positions.set(project.id, jitterWithin(selectedLgaFeature, seed, lgaProjector, 0.74, (index % 3) * 3.2));
    });
    return positions;
  }, [lgaProjector, lgaProjects, selectedLgaFeature]);

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "state") {
        next.lga = "All LGAs";
        next.community = "All Communities";
      }
      if (key === "lga") next.community = "All Communities";
      return next;
    });
    if (key === "state") {
      if (value === "All States") {
        setSelectedState(null);
        setSelectedLga(null);
      } else {
        setSelectedState(value);
        setSelectedLga(null);
      }
      setZoom(1);
    }
    if (key === "lga" && value !== "All LGAs") {
      setSelectedLga(value);
      setZoom(1);
    }
  };
  const resetView = () => {
    setSelectedState(null);
    setSelectedLga(null);
    setSelectedProject(null);
    setZoom(1);
  };
  const resetFilters = () => {
    setFilters(defaultFilters);
    setSearch("");
    resetView();
  };
  const drillState = (state: string) => {
    setSelectedState(state);
    setSelectedLga(null);
    setSelectedProject(null);
    setZoom(1);
  };
  const drillLga = (lga: string) => {
    setSelectedLga(lga);
    setSelectedProject(null);
    setZoom(1);
  };
  const onMapMove = (
    event: React.MouseEvent<SVGGElement>,
    name: string,
    count: number,
    breakdown: Partial<Record<MapStatus, number>> = {},
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHoveredArea({ name, count, x: event.clientX - rect.left + 14, y: event.clientY - rect.top + 14, breakdown });
  };

  // Auto-focus straight to a project when a search narrows to exactly one match —
  // saves the extra clicks of drilling down manually.
  useEffect(() => {
    const query = search.trim();
    if (!query || filteredProjects.length !== 1) return;
    const match = filteredProjects[0];
    if (selectedProject?.id === match.id) return;
    setSelectedState(match.state);
    setSelectedLga(match.lga);
    setSelectedProject(match);
    setZoom(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filteredProjects.length]);

  // Fullscreen: try the native API for a true edge-to-edge view, but degrade
  // gracefully to a CSS-only maximize if the host page blocks it (e.g. inside
  // a restricted iframe) — the map still gets the full viewport either way.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
  useEffect(() => {
    if (!isFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement) setIsFullscreen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
      setSidebarCollapsed(true);
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };
  const activeFilterCount = useMemo(
    () => Object.entries(filters).filter(([key, value]) => value && value !== (defaultFilters as Record<string, string>)[key]).length,
    [filters],
  );

  const viewKey = `${selectedState ?? "national"}-${selectedLga ?? "state"}`;
  const nationalLatitude = useMemo(() => averageLatitude(stateFeatures), [stateFeatures]);
  const stateLatitude = useMemo(() => averageLatitude(selectedStateLgas.length ? selectedStateLgas : stateFeatures), [selectedStateLgas, stateFeatures]);

  return (
    <div
      ref={containerRef}
      className={`z-[24] flex overflow-hidden bg-[#edf2ee] ${
        isFullscreen ? "fixed inset-0 z-[70]" : "fixed bottom-0 left-0 right-0 top-[94px] lg:left-[190px]"
      }`}
    >
      <style>{MAP_STYLES}</style>

      <aside
        className={`relative hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-300 ease-in-out xl:flex ${
          sidebarCollapsed ? "w-14" : "w-[288px]"
        }`}
      >
        <button
          onClick={() => setSidebarCollapsed((v) => !v)}
          className="absolute -right-3 top-[70px] z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-[#128149] xl:flex"
          aria-label={sidebarCollapsed ? "Expand map panel" : "Collapse map panel to enlarge the map"}
          title={sidebarCollapsed ? "Show filters" : "Collapse to enlarge map"}
        >
          {sidebarCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>

        {sidebarCollapsed ? (
          <div className="flex flex-1 flex-col items-center gap-3 overflow-hidden py-4">
            <Compass className="h-4 w-4 text-[#128149]" />
            <div className="h-px w-6 bg-slate-200" />
            <button onClick={() => setSidebarCollapsed(false)} className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#128149]" aria-label="Open search" title="Search">
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSidebarCollapsed(false)}
              className="relative rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#128149]"
              aria-label="Open filters"
              title="Filters"
            >
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#16824b] text-[7px] font-black text-white">{activeFilterCount}</span>
              )}
            </button>
            <button onClick={() => setSidebarCollapsed(false)} className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-[#128149]" aria-label="Open map layers" title="Map layers">
              <Layers3 className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#128149]">
                    <Compass className="h-3 w-3" /> Project Map
                  </p>
                  <h2 className="mt-1 text-[15px] font-extrabold text-[#173b2a]">Project location explorer</h2>
                  <p className="mt-1 max-w-[210px] text-[10px] leading-4 text-slate-500">
                    Drill from Nigeria to state, LGA and individual projects.
                  </p>
                </div>
                <button onClick={onClose} className="rounded-md p-2 text-slate-400 hover:bg-slate-100" aria-label="Close project map">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search project ID or name"
                  className="h-9 w-full rounded-md border border-slate-200 bg-[#fafcfb] pl-9 pr-3 text-[11px] font-medium outline-none focus:border-[#16824b]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-extrabold text-[#173b2a]">
                  <Filter className="h-3.5 w-3.5" /> Filters
                </span>
                <button onClick={resetFilters} className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#128149]">
                  Clear all
                </button>
              </div>
              <div className="space-y-2.5">
                <SelectFilter label="State" value={filters.state} options={stateOptions} onChange={(v) => updateFilter("state", v)} />
                <SelectFilter label="LGA" value={filters.lga} options={lgaOptions} onChange={(v) => updateFilter("lga", v)} />
                <SelectFilter label="Community" value={filters.community} options={communityOptions} onChange={(v) => updateFilter("community", v)} />
                <SelectFilter
                  label="Programme"
                  value={filters.programme}
                  options={["All Programmes", ...unique(mappedProjects.map((p) => p.programme))]}
                  onChange={(v) => updateFilter("programme", v)}
                />
                <SelectFilter
                  label="Component"
                  value={filters.component}
                  options={["All Components", ...unique(mappedProjects.map((p) => p.component))]}
                  onChange={(v) => updateFilter("component", v)}
                />
                <SelectFilter
                  label="Project Type"
                  value={filters.type}
                  options={["All Project Types", ...unique(mappedProjects.map((p) => p.projectType))]}
                  onChange={(v) => updateFilter("type", v)}
                />
                <SelectFilter label="Status" value={filters.status} options={["All Statuses", ...statusOrder]} onChange={(v) => updateFilter("status", v)} />
                <SelectFilter
                  label="Phase"
                  value={filters.phase}
                  options={["All Phases", ...unique(mappedProjects.map((p) => p.phase))]}
                  onChange={(v) => updateFilter("phase", v)}
                />
                <SelectFilter
                  label="Contractor"
                  value={filters.contractor}
                  options={["All Contractors", ...unique(mappedProjects.map((p) => p.contractor))]}
                  onChange={(v) => updateFilter("contractor", v)}
                />
                <SelectFilter
                  label="Consultant"
                  value={filters.consultant}
                  options={["All Consultants", ...unique(mappedProjects.map((p) => p.consultant))]}
                  onChange={(v) => updateFilter("consultant", v)}
                />
                <SelectFilter
                  label="Inspection Status"
                  value={filters.inspection}
                  options={["All Inspection Statuses", ...unique(mappedProjects.map((p) => p.inspectionStatus))]}
                  onChange={(v) => updateFilter("inspection", v)}
                />
                <div>
                  <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-500">Date range</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={filters.from} onChange={(e) => updateFilter("from", e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-200 px-2 text-[9px]" />
                    <input type="date" value={filters.to} onChange={(e) => updateFilter("to", e.target.value)} className="h-9 min-w-0 rounded-md border border-slate-200 px-2 text-[9px]" />
                  </div>
                </div>
              </div>
              <div className="my-4 h-px bg-slate-200" />
              <div className="mb-2.5 flex items-center gap-2 text-[11px] font-extrabold text-[#173b2a]">
                <Layers3 className="h-3.5 w-3.5" /> Map layers
              </div>
              <div className="space-y-1.5">
                {layerNames.map((layer) => (
                  <button
                    key={layer}
                    onClick={() => setLayers((c) => ({ ...c, [layer]: !c[layer] }))}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    <span>{layer}</span>
                    <span className={`relative h-4 w-7 rounded-full transition-colors duration-200 ${layers[layer] ? "bg-[#16824b]" : "bg-slate-200"}`}>
                      <i className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all duration-200 ${layers[layer] ? "left-3.5" : "left-0.5"}`} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-[64px] items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-[11px] font-bold text-slate-500">
            <button onClick={resetView} className={`whitespace-nowrap rounded-md px-2 py-1.5 transition-colors ${!selectedState ? "bg-[#edf8f0] text-[#138049]" : "hover:bg-slate-100"}`}>
              Nigeria
            </button>
            {selectedState && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
            {selectedState && (
              <button
                onClick={() => {
                  setSelectedLga(null);
                  setSelectedProject(null);
                  setZoom(1);
                }}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 transition-colors ${!selectedLga ? "bg-[#edf8f0] text-[#138049]" : "hover:bg-slate-100"}`}
              >
                {selectedState}
              </button>
            )}
            {selectedLga && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
            {selectedLga && <span className="whitespace-nowrap rounded-md bg-[#edf8f0] px-2 py-1.5 text-[#138049]">{selectedLga}</span>}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-md border border-slate-200 bg-gradient-to-b from-[#fafcfb] to-[#f2f6f3] px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              <CountUp value={filteredProjects.length} /> Projects
            </span>
            <span className="rounded-md border border-[#c6e2cf] bg-gradient-to-b from-[#f0f9f3] to-[#e7f5eb] px-2.5 py-1.5 text-[9px] font-extrabold text-[#138049]">
              <CountUp value={verifiedCount} /> Verified
            </span>
            <span className="rounded-md border border-[#c9dcef] bg-gradient-to-b from-[#f2f7fc] to-[#e9f1fa] px-2.5 py-1.5 text-[9px] font-extrabold text-[#2d78c4]">
              <CountUp value={activeCount} /> Active
            </span>
            <span
              className={`rounded-md border border-[#efd0d0] bg-gradient-to-b from-[#fdf4f4] to-[#fbe9e9] px-2.5 py-1.5 text-[9px] font-extrabold text-[#b73636] ${atRiskCount > 0 ? "animate-pulse" : ""}`}
            >
              <CountUp value={atRiskCount} /> At Risk
            </span>
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden bg-[#edf2ee] p-3 sm:p-4 lg:p-5">
          <div className="relative h-full overflow-hidden rounded-xl border border-[#d4ded7] bg-[#f9fbfa] shadow-[0_8px_24px_rgba(26,55,40,0.06)]">
            <div className="absolute left-4 top-4 z-10 max-w-[420px] rounded-lg border border-slate-200 bg-white/95 px-3.5 py-3 shadow-sm backdrop-blur">
              <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#128149]">
                {!selectedState ? "National coverage" : !selectedLga ? `${selectedState} · LGA coverage` : `${selectedLga} · Project locations`}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                {!selectedState
                  ? "Actual Nigeria state boundaries with every project plotted inside its state."
                  : !selectedLga
                    ? "Actual Local Government Area boundaries. Each dot is a project inside that LGA."
                    : "Individual projects in the selected LGA. Click any marker to inspect its full record."}
              </p>
            </div>
            <div className="absolute right-4 top-4 z-20 flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <button onClick={() => setZoom((v) => Math.min(1.8, Number((v + 0.15).toFixed(2))))} className="p-2 text-slate-500 transition hover:bg-slate-50">
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setZoom((v) => Math.max(0.85, Number((v - 0.15).toFixed(2))))} className="border-l border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setZoom(1)} className="border-l border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50">
                <LocateFixed className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="border-l border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                aria-label={isFullscreen ? "Exit full screen" : "View full screen"}
                title={isFullscreen ? "Exit full screen" : "View full screen"}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            {!selectedState ? (
              stateFeatures.length ? (
                <svg key={viewKey} viewBox={`0 0 ${NATIONAL_VIEW.width} ${NATIONAL_VIEW.height}`} className="vt-view-in h-full w-full p-5 pt-16" onMouseLeave={() => setHoveredArea(null)}>
                  <g transform={`translate(${NATIONAL_VIEW.width / 2} ${NATIONAL_VIEW.height / 2}) scale(${zoom}) translate(${-NATIONAL_VIEW.width / 2} ${-NATIONAL_VIEW.height / 2})`}>
                    {stateFeatures.map((feature, index) => {
                      const state = stateName(feature);
                      const count = stateCounts.get(state) ?? 0;
                      const centroid = featureCentroid(feature, stateProjector);
                      const fill = layers["Coverage Density"] ? densityPalette[densityBand(count, maximumStateCount)] : "#e8efea";
                      return (
                        <g
                          key={`${state}-${index}`}
                          className="vt-fade-poly vt-hoverable cursor-pointer"
                          style={{ animationDelay: `${Math.min(index * 9, 260)}ms` }}
                          onClick={() => drillState(state)}
                          onMouseMove={(event) => onMapMove(event, state, count, stateBreakdowns.get(state) ?? {})}
                        >
                          <path d={geometryPath(feature.geometry, stateProjector)} fill={fill} stroke="#ffffff" strokeWidth="1.35" vectorEffect="non-scaling-stroke" />
                          <text x={centroid.x} y={centroid.y - 2} textAnchor="middle" fill="#284438" fontSize="7.5" fontWeight="750" pointerEvents="none">
                            {state}
                          </text>
                          <text x={centroid.x} y={centroid.y + 7} textAnchor="middle" fill="#14804a" fontSize="7" fontWeight="850" pointerEvents="none">
                            {count}
                          </text>
                        </g>
                      );
                    })}
                    {layers.Projects &&
                      filteredProjects.map((project, index) => {
                        const position = nationalPoints.get(project.id);
                        if (!position) return null;
                        const color = layers.Status ? statusColors[project.mapStatus] : "#16824b";
                        const isCritical = layers["Critical Findings"] && project.findings.critical > 0;
                        const isHovered = hoveredProjectId === project.id;
                        return (
                          <g
                            key={project.id}
                            className="vt-pop-in vt-hoverable cursor-pointer"
                            style={{ animationDelay: `${260 + Math.min(index * 3, 260)}ms` }}
                            onMouseEnter={() => setHoveredProjectId(project.id)}
                            onMouseLeave={() => setHoveredProjectId((id) => (id === project.id ? null : id))}
                            onClick={(event) => {
                              event.stopPropagation();
                              drillState(project.state);
                            }}
                          >
                            {isCritical && <circle cx={position.x} cy={position.y} r="2.1" fill="#c83d3d" className="vt-pulse-ring" />}
                            <circle cx={position.x} cy={position.y} r={isHovered ? 3.1 : 2.1} fill={color} stroke="#ffffff" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
                          </g>
                        );
                      })}
                  </g>
                </svg>
              ) : (
                <div className="flex h-full items-center justify-center p-10">
                  <div className="h-3/4 w-full max-w-md rounded-xl vt-shimmer-block" />
                </div>
              )
            ) : selectedStateLgas.length ? (
              <svg key={viewKey} viewBox={`0 0 ${STATE_VIEW.width} ${STATE_VIEW.height}`} className="vt-view-in h-full w-full p-5 pt-16" onMouseLeave={() => setHoveredArea(null)}>
                <g transform={`translate(${STATE_VIEW.width / 2} ${STATE_VIEW.height / 2}) scale(${zoom}) translate(${-STATE_VIEW.width / 2} ${-STATE_VIEW.height / 2})`}>
                  {selectedStateLgas.map((feature, index) => {
                    const lga = lgaName(feature);
                    const count = lgaCounts.get(lga) ?? 0;
                    const isSelected = selectedLga === lga;
                    const centroid = featureCentroid(feature, lgaProjector);
                    const fill = isSelected ? "#dff1e5" : layers["Coverage Density"] ? densityPalette[densityBand(count, maximumLgaCount)] : "#edf2ee";
                    return (
                      <g
                        key={`${lga}-${index}`}
                        className="vt-fade-poly vt-hoverable cursor-pointer"
                        style={{ animationDelay: `${Math.min(index * 11, 260)}ms` }}
                        onClick={() => drillLga(lga)}
                        onMouseMove={(event) => onMapMove(event, lga, count, lgaBreakdowns.get(lga) ?? {})}
                      >
                        <path
                          d={geometryPath(feature.geometry, lgaProjector)}
                          fill={fill}
                          stroke={isSelected ? "#117a44" : "#ffffff"}
                          strokeWidth={isSelected ? "2" : "1.25"}
                          vectorEffect="non-scaling-stroke"
                        />
                        {!selectedLga && (
                          <>
                            <text x={centroid.x} y={centroid.y - 2} textAnchor="middle" fill="#284438" fontSize="8.2" fontWeight="760" pointerEvents="none">
                              {lga.length > 18 ? `${lga.slice(0, 17)}…` : lga}
                            </text>
                            <text x={centroid.x} y={centroid.y + 8} textAnchor="middle" fill="#14804a" fontSize="7.2" fontWeight="850" pointerEvents="none">
                              {count} project{count === 1 ? "" : "s"}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}

                  {!selectedLga &&
                    layers.Projects &&
                    stateProjects.map((project, index) => {
                      const position = overviewPoints.get(project.id);
                      if (!position) return null;
                      const color = layers.Status ? statusColors[project.mapStatus] : "#16824b";
                      const isCritical = layers["Critical Findings"] && project.findings.critical > 0;
                      return (
                        <g key={project.id} className="vt-pop-in vt-hoverable cursor-pointer" style={{ animationDelay: `${260 + Math.min(index * 6, 260)}ms` }} onClick={(event) => { event.stopPropagation(); drillLga(project.lga); }}>
                          {isCritical && <circle cx={position.x} cy={position.y} r="2.6" fill="#c83d3d" className="vt-pulse-ring" />}
                          <circle cx={position.x} cy={position.y} r="2.8" fill={color} stroke="#ffffff" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                        </g>
                      );
                    })}

                  {selectedLga &&
                    layers.Projects &&
                    lgaProjects.map((project, index) => {
                      const position = pinPositions.get(project.id);
                      if (!position) return null;
                      const color = layers.Status ? statusColors[project.mapStatus] : "#16824b";
                      const isSelectedPin = selectedProject?.id === project.id;
                      const radius = 5 + Math.min(4, project.kw / 60);
                      return (
                        <g
                          key={project.id}
                          className="vt-drop-in vt-pin vt-hoverable cursor-pointer"
                          style={{ animationDelay: `${Math.min(index * 22, 400)}ms` }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedProject(project);
                          }}
                        >
                          {layers["Critical Findings"] && project.findings.critical > 0 && (
                            <circle cx={position.x} cy={position.y} r={radius} fill="#c83d3d" className="vt-pulse-ring" />
                          )}
                          <circle cx={position.x} cy={position.y} r={isSelectedPin ? radius + 3 : radius + 2} fill="#ffffff" opacity="0.96" />
                          <circle cx={position.x} cy={position.y} r={radius} fill={color} stroke="#ffffff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                          {isSelectedPin && <circle cx={position.x} cy={position.y} r={radius + 5} fill="none" stroke={color} strokeWidth="1.4" opacity="0.55" />}
                          {(layers.Contractors || layers.Inspections) && index < 10 && (
                            <text x={position.x + radius + 4} y={position.y + 3} fill="#385246" fontSize="7" fontWeight="700">
                              {layers.Contractors ? project.contractor.split(" ").slice(0, 2).join(" ") : project.inspectionStatus}
                            </text>
                          )}
                        </g>
                      );
                    })}

                  {!selectedLga && <CompassRose x={STATE_VIEW.width - 46} y={54} />}
                  {!selectedLga && <ScaleBar x={36} y={STATE_VIEW.height - 26} projector={lgaProjector} latitude={stateLatitude} />}
                </g>
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                {lgaLoadError ? (
                  <div className="max-w-sm rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <p className="text-sm font-extrabold text-[#173b2a]">LGA boundary data could not be loaded</p>
                    <p className="mt-2 text-[11px] leading-5 text-slate-500">The national map is still available. Reopen Project Map to retry the boundary source.</p>
                  </div>
                ) : (
                  <div className="h-3/4 w-full max-w-md rounded-xl vt-shimmer-block" />
                )}
              </div>
            )}

            {/* National-view cartographic instruments live outside the zoomable <g> transform so they stay put. */}
            {!selectedState && stateFeatures.length > 0 && (
              <svg viewBox={`0 0 ${NATIONAL_VIEW.width} ${NATIONAL_VIEW.height}`} className="pointer-events-none absolute inset-0 h-full w-full p-5 pt-16">
                <CompassRose x={NATIONAL_VIEW.width - 46} y={54} />
                <ScaleBar x={36} y={NATIONAL_VIEW.height - 26} projector={stateProjector} latitude={nationalLatitude} />
              </svg>
            )}

            {hoveredArea && (
              <div className="pointer-events-none absolute z-30 min-w-[140px] rounded-md border border-slate-200 bg-[#173b2a] px-3 py-2 text-white shadow-lg" style={{ left: hoveredArea.x, top: hoveredArea.y }}>
                <p className="text-[10px] font-extrabold">{hoveredArea.name}</p>
                <p className="mt-0.5 text-[9px] text-white/70">
                  {hoveredArea.count} project{hoveredArea.count === 1 ? "" : "s"} · click to open
                </p>
                <StatusBreakdownBar breakdown={hoveredArea.breakdown} total={hoveredArea.count} />
              </div>
            )}

            {/* Minimap: only useful once we've drilled past the national view. */}
            {selectedState && stateFeatures.length > 0 && (
              <div className="absolute bottom-3 left-3 z-10 hidden overflow-hidden rounded-md border border-slate-200 bg-white/95 shadow-sm sm:block">
                <svg viewBox={`0 0 130 80`} width="130" height="80">
                  {stateFeatures.map((feature, index) => {
                    const projector = makeProjector(stateFeatures, 130, 80, 4);
                    const isCurrent = stateName(feature) === selectedState;
                    return <path key={index} d={geometryPath(feature.geometry, projector)} fill={isCurrent ? "#16824b" : "#e4eae5"} stroke="#ffffff" strokeWidth="0.6" />;
                  })}
                </svg>
                <p className="border-t border-slate-100 bg-white px-2 py-1 text-center text-[7px] font-extrabold uppercase tracking-[0.1em] text-slate-500">You are here</p>
              </div>
            )}

            <div className="absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white/95 px-3 py-2 shadow-sm sm:left-[146px]">
              {selectedLga ? (
                <>
                  {statusOrder.map((status) => (
                    <span key={status} className="flex items-center gap-1.5 text-[8px] font-bold text-slate-600">
                      <i className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColors[status] }} />
                      {status}
                    </span>
                  ))}
                  <span className="ml-1 flex items-center gap-1 text-[8px] font-semibold text-slate-400">
                    <Zap className="h-2.5 w-2.5" /> size = capacity
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[8px] font-extrabold uppercase tracking-[0.08em] text-slate-500">Project density</span>
                  {densityPalette.map((color, index) => (
                    <span key={color} className="flex items-center gap-1 text-[8px] font-semibold text-slate-500">
                      <i className="h-2.5 w-4 rounded-[2px]" style={{ backgroundColor: color }} />
                      {index === 0 ? "None" : index === 4 ? "High" : ""}
                    </span>
                  ))}
                  {layers.Projects && (
                    <span className="ml-1 flex items-center gap-1.5 border-l border-slate-200 pl-2 text-[8px] font-semibold text-slate-500">
                      <i className="h-2 w-2 rounded-full bg-[#16824b]" /> project location
                    </span>
                  )}
                </>
              )}
            </div>
            <div className="absolute bottom-3 right-3 z-10 rounded-md border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[8px] font-semibold text-slate-400 shadow-sm">Administrative boundaries</div>
          </div>
          <button onClick={resetFilters} className="absolute bottom-6 right-6 z-20 hidden items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-[9px] font-extrabold text-slate-600 shadow-sm transition hover:bg-slate-50 lg:flex">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </section>

      {selectedProject && (
        <aside key={selectedProject.id} className="vt-panel-in absolute bottom-0 right-0 top-0 z-40 w-full max-w-[390px] overflow-y-auto border-l border-slate-200 bg-white shadow-[-14px_0_30px_rgba(31,52,41,0.12)] sm:w-[390px]">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[selectedProject.mapStatus] }} />
                  <span className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-500">{selectedProject.mapStatus}</span>
                </div>
                <h2 className="mt-2 text-[16px] font-extrabold leading-tight text-[#173b2a]">{selectedProject.name}</h2>
                <p className="mt-1 text-[10px] font-extrabold text-[#128149]">{selectedProject.id}</p>
              </div>
              <button onClick={() => setSelectedProject(null)} className="rounded-md p-2 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="space-y-4 p-5">
            <section className="rounded-lg border border-[#d7e7dc] bg-[#f4faf6] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-extrabold uppercase tracking-[0.11em] text-slate-500">Project progress</span>
                <span className="text-[15px] font-black text-[#128149]">{selectedProject.progress}%</span>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-[#16824b] transition-[width] duration-700 ease-out" style={{ width: `${selectedProject.progress}%` }} />
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white px-4 py-1">
              <DetailRow label="Location" value={`${selectedProject.community}, ${selectedProject.lga}, ${selectedProject.state}`} />
              <DetailRow label="Project type" value={selectedProject.projectType} />
              <DetailRow label="Contractor" value={selectedProject.contractor} />
              <DetailRow label="Consultant" value={selectedProject.consultant} />
              <DetailRow label="Phase" value={selectedProject.phase} />
              <DetailRow label="Capacity" value={`${selectedProject.kw.toLocaleString()} kW`} />
              <DetailRow label="Start date" value={selectedProject.startDate} />
              <DetailRow label="Target completion" value={selectedProject.completionDate} />
            </section>
            <section className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <ShieldCheck className="h-4 w-4 text-[#128149]" />
                <p className="mt-2 text-lg font-black text-[#173b2a]">{selectedProject.inspectionScore}%</p>
                <p className="text-[9px] text-slate-500">Last inspection score</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <CheckCircle2 className="h-4 w-4 text-[#128149]" />
                <p className="mt-2 text-[11px] font-black text-[#173b2a]">{selectedProject.inspectionStatus}</p>
                <p className="mt-1 text-[9px] text-slate-500">Verification status</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <UsersRound className="h-4 w-4 text-[#2d78c4]" />
                <p className="mt-2 text-lg font-black text-[#173b2a]">{selectedProject.beneficiaries.toLocaleString()}</p>
                <p className="text-[9px] text-slate-500">Beneficiaries</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <Building2 className="h-4 w-4 text-[#2d78c4]" />
                <p className="mt-2 text-lg font-black text-[#173b2a]">{selectedProject.households.toLocaleString()}</p>
                <p className="text-[9px] text-slate-500">Households · {selectedProject.communities} communities</p>
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-extrabold text-[#173b2a]">
                <AlertTriangle className="h-4 w-4 text-[#c83d3d]" /> Findings by severity
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-red-50 px-2 py-3">
                  <p className="text-lg font-black text-red-700">{selectedProject.findings.critical}</p>
                  <p className="text-[8px] font-bold text-red-600">Critical</p>
                </div>
                <div className="rounded-md bg-orange-50 px-2 py-3">
                  <p className="text-lg font-black text-orange-700">{selectedProject.findings.major}</p>
                  <p className="text-[8px] font-bold text-orange-600">Major</p>
                </div>
                <div className="rounded-md bg-amber-50 px-2 py-3">
                  <p className="text-lg font-black text-amber-700">{selectedProject.findings.minor}</p>
                  <p className="text-[8px] font-bold text-amber-600">Minor</p>
                </div>
              </div>
            </section>
            <section className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-[0.11em] text-slate-500">Open corrective actions</p>
                <p className="mt-1 text-xl font-black text-[#173b2a]">{selectedProject.openCorrectiveActions}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Wrench className="h-4 w-4" />
              </div>
            </section>
            <div className="grid grid-cols-3 gap-2 pb-2">
              <button className="rounded-md bg-[#16824b] px-2 py-2.5 text-[9px] font-extrabold text-white transition hover:bg-[#136d3f]">View Project</button>
              <button onClick={() => onOpenSection("Verification")} className="rounded-md border border-slate-200 bg-white px-2 py-2.5 text-[9px] font-extrabold text-slate-700 transition hover:bg-slate-50">
                View Inspections
              </button>
              <button onClick={() => onOpenSection("Reports")} className="rounded-md border border-slate-200 bg-white px-2 py-2.5 text-[9px] font-extrabold text-slate-700 transition hover:bg-slate-50">
                View Reports
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

export default function ReaProjectMapHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sync = () => {
      document.querySelectorAll("nav").forEach((nav) => {
        if (nav.querySelector('[data-veritas-project-map="true"]')) return;
        const overview = Array.from(nav.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Overview");
        if (!overview) return;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.veritasProjectMap = "true";
        button.className = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";
        button.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg><span>Project Map</span>';
        button.addEventListener("click", () => setOpen(true));
        overview.insertAdjacentElement("afterend", button);
      });
    };
    const native = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("nav button") as HTMLElement | null;
      if (button && button.dataset.veritasProjectMap !== "true") setOpen(false);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", native, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", native, true);
      document.querySelectorAll('[data-veritas-project-map="true"]').forEach((button) => button.remove());
    };
  }, []);
  const openNativeSection = (section: string) => {
    const button = Array.from(document.querySelectorAll("nav button")).find((candidate) => candidate.textContent?.trim() === section) as HTMLButtonElement | undefined;
    if (button) button.click();
    setOpen(false);
  };
  if (!open) return null;
  return <ProjectMap onClose={() => setOpen(false)} onOpenSection={openNativeSection} />;
}
