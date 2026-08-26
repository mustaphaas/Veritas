import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Filter,
  Layers3,
  Map as MapIcon,
  MapPin,
  RotateCcw,
  Search,
  ShieldCheck,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { projects, type Project } from "../lib/dashboard-data";

type BoundaryFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

type MapStatus =
  | "Verified"
  | "Active"
  | "Under Inspection"
  | "Pending Verification"
  | "At Risk"
  | "Planned";

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
  pinX: number;
  pinY: number;
};

type FilterState = {
  state: string;
  lga: string;
  community: string;
  type: string;
  status: string;
  phase: string;
  contractor: string;
  consultant: string;
  inspection: string;
  from: string;
  to: string;
};

type LayerKey =
  | "Projects"
  | "Status"
  | "Inspections"
  | "Contractors"
  | "Critical Findings"
  | "Corrective Actions"
  | "Coverage Density";

type Point = { x: number; y: number };

const defaultFilters: FilterState = {
  state: "All States",
  lga: "All LGAs",
  community: "All Communities",
  type: "All Project Types",
  status: "All Statuses",
  phase: "All Phases",
  contractor: "All Contractors",
  consultant: "All Consultants",
  inspection: "All Inspection Statuses",
  from: "",
  to: "",
};

const layerNames: LayerKey[] = [
  "Projects",
  "Status",
  "Inspections",
  "Contractors",
  "Critical Findings",
  "Corrective Actions",
  "Coverage Density",
];

const statusColors: Record<MapStatus, string> = {
  Verified: "#139653",
  Active: "#2878c8",
  "Under Inspection": "#e5b20a",
  "Pending Verification": "#e67e22",
  "At Risk": "#cf3e3e",
  Planned: "#8b96a3",
};

const statusOrder: MapStatus[] = [
  "Verified",
  "Active",
  "Under Inspection",
  "Pending Verification",
  "At Risk",
  "Planned",
];

const consultants = [
  "Northstar Engineering",
  "GreenLine Advisory",
  "Sahel Energy Partners",
  "GridWorks Consulting",
];

const lgaOverrides: Record<string, string[]> = {
  Kano: ["Dawakin Tofa", "Gwale", "Kumbotso", "Nassarawa", "Tarauni", "Ungogo"],
  Kaduna: ["Chikun", "Igabi", "Kaduna North", "Kaduna South", "Kajuru", "Zaria"],
  Lagos: ["Alimosho", "Eti-Osa", "Ikeja", "Kosofe", "Surulere", "Epe"],
  Niger: ["Bosso", "Chanchaga", "Kontagora", "Lapai", "Suleja", "Wushishi"],
  FCT: ["Abaji", "Bwari", "Gwagwalada", "Kuje", "Kwali", "Municipal"],
  Bauchi: ["Bauchi", "Dass", "Ganjiwa", "Katagum", "Misau", "Toro"],
  Rivers: ["Bonny", "Eleme", "Ikwerre", "Obio/Akpor", "Okrika", "Port Harcourt"],
};

const mapBounds = { minLon: 2.5, maxLon: 15, minLat: 3.5, maxLat: 14 };
const mapViewBox = { width: 760, height: 440 };
const meanLatRadians = (((mapBounds.minLat + mapBounds.maxLat) / 2) * Math.PI) / 180;
const lonCorrection = Math.cos(meanLatRadians);
const lonSpanAdjusted = (mapBounds.maxLon - mapBounds.minLon) * lonCorrection;
const latSpan = mapBounds.maxLat - mapBounds.minLat;
const mapScale = Math.min(mapViewBox.width / lonSpanAdjusted, mapViewBox.height / latSpan);
const mapOffsetX = (mapViewBox.width - lonSpanAdjusted * mapScale) / 2;
const mapOffsetY = (mapViewBox.height - latSpan * mapScale) / 2;
const densityPalette = ["#edf3ee", "#d7eadc", "#a9d5b6", "#67b47f", "#168247"];

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function lgasForState(state: string) {
  return (
    lgaOverrides[state] ?? [
      `${state} Central`,
      `${state} North`,
      `${state} South`,
      `${state} East`,
      `${state} West`,
      `${state} Rural`,
    ]
  );
}

