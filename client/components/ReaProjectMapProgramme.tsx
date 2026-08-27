import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Filter,
  LocateFixed,
  MapPinned,
  Minus,
  Plus,
  Search,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import { projects, type Project } from "../lib/dashboard-data";

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

type Point = { x: number; y: number };
type Projector = (coordinate: number[]) => Point;

type MapProject = Project & {
  id: string;
  lga: string;
};

type AreaMetrics = {
  projects: number;
  verified: number;
  kw: number;
  households: number;
};

const NATIONAL_VIEW = { width: 900, height: 560 };
const STATE_VIEW = { width: 940, height: 580 };
const LGA_SOURCE =
  "https://cdn.jsdelivr.net/gh/qedsoftware/geojson_data@main/nigeria-lga.geojson";

const programmeColors: Record<string, string> = {
  NEP: "#128149",
  DARES: "#2563eb",
  AMP: "#f59e0b",
  Others: "#64748b",
};

const densityPalette = ["#eef3ef", "#dbece0", "#b9d9c2", "#80bb90", "#2b8b55"];
const emptyMetrics: AreaMetrics = { projects: 0, verified: 0, kw: 0, households: 0 };

function hashText(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
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
    feature.properties.NAME_1 ??
      feature.properties.shapeName ??
      feature.properties.name ??
      feature.properties.STATE,
  );
}

function lgaName(feature: GeoFeature) {
  return String(
    feature.properties.VARNAME_2 ??
      feature.properties.NAME_2 ??
      feature.properties.shapeName ??
      feature.properties.name ??
      "LGA",
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

function makeProjector(
  features: GeoFeature[],
  width: number,
  height: number,
  padding = 30,
): Projector {
  const coordinates = allCoordinates(features);
  if (!coordinates.length) return () => ({ x: width / 2, y: height / 2 });

  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lonSpan = Math.max(maxLon - minLon, 0.001);
  const latSpan = Math.max(maxLat - minLat, 0.001);
  const scale = Math.min(
    (width - padding * 2) / lonSpan,
    (height - padding * 2) / latSpan,
  );
  const usedWidth = lonSpan * scale;
  const usedHeight = latSpan * scale;
  const offsetX = (width - usedWidth) / 2;
  const offsetY = (height - usedHeight) / 2;

  return ([lon, lat]) => ({
    x: offsetX + (lon - minLon) * scale,
    y: offsetY + (maxLat - lat) * scale,
  });
}

function geometryPath(geometry: GeoFeature["geometry"], projector: Projector) {
  return geometryRings(geometry)
    .map(
      (ring) =>
        ring
          .map((coordinate, index) => {
            const point = projector(coordinate);
            return `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
          })
          .join(" ") + " Z",
    )
    .join(" ");
}

function largestRing(feature: GeoFeature) {
  const rings = geometryRings(feature.geometry);
  return rings.reduce(
    (largest, candidate) => (candidate.length > largest.length ? candidate : largest),
    rings[0] ?? [],
  );
}

function featureCentroid(feature: GeoFeature, projector: Projector) {
  const ring = largestRing(feature);
  if (!ring.length) return { x: 0, y: 0 };
  return ring.reduce(
    (total, coordinate) => {
      const point = projector(coordinate);
      return {
        x: total.x + point.x / ring.length,
        y: total.y + point.y / ring.length,
      };
    },
    { x: 0, y: 0 },
  );
}

function jitterWithin(
  feature: GeoFeature,
  seed: number,
  projector: Projector,
  fraction: number,
  nudge = 0,
): Point {
  const centroid = featureCentroid(feature, projector);
  const ring = largestRing(feature);
  if (!ring.length) return centroid;

  const points = ring.map((coordinate) => projector(coordinate));
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const radius = (Math.min(maxX - minX, maxY - minY) / 2) * fraction;
  const angle = ((seed % 360) * Math.PI) / 180;
  const spread = 0.2 + 0.74 * (((seed >>> 5) % 97) / 97);

  return {
    x: centroid.x + Math.cos(angle) * (radius * spread + nudge),
    y: centroid.y + Math.sin(angle) * (radius * spread + nudge),
  };
}

function enrichProjects(lgaFeatures: GeoFeature[]): MapProject[] {
  const byState = new Map<string, GeoFeature[]>();
  lgaFeatures.forEach((feature) => {
    const state = stateName(feature);
    if (!state) return;
    const existing = byState.get(state) ?? [];
    existing.push(feature);
    byState.set(state, existing);
  });

  return projects.map((project, index) => {
    const seed = hashText(`${project.state}-${project.name}-${index}`);
    const available = byState.get(project.state) ?? [];
    const feature = available.length ? available[seed % available.length] : undefined;
    const lga = feature ? lgaName(feature) : `${project.state} LGA`;

    return {
      ...project,
      id: `REA-${project.programme}-${project.state.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(4, "0")}`,
      lga,
    };
  });
}

function aggregateBy(projectList: MapProject[], key: "state" | "lga") {
  const map = new Map<string, AreaMetrics>();
  projectList.forEach((project) => {
    const name = project[key];
    const current = map.get(name) ?? { ...emptyMetrics };
    current.projects += 1;
    current.verified += project.verified ? 1 : 0;
    current.kw += project.kw;
    current.households += project.households;
    map.set(name, current);
  });
  return map;
}

function summarizeProjects(projectList: MapProject[]): AreaMetrics {
  return {
    projects: projectList.length,
    verified: projectList.filter((project) => project.verified).length,
    kw: projectList.reduce((sum, project) => sum + project.kw, 0),
    households: projectList.reduce((sum, project) => sum + project.households, 0),
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

function formatMw(kw: number) {
  const mw = kw / 1000;
  return `${mw >= 10 ? mw.toFixed(1) : mw.toFixed(2)} MW`;
}

function compactNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return value.toLocaleString();
}

function programmeColor(programme: string) {
  return programmeColors[programme] ?? programmeColors.Others;
}

function MetricLabel({
  name,
  metrics,
  x,
  y,
  compact = false,
}: {
  name: string;
  metrics: AreaMetrics;
  x: number;
  y: number;
  compact?: boolean;
}) {
  const title = compact && name.length > 18 ? `${name.slice(0, 17)}…` : name;
  const titleSize = compact ? 7.2 : 7.5;
  const metricSize = compact ? 5.6 : 5.8;
  return (
    <g pointerEvents="none">
      <text
        x={x}
        y={y - 7}
        textAnchor="middle"
        fill="#203c2d"
        fontSize={titleSize}
        fontWeight="800"
        stroke="#f9fbfa"
        strokeWidth="2.4"
        paintOrder="stroke"
      >
        {title}
      </text>
      <text
        x={x}
        y={y + 1}
        textAnchor="middle"
        fill="#315344"
        fontSize={metricSize}
        fontWeight="800"
        stroke="#f9fbfa"
        strokeWidth="2.1"
        paintOrder="stroke"
      >
        P {metrics.projects} · V {metrics.verified}
      </text>
      <text
        x={x}
        y={y + 8}
        textAnchor="middle"
        fill="#128149"
        fontSize={metricSize}
        fontWeight="850"
        stroke="#f9fbfa"
        strokeWidth="2.1"
        paintOrder="stroke"
      >
        {formatMw(metrics.kw)} · {compactNumber(metrics.households)} HH
      </text>
    </g>
  );
}

function ProjectMap({
  onClose,
  onOpenSection,
}: {
  onClose: () => void;
  onOpenSection: (section: string) => void;
}) {
  const [stateFeatures, setStateFeatures] = useState<GeoFeature[]>([]);
  const [lgaFeatures, setLgaFeatures] = useState<GeoFeature[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<MapProject | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [programme, setProgramme] = useState("All Programmes");
  const [component, setComponent] = useState("All Components");
  const [contractor, setContractor] = useState("All Contractors");
  const [stateFilter, setStateFilter] = useState("All States");
  const [lgaFilter, setLgaFilter] = useState("All LGAs");
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(1);
  const [hoveredArea, setHoveredArea] = useState<{
    name: string;
    metrics: AreaMetrics;
    x: number;
    y: number;
  } | null>(null);
  const mapShellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/nigeria-adm1.geojson")
      .then((response) => response.json())
      .then((data: { features?: GeoFeature[] }) => setStateFeatures(data.features ?? []))
      .catch(() => setStateFeatures([]));

    fetch(LGA_SOURCE)
      .then((response) => {
        if (!response.ok) throw new Error("LGA boundary request failed");
        return response.json();
      })
      .then((data: { features?: GeoFeature[] }) => setLgaFeatures(data.features ?? []))
      .catch(() => setLgaFeatures([]));
  }, []);

  const mappedProjects = useMemo(() => enrichProjects(lgaFeatures), [lgaFeatures]);

  const stateOptions = useMemo(
    () => ["All States", ...unique(mappedProjects.map((project) => project.state))],
    [mappedProjects],
  );

  const lgaOptions = useMemo(() => {
    const effectiveState = stateFilter !== "All States" ? stateFilter : selectedState;
    return [
      "All LGAs",
      ...unique(
        mappedProjects
          .filter((project) => !effectiveState || project.state === effectiveState)
          .map((project) => project.lga),
      ),
    ];
  }, [mappedProjects, selectedState, stateFilter]);

  const filteredProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return mappedProjects.filter((project) => {
      return (
        (programme === "All Programmes" || project.programme === programme) &&
        (component === "All Components" || project.component === component) &&
        (contractor === "All Contractors" || project.contractor === contractor) &&
        (stateFilter === "All States" || project.state === stateFilter) &&
        (lgaFilter === "All LGAs" || project.lga === lgaFilter) &&
        (!query ||
          `${project.id} ${project.name} ${project.state} ${project.lga} ${project.contractor}`
            .toLowerCase()
            .includes(query))
      );
    });
  }, [component, contractor, lgaFilter, mappedProjects, programme, search, stateFilter]);

  const selectedStateLgas = useMemo(
    () => lgaFeatures.filter((feature) => stateName(feature) === selectedState),
    [lgaFeatures, selectedState],
  );

  const stateProjects = useMemo(
    () => filteredProjects.filter((project) => !selectedState || project.state === selectedState),
    [filteredProjects, selectedState],
  );

  const lgaProjects = useMemo(
    () => stateProjects.filter((project) => !selectedLga || project.lga === selectedLga),
    [selectedLga, stateProjects],
  );

  const stateMetrics = useMemo(() => aggregateBy(filteredProjects, "state"), [filteredProjects]);
  const lgaMetrics = useMemo(() => aggregateBy(stateProjects, "lga"), [stateProjects]);
  const nationalMetrics = useMemo(() => summarizeProjects(filteredProjects), [filteredProjects]);
  const displayMetrics = useMemo(() => {
    if (selectedLga) return summarizeProjects(lgaProjects);
    if (selectedState) return summarizeProjects(stateProjects);
    return nationalMetrics;
  }, [lgaProjects, nationalMetrics, selectedLga, selectedState, stateProjects]);

  const stateProjector = useMemo(
    () => makeProjector(stateFeatures, NATIONAL_VIEW.width, NATIONAL_VIEW.height, 34),
    [stateFeatures],
  );
  const lgaProjector = useMemo(
    () => makeProjector(selectedStateLgas, STATE_VIEW.width, STATE_VIEW.height, 42),
    [selectedStateLgas],
  );

  const stateFeatureByName = useMemo(
    () => new Map(stateFeatures.map((feature) => [stateName(feature), feature])),
    [stateFeatures],
  );
  const lgaFeatureByName = useMemo(
    () => new Map(selectedStateLgas.map((feature) => [lgaName(feature), feature])),
    [selectedStateLgas],
  );

  const selectedLgaFeature = useMemo(
    () => selectedStateLgas.find((feature) => lgaName(feature) === selectedLga),
    [selectedLga, selectedStateLgas],
  );

  const nationalPoints = useMemo(() => {
    const positions = new Map<string, Point>();
    filteredProjects.forEach((project) => {
      const feature = stateFeatureByName.get(project.state);
      if (!feature) return;
      positions.set(
        project.id,
        jitterWithin(feature, hashText(project.id), stateProjector, 0.58),
      );
    });
    return positions;
  }, [filteredProjects, stateFeatureByName, stateProjector]);

  const statePoints = useMemo(() => {
    const positions = new Map<string, Point>();
    stateProjects.forEach((project) => {
      const feature = lgaFeatureByName.get(project.lga);
      if (!feature) return;
      positions.set(
        project.id,
        jitterWithin(feature, hashText(project.id), lgaProjector, 0.62),
      );
    });
    return positions;
  }, [lgaFeatureByName, lgaProjector, stateProjects]);

  const lgaPoints = useMemo(() => {
    const positions = new Map<string, Point>();
    if (!selectedLgaFeature) return positions;
    lgaProjects.forEach((project, index) => {
      positions.set(
        project.id,
        jitterWithin(
          selectedLgaFeature,
          hashText(project.id),
          lgaProjector,
          0.76,
          (index % 3) * 2.5,
        ),
      );
    });
    return positions;
  }, [lgaProjector, lgaProjects, selectedLgaFeature]);

  const maximumStateProjects = Math.max(
    0,
    ...Array.from(stateMetrics.values()).map((metrics) => metrics.projects),
  );
  const maximumLgaProjects = Math.max(
    0,
    ...Array.from(lgaMetrics.values()).map((metrics) => metrics.projects),
  );

  const resetAll = () => {
    setProgramme("All Programmes");
    setComponent("All Components");
    setContractor("All Contractors");
    setStateFilter("All States");
    setLgaFilter("All LGAs");
    setSearch("");
    setSelectedState(null);
    setSelectedLga(null);
    setSelectedProject(null);
    setZoom(1);
  };

  const openState = (state: string) => {
    setSelectedState(state);
    setSelectedLga(null);
    setSelectedProject(null);
    setZoom(1);
  };

  const openLga = (lga: string) => {
    setSelectedLga(lga);
    setSelectedProject(null);
    setZoom(1);
  };

  const showAreaTooltip = (
    event: React.MouseEvent<SVGGElement>,
    name: string,
    metrics: AreaMetrics,
  ) => {
    const shell = mapShellRef.current?.getBoundingClientRect();
    if (!shell) return;
    setHoveredArea({
      name,
      metrics,
      x: Math.min(event.clientX - shell.left + 16, shell.width - 210),
      y: Math.min(event.clientY - shell.top + 16, shell.height - 130),
    });
  };

  const selectStateFilter = (value: string) => {
    setStateFilter(value);
    setLgaFilter("All LGAs");
    if (value === "All States") {
      setSelectedState(null);
      setSelectedLga(null);
    } else {
      openState(value);
    }
  };

  const selectLgaFilter = (value: string) => {
    setLgaFilter(value);
    if (value !== "All LGAs") openLga(value);
  };

  const mapTitle = !selectedState
    ? "Nigeria · National Project Coverage"
    : !selectedLga
      ? `${selectedState} · Local Government Coverage`
      : `${selectedLga} · Project Locations`;

  return (
    <div className="fixed bottom-0 left-0 right-0 top-[94px] z-[24] overflow-hidden bg-[#edf2ee] lg:left-[190px]">
      <section className="flex h-full min-w-0 flex-col">
        <header className="flex min-h-[64px] items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-5">
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-[11px] font-bold text-slate-500">
            <button
              type="button"
              onClick={() => {
                setSelectedState(null);
                setSelectedLga(null);
                setSelectedProject(null);
                setZoom(1);
              }}
              className={`whitespace-nowrap rounded-md px-2 py-1.5 ${!selectedState ? "bg-[#edf8f0] text-[#138049]" : "hover:bg-slate-100"}`}
            >
              Nigeria
            </button>
            {selectedState && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
            {selectedState && (
              <button
                type="button"
                onClick={() => {
                  setSelectedLga(null);
                  setSelectedProject(null);
                  setZoom(1);
                }}
                className={`whitespace-nowrap rounded-md px-2 py-1.5 ${!selectedLga ? "bg-[#edf8f0] text-[#138049]" : "hover:bg-slate-100"}`}
              >
                {selectedState}
              </button>
            )}
            {selectedLga && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />}
            {selectedLga && (
              <span className="whitespace-nowrap rounded-md bg-[#edf8f0] px-2 py-1.5 text-[#138049]">
                {selectedLga}
              </span>
            )}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            <span className="rounded-md border border-slate-200 bg-[#fafcfb] px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {displayMetrics.projects.toLocaleString()} Projects
            </span>
            <span className="rounded-md border border-[#c6e2cf] bg-[#f0f9f3] px-2.5 py-1.5 text-[9px] font-extrabold text-[#138049]">
              {displayMetrics.verified.toLocaleString()} Verified
            </span>
            <span className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[9px] font-extrabold text-blue-700">
              {formatMw(displayMetrics.kw)}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[9px] font-extrabold text-slate-600">
              {displayMetrics.households.toLocaleString()} Households
            </span>
            <button
              type="button"
              onClick={onClose}
              className="ml-1 rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close project map"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="relative flex-1 overflow-hidden p-3 sm:p-4 lg:p-5">
          <div
            ref={mapShellRef}
            className="relative h-full overflow-hidden rounded-xl border border-[#d4ded7] bg-[#f9fbfa] shadow-[0_8px_24px_rgba(26,55,40,0.06)]"
          >
            <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-[#173b2a] shadow-sm transition hover:border-[#9dc9aa] hover:text-[#128149]"
                aria-label="Open project map panel"
                title="Open project map panel"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <div className="hidden rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:block">
                <p className="text-[9px] font-black uppercase tracking-[0.13em] text-[#128149]">{mapTitle}</p>
                <p className="mt-0.5 text-[9px] text-slate-500">Dots are projects; colour identifies programme.</p>
              </div>
            </div>

            <div className="absolute right-4 top-4 z-20 flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setZoom((value) => Math.min(1.85, Number((value + 0.15).toFixed(2))))}
                className="p-2 text-slate-500 transition hover:bg-slate-50"
                aria-label="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((value) => Math.max(0.85, Number((value - 0.15).toFixed(2))))}
                className="border-l border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                aria-label="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="border-l border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
                aria-label="Reset zoom"
              >
                <LocateFixed className="h-3.5 w-3.5" />
              </button>
            </div>

            {!selectedState ? (
              stateFeatures.length ? (
                <svg
                  viewBox={`0 0 ${NATIONAL_VIEW.width} ${NATIONAL_VIEW.height}`}
                  className="h-full w-full p-4 pt-14"
                  onMouseLeave={() => setHoveredArea(null)}
                >
                  <g
                    transform={`translate(${NATIONAL_VIEW.width / 2} ${NATIONAL_VIEW.height / 2}) scale(${zoom}) translate(${-NATIONAL_VIEW.width / 2} ${-NATIONAL_VIEW.height / 2})`}
                  >
                    {stateFeatures.map((feature, index) => {
                      const name = stateName(feature);
                      const metrics = stateMetrics.get(name) ?? emptyMetrics;
                      const centroid = featureCentroid(feature, stateProjector);
                      const fill = densityPalette[
                        densityBand(metrics.projects, maximumStateProjects)
                      ];

                      return (
                        <g
                          key={`${name}-${index}`}
                          className="cursor-pointer"
                          onClick={() => openState(name)}
                          onMouseMove={(event) => showAreaTooltip(event, name, metrics)}
                        >
                          <path
                            d={geometryPath(feature.geometry, stateProjector)}
                            fill={fill}
                            stroke="#ffffff"
                            strokeWidth="1.35"
                            vectorEffect="non-scaling-stroke"
                          />
                          <MetricLabel
                            name={name}
                            metrics={metrics}
                            x={centroid.x}
                            y={centroid.y}
                          />
                        </g>
                      );
                    })}

                    {filteredProjects.map((project) => {
                      const position = nationalPoints.get(project.id);
                      if (!position) return null;
                      const color = programmeColor(project.programme);
                      return (
                        <g
                          key={project.id}
                          className="cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation();
                            openState(project.state);
                          }}
                        >
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r="2.8"
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth="0.95"
                            vectorEffect="non-scaling-stroke"
                          >
                            <title>{`${project.name} · ${project.programme}`}</title>
                          </circle>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              ) : (
                <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-400">Loading Nigeria map…</div>
              )
            ) : selectedStateLgas.length ? (
              <svg
                viewBox={`0 0 ${STATE_VIEW.width} ${STATE_VIEW.height}`}
                className="h-full w-full p-4 pt-14"
                onMouseLeave={() => setHoveredArea(null)}
              >
                <g
                  transform={`translate(${STATE_VIEW.width / 2} ${STATE_VIEW.height / 2}) scale(${zoom}) translate(${-STATE_VIEW.width / 2} ${-STATE_VIEW.height / 2})`}
                >
                  {selectedStateLgas.map((feature, index) => {
                    const name = lgaName(feature);
                    const metrics = lgaMetrics.get(name) ?? emptyMetrics;
                    const centroid = featureCentroid(feature, lgaProjector);
                    const isSelected = selectedLga === name;
                    const fill = isSelected
                      ? "#dff1e5"
                      : densityPalette[densityBand(metrics.projects, maximumLgaProjects)];

                    return (
                      <g
                        key={`${name}-${index}`}
                        className="cursor-pointer"
                        onClick={() => openLga(name)}
                        onMouseMove={(event) => showAreaTooltip(event, name, metrics)}
                      >
                        <path
                          d={geometryPath(feature.geometry, lgaProjector)}
                          fill={fill}
                          stroke={isSelected ? "#117a44" : "#ffffff"}
                          strokeWidth={isSelected ? "2" : "1.2"}
                          vectorEffect="non-scaling-stroke"
                        />
                        {!selectedLga && (
                          <MetricLabel
                            name={name}
                            metrics={metrics}
                            x={centroid.x}
                            y={centroid.y}
                            compact
                          />
                        )}
                      </g>
                    );
                  })}

                  {!selectedLga &&
                    stateProjects.map((project) => {
                      const position = statePoints.get(project.id);
                      if (!position) return null;
                      const color = programmeColor(project.programme);
                      return (
                        <g
                          key={project.id}
                          className="cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation();
                            openLga(project.lga);
                          }}
                        >
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r="3.1"
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth="1"
                            vectorEffect="non-scaling-stroke"
                          >
                            <title>{`${project.name} · ${project.programme}`}</title>
                          </circle>
                        </g>
                      );
                    })}

                  {selectedLga &&
                    lgaProjects.map((project, index) => {
                      const position = lgaPoints.get(project.id);
                      if (!position) return null;
                      const color = programmeColor(project.programme);
                      const selected = selectedProject?.id === project.id;
                      const radius = 5 + Math.min(4, project.kw / 220);

                      return (
                        <g
                          key={project.id}
                          className="cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedProject(project);
                          }}
                        >
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r={radius + 2}
                            fill="#ffffff"
                            opacity="0.96"
                          />
                          <circle
                            cx={position.x}
                            cy={position.y}
                            r={radius}
                            fill={color}
                            stroke="#ffffff"
                            strokeWidth="1.4"
                            vectorEffect="non-scaling-stroke"
                          >
                            <title>{`${project.name} · ${project.programme} · ${formatMw(project.kw)}`}</title>
                          </circle>
                          {selected && (
                            <circle
                              cx={position.x}
                              cy={position.y}
                              r={radius + 5}
                              fill="none"
                              stroke={color}
                              strokeWidth="1.5"
                              opacity="0.55"
                            />
                          )}
                          {index < 10 && (
                            <text
                              x={position.x + radius + 4}
                              y={position.y + 3}
                              fill="#355246"
                              fontSize="7"
                              fontWeight="750"
                            >
                              {project.programme}
                            </text>
                          )}
                        </g>
                      );
                    })}
                </g>
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm font-semibold text-slate-400">
                Loading Local Government boundaries for {selectedState}…
              </div>
            )}

            {hoveredArea && (
              <div
                className="pointer-events-none absolute z-30 min-w-[195px] rounded-lg border border-slate-200 bg-[#173b2a] px-3.5 py-3 text-white shadow-lg"
                style={{ left: hoveredArea.x, top: hoveredArea.y }}
              >
                <p className="text-[11px] font-extrabold">{hoveredArea.name}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9px]">
                  <span className="text-white/60">Projects</span>
                  <strong className="text-right">{hoveredArea.metrics.projects.toLocaleString()}</strong>
                  <span className="text-white/60">Verified</span>
                  <strong className="text-right">{hoveredArea.metrics.verified.toLocaleString()}</strong>
                  <span className="text-white/60">Capacity</span>
                  <strong className="text-right">{formatMw(hoveredArea.metrics.kw)}</strong>
                  <span className="text-white/60">Households</span>
                  <strong className="text-right">{hoveredArea.metrics.households.toLocaleString()}</strong>
                </div>
                <p className="mt-2 border-t border-white/10 pt-2 text-[8px] text-white/55">Click to drill down</p>
              </div>
            )}

            <div className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
              <span className="text-[8px] font-extrabold uppercase tracking-[0.09em] text-slate-500">Programme</span>
              {[
                ["NEP", programmeColors.NEP],
                ["DARES", programmeColors.DARES],
                ["AMP", programmeColors.AMP],
              ].map(([name, color]) => (
                <span key={name} className="flex items-center gap-1.5 text-[8px] font-bold text-slate-600">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                  {name}
                </span>
              ))}
              {mappedProjects.some((project) => project.programme === "Others") && (
                <span className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: programmeColors.Others }} />
                  Other
                </span>
              )}
              <span className="border-l border-slate-200 pl-3 text-[8px] font-semibold text-slate-400">Each dot = project</span>
            </div>
          </div>
        </div>
      </section>

      {filtersOpen && (
        <>
          <button
            type="button"
            className="absolute inset-0 z-30 bg-slate-950/10"
            onClick={() => setFiltersOpen(false)}
            aria-label="Close project map panel"
          />
          <aside className="absolute bottom-0 left-0 top-0 z-40 flex w-[310px] max-w-[88vw] flex-col border-r border-slate-200 bg-white shadow-[12px_0_30px_rgba(25,50,36,0.12)]">
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#128149]">
                    <MapPinned className="h-4 w-4" /> Project Map
                  </p>
                  <h2 className="mt-1 text-[16px] font-extrabold text-[#173b2a]">Explore & filter</h2>
                  <p className="mt-1 text-[10px] leading-4 text-slate-500">The map stays full-width until you open this panel.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md p-2 text-slate-400 hover:bg-slate-100"
                  aria-label="Close filters"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search project ID or name"
                  className="h-10 w-full rounded-md border border-slate-200 bg-[#fafcfb] pl-9 pr-3 text-[11px] font-medium outline-none focus:border-[#16824b] focus:ring-2 focus:ring-[#16824b]/10"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-[11px] font-extrabold text-[#173b2a]">
                  <Filter className="h-3.5 w-3.5" /> Filters
                </span>
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-[#128149]"
                >
                  Clear all
                </button>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Programme</span>
                  <select
                    value={programme}
                    onChange={(event) => setProgramme(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#16824b]"
                  >
                    {["All Programmes", ...unique(mappedProjects.map((project) => project.programme))].map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">State</span>
                  <select
                    value={stateFilter}
                    onChange={(event) => selectStateFilter(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#16824b]"
                  >
                    {stateOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Local Government</span>
                  <select
                    value={lgaFilter}
                    onChange={(event) => selectLgaFilter(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#16824b]"
                  >
                    {lgaOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Component</span>
                  <select
                    value={component}
                    onChange={(event) => setComponent(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#16824b]"
                  >
                    {["All Components", ...unique(mappedProjects.map((project) => project.component))].map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Contractor</span>
                  <select
                    value={contractor}
                    onChange={(event) => setContractor(event.target.value)}
                    className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#16824b]"
                  >
                    {["All Contractors", ...unique(mappedProjects.map((project) => project.contractor))].map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-[#f8faf8] p-3">
                <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Current view</p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-white p-2.5">
                    <p className="text-lg font-black text-[#173b2a]">{displayMetrics.projects}</p>
                    <p className="text-[8px] font-bold text-slate-500">Projects</p>
                  </div>
                  <div className="rounded-md bg-white p-2.5">
                    <p className="text-lg font-black text-[#128149]">{displayMetrics.verified}</p>
                    <p className="text-[8px] font-bold text-slate-500">Verified</p>
                  </div>
                  <div className="rounded-md bg-white p-2.5">
                    <p className="text-sm font-black text-blue-700">{formatMw(displayMetrics.kw)}</p>
                    <p className="mt-1 text-[8px] font-bold text-slate-500">Capacity</p>
                  </div>
                  <div className="rounded-md bg-white p-2.5">
                    <p className="text-sm font-black text-[#173b2a]">{compactNumber(displayMetrics.households)}</p>
                    <p className="mt-1 text-[8px] font-bold text-slate-500">Households</p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}

      {selectedProject && (
        <aside className="absolute bottom-0 right-0 top-0 z-50 w-full max-w-[390px] overflow-y-auto border-l border-slate-200 bg-white shadow-[-14px_0_30px_rgba(31,52,41,0.12)] sm:w-[390px]">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: programmeColor(selectedProject.programme) }}
                  />
                  <span className="text-[9px] font-extrabold uppercase tracking-[0.13em] text-slate-500">
                    {selectedProject.programme}
                  </span>
                </div>
                <h2 className="mt-2 text-[16px] font-extrabold leading-tight text-[#173b2a]">{selectedProject.name}</h2>
                <p className="mt-1 text-[10px] font-extrabold text-[#128149]">{selectedProject.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className="rounded-md p-2 text-slate-400 hover:bg-slate-100"
                aria-label="Close project details"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <section className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <Zap className="h-4 w-4 text-blue-600" />
                <p className="mt-2 text-lg font-black text-[#173b2a]">{formatMw(selectedProject.kw)}</p>
                <p className="text-[9px] text-slate-500">Installed capacity</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <UsersRound className="h-4 w-4 text-[#128149]" />
                <p className="mt-2 text-lg font-black text-[#173b2a]">{selectedProject.households.toLocaleString()}</p>
                <p className="text-[9px] text-slate-500">Households</p>
              </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white px-4 py-1 text-[10px]">
              {[
                ["State", selectedProject.state],
                ["Local Government", selectedProject.lga],
                ["Programme", selectedProject.programme],
                ["Component", selectedProject.component],
                ["Contractor", selectedProject.contractor],
                ["Status", selectedProject.status],
                ["Month", selectedProject.month],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-slate-100 py-3 last:border-0">
                  <span className="font-semibold text-slate-500">{label}</span>
                  <strong className="text-right text-[#173b2a]">{value}</strong>
                </div>
              ))}
            </section>

            <section className={`rounded-lg border p-4 ${selectedProject.verified ? "border-[#c6e2cf] bg-[#f0f9f3]" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex items-center gap-3">
                <CheckCircle2 className={`h-5 w-5 ${selectedProject.verified ? "text-[#128149]" : "text-amber-600"}`} />
                <div>
                  <p className="text-[11px] font-extrabold text-[#173b2a]">{selectedProject.verified ? "Verified project" : "Pending verification"}</p>
                  <p className="mt-0.5 text-[9px] text-slate-500">Verification status from the current project dataset.</p>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onOpenSection("Verification")}
                className="rounded-md bg-[#16824b] px-3 py-2.5 text-[9px] font-extrabold text-white transition hover:bg-[#136d3f]"
              >
                View Inspections
              </button>
              <button
                type="button"
                onClick={() => onOpenSection("Reports")}
                className="rounded-md border border-slate-200 bg-white px-3 py-2.5 text-[9px] font-extrabold text-slate-700 transition hover:bg-slate-50"
              >
                View Reports
              </button>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

export default function ReaProjectMapProgrammeHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      document.querySelectorAll("nav").forEach((nav) => {
        if (nav.querySelector('[data-veritas-project-map="true"]')) return;
        const overview = Array.from(nav.querySelectorAll("button")).find(
          (button) => button.textContent?.trim() === "Overview",
        );
        if (!overview) return;

        const button = document.createElement("button");
        button.type = "button";
        button.dataset.veritasProjectMap = "true";
        button.className =
          "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";
        button.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg><span>Project Map</span>';
        button.addEventListener("click", () => setOpen(true));
        overview.insertAdjacentElement("afterend", button);
      });
    };

    const closeWhenNativeNavChanges = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("nav button") as HTMLElement | null;
      if (button && button.dataset.veritasProjectMap !== "true") setOpen(false);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", closeWhenNativeNavChanges, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", closeWhenNativeNavChanges, true);
      document
        .querySelectorAll('[data-veritas-project-map="true"]')
        .forEach((button) => button.remove());
    };
  }, []);

  const openNativeSection = (section: string) => {
    const button = Array.from(document.querySelectorAll("nav button")).find(
      (candidate) => candidate.textContent?.trim() === section,
    ) as HTMLButtonElement | undefined;
    if (button) button.click();
    setOpen(false);
  };

  if (!open) return null;
  return <ProjectMap onClose={() => setOpen(false)} onOpenSection={openNativeSection} />;
}