function normaliseState(properties: Record<string, unknown>) {
  return String(properties.shapeName ?? properties.name ?? "")
    .replace(/ State$/i, "")
    .replace(/^(Abuja )?Federal Capital Territory$/i, "FCT");
}

function projectPoint(coordinate: number[]): Point {
  const [longitude, latitude] = coordinate;
  return {
    x: (longitude - mapBounds.minLon) * lonCorrection * mapScale + mapOffsetX,
    y: mapViewBox.height - mapOffsetY - (latitude - mapBounds.minLat) * mapScale,
  };
}

function geometryRings(geometry: BoundaryFeature["geometry"]) {
  return geometry.type === "Polygon"
    ? (geometry.coordinates as number[][][])
    : (geometry.coordinates as number[][][][]).flat();
}

function geometryPath(geometry: BoundaryFeature["geometry"]) {
  return geometryRings(geometry)
    .map(
      (ring) =>
        `${ring
          .map((coordinate, index) => {
            const point = projectPoint(coordinate);
            return `${index === 0 ? "M" : "L"}${point.x} ${point.y}`;
          })
          .join(" ")} Z`,
    )
    .join(" ");
}

function ringArea(ring: number[][]) {
  const points = ring.map(projectPoint);
  return (
    points.reduce((area, point, index) => {
      const next = points[(index + 1) % points.length];
      return area + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function geometryCentroid(geometry: BoundaryFeature["geometry"]): Point {
  const rings = geometryRings(geometry);
  const ring = rings.reduce(
    (largest, candidate) =>
      Math.abs(ringArea(candidate)) > Math.abs(ringArea(largest)) ? candidate : largest,
    rings[0],
  );
  const points = ring.map(projectPoint);
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const cross = point.x * next.y - next.x * point.y;
    twiceArea += cross;
    x += (point.x + next.x) * cross;
    y += (point.y + next.y) * cross;
  });
  if (Math.abs(twiceArea) < 0.001) {
    return points.reduce(
      (total, point) => ({ x: total.x + point.x / points.length, y: total.y + point.y / points.length }),
      { x: 0, y: 0 },
    );
  }
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
}

function densityBand(value: number, maximum: number) {
  if (!value) return 0;
  const ratio = maximum ? value / maximum : 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function statusForProject(project: Project, seed: number): MapStatus {
  if (project.verified) return "Verified";
  if (seed % 13 === 0) return "At Risk";
  if (seed % 11 === 0) return "Planned";
  if (project.status === "In progress") return "Active";
  if (project.status === "Submitted") return "Under Inspection";
  return "Pending Verification";
}

const mappedProjects: MapProject[] = projects.map((project, index) => {
  const seed = hashText(`${project.state}-${project.name}-${index}`);
  const lgas = lgasForState(project.state);
  const lga = lgas[seed % lgas.length];
  const monthDate = new Date(project.month);
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1 + (seed % 20));
  const completion = new Date(start);
  completion.setMonth(completion.getMonth() + 4 + (seed % 8));
  const mapStatus = statusForProject(project, seed);
  const progress = mapStatus === "Verified" ? 100 : mapStatus === "Planned" ? 8 + (seed % 12) : 35 + (seed % 61);
  return {
    ...project,
    id: `REA-${project.programme}-${project.state.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(4, "0")}`,
    lga,
    community: `${lga.split(" ")[0]} Community ${(seed % 4) + 1}`,
    projectType: project.component,
    mapStatus,
    phase: ["Planning", "Construction", "Commissioning", "Operations"][(seed >>> 3) % 4],
    consultant: consultants[(seed >>> 5) % consultants.length],
    inspectionStatus:
      mapStatus === "Verified"
        ? "Verified"
        : mapStatus === "Under Inspection"
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
      critical: mapStatus === "At Risk" ? 1 + (seed % 3) : seed % 9 === 0 ? 1 : 0,
      major: seed % 5,
      minor: 1 + (seed % 7),
    },
    openCorrectiveActions: seed % 6,
    pinX: 11 + (seed % 77),
    pinY: 13 + ((seed >>> 7) % 70),
  };
});

function unique(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

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
      <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-semibold text-slate-700 outline-none transition focus:border-[#17824b] focus:ring-2 focus:ring-[#17824b]/10"
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
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-[11px] font-semibold text-slate-500">{label}</span>
      <span className="max-w-[58%] text-right text-[12px] font-bold text-[#173b2a]">{value}</span>
    </div>
  );
}

function ReaProjectMap({ onClose, onOpenSection }: { onClose: () => void; onOpenSection: (section: string) => void }) {
  const [boundaries, setBoundaries] = useState<BoundaryFeature[]>([]);
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<MapProject | null>(null);
  const [search, setSearch] = useState("");
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
      .then((response) => response.json())
      .then((data: { features: BoundaryFeature[] }) => setBoundaries(data.features))
      .catch(() => setBoundaries([]));
  }, []);

  const filteredProjects = useMemo(() => {
    const from = filters.from ? Date.parse(filters.from) : Number.NEGATIVE_INFINITY;
    const to = filters.to ? Date.parse(filters.to) : Number.POSITIVE_INFINITY;
    const query = search.trim().toLowerCase();
    return mappedProjects.filter((project) => {
      const projectDate = Date.parse(project.startDate);
      return (
        (filters.state === "All States" || project.state === filters.state) &&
        (filters.lga === "All LGAs" || project.lga === filters.lga) &&
        (filters.community === "All Communities" || project.community === filters.community) &&
        (filters.type === "All Project Types" || project.projectType === filters.type) &&
        (filters.status === "All Statuses" || project.mapStatus === filters.status) &&
        (filters.phase === "All Phases" || project.phase === filters.phase) &&
        (filters.contractor === "All Contractors" || project.contractor === filters.contractor) &&
        (filters.consultant === "All Consultants" || project.consultant === filters.consultant) &&
        (filters.inspection === "All Inspection Statuses" || project.inspectionStatus === filters.inspection) &&
        projectDate >= from &&
        projectDate <= to &&
        (!query || `${project.id} ${project.name} ${project.community} ${project.contractor}`.toLowerCase().includes(query))
      );
    });
  }, [filters, search]);

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredProjects.forEach((project) => counts.set(project.state, (counts.get(project.state) ?? 0) + 1));
    return counts;
  }, [filteredProjects]);

  const stateProjects = useMemo(
    () => filteredProjects.filter((project) => !selectedState || project.state === selectedState),
    [filteredProjects, selectedState],
  );

  const lgaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    stateProjects.forEach((project) => counts.set(project.lga, (counts.get(project.lga) ?? 0) + 1));
    return counts;
  }, [stateProjects]);

  const lgaProjects = useMemo(
    () => stateProjects.filter((project) => !selectedLga || project.lga === selectedLga),
    [stateProjects, selectedLga],
  );

  const maximumStateCount = Math.max(0, ...stateCounts.values());
  const stateBoundaryData = useMemo(
    () =>
      boundaries.map((boundary, index) => ({
        boundary,
        state: normaliseState(boundary.properties),
        centroid: geometryCentroid(boundary.geometry),
        key: String(boundary.properties.shapeISO ?? boundary.properties.shapeID ?? index),
      })),
    [boundaries],
  );

  const lgaOptions = useMemo(() => {
    const state = filters.state !== "All States" ? filters.state : selectedState;
    return ["All LGAs", ...unique(mappedProjects.filter((project) => !state || project.state === state).map((project) => project.lga))];
  }, [filters.state, selectedState]);

  const communityOptions = useMemo(() => {
    return [
      "All Communities",
      ...unique(
        mappedProjects
          .filter((project) => filters.state === "All States" || project.state === filters.state)
          .filter((project) => filters.lga === "All LGAs" || project.lga === filters.lga)
          .map((project) => project.community),
      ),
    ];
  }, [filters.state, filters.lga]);

  const setFilter = (key: keyof FilterState, value: string) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === "state") {
        next.lga = "All LGAs";
        next.community = "All Communities";
      }
      if (key === "lga") next.community = "All Communities";
      return next;
    });
  };

  const drillToState = (state: string) => {
    setSelectedState(state);
    setSelectedLga(null);
  };

  const drillToLga = (lga: string) => setSelectedLga(lga);

  const resetView = () => {
    setSelectedState(null);
    setSelectedLga(null);
  };

  const resetFilters = () => {
    setFilters(defaultFilters);
    setSearch("");
  };

  const visibleLgas = selectedState ? lgasForState(selectedState) : [];
  const totalFiltered = filteredProjects.length;
  const verifiedFiltered = filteredProjects.filter((project) => project.mapStatus === "Verified").length;
  const riskFiltered = filteredProjects.filter((project) => project.mapStatus === "At Risk").length;

  return (
    <div className="fixed bottom-0 left-0 right-0 top-[94px] z-[24] flex overflow-hidden bg-[#eef3ef] lg:left-[190px]">
      <aside className="hidden w-[265px] shrink-0 flex-col border-r border-slate-200 bg-white xl:flex">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#168247]">Project Map</p>
              <p className="mt-1 text-[12px] text-slate-500">Locate and inspect individual projects</p>
            </div>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close project map">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Project ID, name, community..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-[12px] outline-none focus:border-[#168247] focus:bg-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-xs font-extrabold text-[#173b2a]"><Filter className="h-4 w-4" /> Filters</span>
            <button onClick={resetFilters} className="text-[10px] font-extrabold text-[#168247] hover:underline">Reset</button>
          </div>
          <div className="space-y-3">
            <SelectFilter label="State" value={filters.state} options={["All States", ...unique(mappedProjects.map((project) => project.state))]} onChange={(value) => setFilter("state", value)} />
            <SelectFilter label="LGA" value={filters.lga} options={lgaOptions} onChange={(value) => setFilter("lga", value)} />
            <SelectFilter label="Community" value={filters.community} options={communityOptions} onChange={(value) => setFilter("community", value)} />
            <SelectFilter label="Project Type" value={filters.type} options={["All Project Types", ...unique(mappedProjects.map((project) => project.projectType))]} onChange={(value) => setFilter("type", value)} />
            <SelectFilter label="Status" value={filters.status} options={["All Statuses", ...statusOrder]} onChange={(value) => setFilter("status", value)} />
            <SelectFilter label="Phase" value={filters.phase} options={["All Phases", ...unique(mappedProjects.map((project) => project.phase))]} onChange={(value) => setFilter("phase", value)} />
            <SelectFilter label="Contractor" value={filters.contractor} options={["All Contractors", ...unique(mappedProjects.map((project) => project.contractor))]} onChange={(value) => setFilter("contractor", value)} />
            <SelectFilter label="Consultant" value={filters.consultant} options={["All Consultants", ...unique(mappedProjects.map((project) => project.consultant))]} onChange={(value) => setFilter("consultant", value)} />
            <SelectFilter label="Inspection Status" value={filters.inspection} options={["All Inspection Statuses", ...unique(mappedProjects.map((project) => project.inspectionStatus))]} onChange={(value) => setFilter("inspection", value)} />
            <div>
              <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Date Range</span>
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-[10px] font-semibold text-slate-600" />
                <input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} className="h-9 min-w-0 rounded-lg border border-slate-200 px-2 text-[10px] font-semibold text-slate-600" />
              </div>
            </div>
          </div>

          <div className="my-5 h-px bg-slate-200" />
          <div className="mb-3 flex items-center gap-2 text-xs font-extrabold text-[#173b2a]"><Layers3 className="h-4 w-4" /> Layers</div>
          <div className="space-y-1.5">
            {layerNames.map((layer) => (
              <button
                key={layer}
                type="button"
                onClick={() => setLayers((current) => ({ ...current, [layer]: !current[layer] }))}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-[11px] font-bold transition ${layers[layer] ? "border-[#b9ddc5] bg-[#f0faf3] text-[#126e40]" : "border-slate-200 bg-white text-slate-500"}`}
              >
                {layer}
                <span className={`h-2.5 w-2.5 rounded-full ${layers[layer] ? "bg-[#168247]" : "bg-slate-300"}`} />
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-[58px] items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 lg:px-5">
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto text-[12px] font-bold text-slate-500">
            <button onClick={resetView} className={`whitespace-nowrap rounded-md px-2 py-1.5 ${!selectedState ? "bg-[#edf8f0] text-[#168247]" : "hover:bg-slate-100"}`}>Nigeria</button>
            {selectedState && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {selectedState && <button onClick={() => setSelectedLga(null)} className={`whitespace-nowrap rounded-md px-2 py-1.5 ${!selectedLga ? "bg-[#edf8f0] text-[#168247]" : "hover:bg-slate-100"}`}>{selectedState}</button>}
            {selectedLga && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {selectedLga && <span className="whitespace-nowrap rounded-md bg-[#edf8f0] px-2 py-1.5 text-[#168247]">{selectedLga}</span>}
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-extrabold text-slate-600">{totalFiltered} projects</span>
            <span className="rounded-full border border-[#bde1c9] bg-[#eef9f2] px-3 py-1.5 text-[10px] font-extrabold text-[#168247]">{verifiedFiltered} verified</span>
            <span className="rounded-full border border-[#f2c0c0] bg-[#fff3f3] px-3 py-1.5 text-[10px] font-extrabold text-[#b83030]">{riskFiltered} at risk</span>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden bg-[#e9efeb]">
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 xl:hidden">
            <button onClick={onClose} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm" aria-label="Close project map"><X className="h-4 w-4" /></button>
            <button onClick={resetFilters} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 shadow-sm"><RotateCcw className="mr-1 inline h-3.5 w-3.5" /> Reset filters</button>
          </div>

          {!selectedState ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-7">
              <div className="relative h-full w-full max-w-[1050px] rounded-2xl border border-[#cdd9d0] bg-[#f7faf7] shadow-sm">
                <div className="absolute left-4 top-4 z-10 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#168247]">National project coverage</p>
                  <p className="mt-1 text-[11px] text-slate-500">Click a state to drill down to LGAs. Individual projects appear only after selecting an LGA.</p>
                </div>
                {boundaries.length ? (
                  <svg viewBox={`0 0 ${mapViewBox.width} ${mapViewBox.height}`} className="h-full w-full p-5" role="img" aria-label="Nigeria project density map">
                    {stateBoundaryData.map(({ boundary, state, centroid, key }) => {
                      const count = stateCounts.get(state) ?? 0;
                      const fill = layers["Coverage Density"] ? densityPalette[densityBand(count, maximumStateCount)] : "#e8efea";
                      return (
                        <g key={key} className="cursor-pointer" onClick={() => drillToState(state)}>
                          <path d={geometryPath(boundary.geometry)} fill={fill} stroke="#ffffff" strokeWidth="1.5" className="transition hover:brightness-95" />
                          <text x={centroid.x} y={centroid.y - 2} textAnchor="middle" fill="#244237" fontSize="7.5" fontWeight="700" pointerEvents="none">{state}</text>
                          <text x={centroid.x} y={centroid.y + 7} textAnchor="middle" fill="#168247" fontSize="7" fontWeight="800" pointerEvents="none">{count}</text>
                        </g>
                      );
                    })}
                  </svg>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">Loading Nigeria state boundaries…</div>
                )}
              </div>
            </div>
          ) : !selectedLga ? (
            <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-7">
              <div className="relative h-full w-full max-w-[1050px] overflow-hidden rounded-2xl border border-[#cdd9d0] bg-[#f8fbf8] shadow-sm">
                <div className="absolute left-4 top-4 z-10 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#168247]">{selectedState} State</p>
                  <p className="mt-1 text-[11px] text-slate-500">Select an LGA to reveal individual project pins.</p>
                </div>
                <svg viewBox="0 0 900 520" className="h-full w-full p-5" role="img" aria-label={`${selectedState} LGA project map`}>
                  <path d="M90 120 L430 55 L805 125 L835 365 L480 470 L110 410 Z" fill="#eaf2ec" stroke="#b8cbbd" strokeWidth="2" />
                  {visibleLgas.map((lga, index) => {
                    const cells = [
                      "M120 140 L410 90 L415 240 L135 250 Z",
                      "M420 88 L785 145 L760 250 L418 240 Z",
                      "M135 255 L415 245 L410 405 L150 385 Z",
                      "M420 245 L755 255 L735 395 L420 410 Z",
                      "M245 130 L420 100 L420 245 L248 248 Z",
                      "M410 245 L610 250 L600 420 L420 410 Z",
                    ];
                    const labels = [
                      { x: 250, y: 190 },
                      { x: 610, y: 185 },
                      { x: 270, y: 325 },
                      { x: 610, y: 330 },
                      { x: 335, y: 170 },
                      { x: 505, y: 335 },
                    ];
                    const count = lgaCounts.get(lga) ?? 0;
                    const maximum = Math.max(0, ...lgaCounts.values());
                    return (
                      <g key={lga} className="cursor-pointer" onClick={() => drillToLga(lga)}>
                        <path d={cells[index % cells.length]} fill={layers["Coverage Density"] ? densityPalette[densityBand(count, maximum)] : "#edf2ee"} stroke="#ffffff" strokeWidth="3" className="transition hover:brightness-95" />
                        <text x={labels[index % labels.length].x} y={labels[index % labels.length].y} textAnchor="middle" fill="#234437" fontSize="13" fontWeight="800" pointerEvents="none">{lga}</text>
                        <text x={labels[index % labels.length].x} y={labels[index % labels.length].y + 18} textAnchor="middle" fill="#168247" fontSize="11" fontWeight="800" pointerEvents="none">{count} projects</text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 p-4 sm:p-7">
              <div className="relative h-full w-full overflow-hidden rounded-2xl border border-[#cdd9d0] bg-[#edf3ee] shadow-sm">
                <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "linear-gradient(#d7e1d9 1px, transparent 1px), linear-gradient(90deg, #d7e1d9 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
                <div className="absolute left-[8%] top-[22%] h-2 w-[84%] -rotate-6 rounded-full bg-white/80 shadow-sm" />
                <div className="absolute left-[24%] top-[9%] h-[82%] w-2 rotate-12 rounded-full bg-white/80 shadow-sm" />
                <div className="absolute right-[12%] top-[12%] rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm">
                  <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#168247]">{selectedLga}, {selectedState}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{lgaProjects.length} projects match the current filters</p>
                </div>

                {layers["Coverage Density"] && lgaProjects.map((project) => (
                  <span key={`heat-${project.id}`} className="absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#2d9f5c]/10 blur-xl" style={{ left: `${project.pinX}%`, top: `${project.pinY}%` }} />
                ))}

                {layers.Projects && lgaProjects.map((project) => {
                  const pinColor = layers.Status ? statusColors[project.mapStatus] : "#168247";
                  const contractorInitials = project.contractor.split(" ").slice(0, 2).map((part) => part[0]).join("");
                  return (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => setSelectedProject(project)}
                      className="group absolute z-10 -translate-x-1/2 -translate-y-full text-left"
                      style={{ left: `${project.pinX}%`, top: `${project.pinY}%` }}
                      title={`${project.id} · ${project.name}`}
                    >
                      <div className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-white shadow-lg transition group-hover:scale-110 ${selectedProject?.id === project.id ? "ring-4 ring-white/80" : ""}`} style={{ backgroundColor: pinColor }}>
                        <MapPin className="h-4 w-4" fill="currentColor" />
                        {layers["Critical Findings"] && project.findings.critical > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[#cf3e3e] px-1 text-[8px] font-black">!</span>}
                        {layers["Corrective Actions"] && project.openCorrectiveActions > 0 && <span className="absolute -bottom-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[#6b7280] px-1 text-[7px] font-black">{project.openCorrectiveActions}</span>}
                      </div>
                      {(layers.Contractors || layers.Inspections) && (
                        <div className="mt-1 flex max-w-[120px] flex-col gap-0.5 rounded-md border border-slate-200 bg-white/95 px-2 py-1 shadow-sm">
                          {layers.Contractors && <span className="truncate text-[8px] font-black text-slate-700">{contractorInitials} · {project.contractor}</span>}
                          {layers.Inspections && <span className="truncate text-[8px] font-bold text-[#168247]">{project.inspectionStatus}</span>}
                        </div>
                      )}
                    </button>
                  );
                })}

                {!lgaProjects.length && <div className="absolute inset-0 flex items-center justify-center"><div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm"><p className="text-sm font-extrabold text-[#173b2a]">No projects match these filters</p><button onClick={resetFilters} className="mt-2 text-xs font-bold text-[#168247] hover:underline">Clear filters</button></div></div>}

                <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-sm sm:right-auto">
                  {statusOrder.map((status) => <span key={status} className="flex items-center gap-1.5 text-[9px] font-bold text-slate-600"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[status] }} />{status}</span>)}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {selectedProject && (
        <aside className="absolute bottom-0 right-0 top-0 z-30 w-full max-w-[385px] overflow-y-auto border-l border-slate-200 bg-white shadow-[-12px_0_30px_rgba(31,52,41,0.12)] sm:w-[385px]">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColors[selectedProject.mapStatus] }} /><span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">{selectedProject.mapStatus}</span></div>
                <h2 className="mt-2 text-[17px] font-extrabold leading-tight text-[#173b2a]">{selectedProject.name}</h2>
                <p className="mt-1 text-[11px] font-bold text-[#168247]">{selectedProject.id}</p>
              </div>
              <button onClick={() => setSelectedProject(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close project details"><X className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <section className="rounded-xl border border-slate-200 bg-[#f9fbf9] p-4">
              <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Delivery progress</span><span className="text-sm font-black text-[#168247]">{selectedProject.progress}%</span></div>
              <div className="h-2 rounded-full bg-slate-200"><div className="h-2 rounded-full bg-[#168247]" style={{ width: `${selectedProject.progress}%` }} /></div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white px-4 py-1">
              <DetailRow label="Location" value={`${selectedProject.community}, ${selectedProject.lga}, ${selectedProject.state}`} />
              <DetailRow label="Project type" value={selectedProject.projectType} />
              <DetailRow label="Contractor" value={selectedProject.contractor} />
              <DetailRow label="Consultant" value={selectedProject.consultant} />
              <DetailRow label="Phase" value={selectedProject.phase} />
              <DetailRow label="Start date" value={selectedProject.startDate} />
              <DetailRow label="Target completion" value={selectedProject.completionDate} />
            </section>

            <section className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-white p-3"><ShieldCheck className="h-4 w-4 text-[#168247]" /><p className="mt-2 text-lg font-black text-[#173b2a]">{selectedProject.inspectionScore}%</p><p className="text-[10px] font-bold text-slate-500">Last inspection score</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><CheckCircle2 className="h-4 w-4 text-[#168247]" /><p className="mt-2 text-[12px] font-black text-[#173b2a]">{selectedProject.inspectionStatus}</p><p className="mt-1 text-[10px] font-bold text-slate-500">Verification status</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><UsersRound className="h-4 w-4 text-[#2878c8]" /><p className="mt-2 text-lg font-black text-[#173b2a]">{selectedProject.beneficiaries.toLocaleString()}</p><p className="text-[10px] font-bold text-slate-500">Beneficiaries</p></div>
              <div className="rounded-xl border border-slate-200 bg-white p-3"><Building2 className="h-4 w-4 text-[#2878c8]" /><p className="mt-2 text-lg font-black text-[#173b2a]">{selectedProject.households.toLocaleString()}</p><p className="text-[10px] font-bold text-slate-500">Households · {selectedProject.communities} communities</p></div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-extrabold text-[#173b2a]"><AlertTriangle className="h-4 w-4 text-[#cf3e3e]" /> Findings by severity</div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-red-50 px-2 py-3"><p className="text-lg font-black text-red-700">{selectedProject.findings.critical}</p><p className="text-[9px] font-bold text-red-600">Critical</p></div>
                <div className="rounded-lg bg-orange-50 px-2 py-3"><p className="text-lg font-black text-orange-700">{selectedProject.findings.major}</p><p className="text-[9px] font-bold text-orange-600">Major</p></div>
                <div className="rounded-lg bg-amber-50 px-2 py-3"><p className="text-lg font-black text-amber-700">{selectedProject.findings.minor}</p><p className="text-[9px] font-bold text-amber-600">Minor</p></div>
              </div>
            </section>

            <section className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Open corrective actions</p><p className="mt-1 text-2xl font-black text-[#173b2a]">{selectedProject.openCorrectiveActions}</p></div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Wrench className="h-5 w-5" /></div>
            </section>

            <div className="grid grid-cols-1 gap-2 pb-3 sm:grid-cols-3">
              <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="rounded-lg bg-[#168247] px-3 py-2.5 text-[10px] font-extrabold text-white hover:bg-[#116c3c]">View Project</button>
              <button onClick={() => onOpenSection("Verification")} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50">View Inspections</button>
              <button onClick={() => onOpenSection("Reports")} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-extrabold text-slate-700 hover:bg-slate-50">View Reports</button>
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
    const styleNativeNavigation = (mapIsOpen: boolean) => {
      document.querySelectorAll("nav button").forEach((button) => {
        const element = button as HTMLElement;
        if (element.dataset.veritasProjectMap === "true") {
          element.style.background = mapIsOpen ? "#edf9f0" : "";
          element.style.color = mapIsOpen ? "#08733f" : "";
        } else if (mapIsOpen) {
          element.style.background = "transparent";
          element.style.color = "#64748b";
        } else {
          element.style.background = "";
          element.style.color = "";
        }
      });
    };

    const installButtons = () => {
      document.querySelectorAll("nav").forEach((nav) => {
        if (nav.querySelector('[data-veritas-project-map="true"]')) return;
        const buttons = Array.from(nav.querySelectorAll("button"));
        const overview = buttons.find((button) => button.textContent?.trim() === "Overview");
        if (!overview) return;
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.veritasProjectMap = "true";
        button.className = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg><span>Project Map</span>';
        button.addEventListener("click", () => {
          setOpen(true);
          styleNativeNavigation(true);
        });
        overview.insertAdjacentElement("afterend", button);
      });
      styleNativeNavigation(open);
    };

    const handleNativeClick = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("nav button") as HTMLElement | null;
      if (!button || button.dataset.veritasProjectMap === "true") return;
      setOpen(false);
      styleNativeNavigation(false);
    };

    installButtons();
    const observer = new MutationObserver(installButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", handleNativeClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", handleNativeClick, true);
      document.querySelectorAll('[data-veritas-project-map="true"]').forEach((button) => button.remove());
    };
  }, [open]);

  const openNativeSection = (section: string) => {
    const button = Array.from(document.querySelectorAll("nav button")).find((candidate) => candidate.textContent?.trim() === section) as HTMLButtonElement | undefined;
    if (button) button.click();
    setOpen(false);
  };

  if (!open) return null;
  return <ReaProjectMap onClose={() => setOpen(false)} onOpenSection={openNativeSection} />;
}
