import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import {
  getAssignmentDisplayStatus,
  type InspectionAssignment,
} from "../lib/inspection-workflow";

export type ConsultantMapFilters = {
  programme: string;
  state: string;
  officer: string;
};

type MapAssignment = InspectionAssignment & { mapDisplayStatus?: string };

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

type Point = { x: number; y: number };
type Projector = (coordinate: [number, number]) => Point;
type ResolvedCoordinate = {
  latitude: number;
  longitude: number;
  source: "Inspection GPS" | "Verified arrival GPS" | "Project GPS";
};

const STATE_SOURCE = "/nigeria-adm1.geojson";
const LGA_SOURCE = "/nigeria-lga.geojson";
const NATIONAL_VIEW = { width: 850, height: 520 };
const DETAIL_VIEW = { width: 900, height: 540 };

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

function geometryPolygons(geometry: GeoFeature["geometry"]) {
  return geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : (geometry.coordinates as number[][][][]);
}

function geometryRings(geometry: GeoFeature["geometry"]) {
  return geometryPolygons(geometry).flat();
}

function allCoordinates(features: GeoFeature[]) {
  return features.flatMap((feature) => geometryRings(feature.geometry).flat());
}

function pointOnSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1);
  if (Math.abs(cross) > 1e-9) return false;
  const dot = (x - x1) * (x2 - x1) + (y - y1) * (y2 - y1);
  if (dot < 0) return false;
  const lengthSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  return dot <= lengthSquared;
}

function pointInRing(point: [number, number], ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const current = ring[index] as [number, number];
    const prior = ring[previous] as [number, number];
    if (pointOnSegment(point, prior, current)) return true;
    const intersects =
      current[1] > point[1] !== prior[1] > point[1] &&
      point[0] <
        ((prior[0] - current[0]) * (point[1] - current[1])) /
          (prior[1] - current[1] || Number.EPSILON) +
          current[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInFeature(point: [number, number], feature: GeoFeature) {
  return geometryPolygons(feature.geometry).some((polygon) => {
    const [outer, ...holes] = polygon;
    if (!outer || !pointInRing(point, outer)) return false;
    return !holes.some((hole) => pointInRing(point, hole));
  });
}

function representativePoint(feature: GeoFeature): [number, number] {
  const coordinates = geometryRings(feature.geometry)[0] ?? [];
  if (!coordinates.length) return [0, 0];
  const sum = coordinates.reduce(
    (current, coordinate) => [current[0] + coordinate[0], current[1] + coordinate[1]],
    [0, 0],
  );
  const centroid: [number, number] = [sum[0] / coordinates.length, sum[1] / coordinates.length];
  return pointInFeature(centroid, feature)
    ? centroid
    : [coordinates[0][0], coordinates[0][1]];
}

function makeProjector(
  features: GeoFeature[],
  width: number,
  height: number,
  padding = 32,
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
  const xOffset = (width - usedWidth) / 2;
  const yOffset = (height - usedHeight) / 2;
  return ([lon, lat]) => ({
    x: xOffset + (lon - minLon) * scale,
    y: yOffset + (maxLat - lat) * scale,
  });
}

function pathForFeature(feature: GeoFeature, projector: Projector) {
  return geometryRings(feature.geometry)
    .map(
      (ring) =>
        ring
          .map((coordinate, index) => {
            const point = projector([coordinate[0], coordinate[1]]);
            return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`;
          })
          .join(" ") + " Z",
    )
    .join(" ");
}

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 4 &&
    latitude <= 14.5 &&
    longitude >= 2.5 &&
    longitude <= 15
  );
}

function resolveCoordinate(item: InspectionAssignment): ResolvedCoordinate | null {
  if (item.report && isValidCoordinate(item.report.latitude, item.report.longitude)) {
    return {
      latitude: item.report.latitude,
      longitude: item.report.longitude,
      source: "Inspection GPS",
    };
  }
  if (item.arrival && isValidCoordinate(item.arrival.latitude, item.arrival.longitude)) {
    return {
      latitude: item.arrival.latitude,
      longitude: item.arrival.longitude,
      source: "Verified arrival GPS",
    };
  }
  if (isValidCoordinate(item.latitude, item.longitude)) {
    return {
      latitude: item.latitude,
      longitude: item.longitude,
      source: "Project GPS",
    };
  }
  return null;
}

function assignmentStatusLabel(item: MapAssignment) {
  return item.mapDisplayStatus ?? getAssignmentDisplayStatus(item.status);
}

function statusColor(item: MapAssignment) {
  const status = assignmentStatusLabel(item);
  if (status === "Verified") return "#08733f";
  if (status === "Approved") return "#26a269";
  if (status === "Awaiting field officer") return "#d69218";
  if (status === "Draft") return "#3974b6";
  return "#d69218";
}

function densityFill(count: number, maximum: number) {
  if (!count) return "#eef3ef";
  const ratio = maximum ? count / maximum : 0;
  if (ratio > 0.75) return "#16824b";
  if (ratio > 0.5) return "#5fa774";
  if (ratio > 0.25) return "#9dcaab";
  return "#d8ebdd";
}

function ProjectDots({
  assignments,
  projector,
  selectedId,
  onSelect,
}: {
  assignments: Array<{ item: MapAssignment; coordinate: ResolvedCoordinate | null; lga: string | null }>;
  projector: Projector;
  selectedId?: string;
  onSelect: (assignment: MapAssignment) => void;
}) {
  return (
    <>
      {assignments.map(({ item, coordinate }) => {
        if (!coordinate) return null;
        const point = projector([coordinate.longitude, coordinate.latitude]);
        const selected = selectedId === item.id;
        return (
          <g
            key={item.id}
            data-testid={`consultant-map-project-pin-${item.id}`}
            onClick={() => onSelect(item)}
            className="cursor-pointer"
          >
            <circle
              cx={point.x}
              cy={point.y}
              r={selected ? 14 : 10}
              fill={statusColor(item)}
              opacity={selected ? 0.22 : 0.14}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={selected ? 6 : 4.5}
              fill={statusColor(item)}
              stroke="#ffffff"
              strokeWidth="2"
            />
          </g>
        );
      })}
    </>
  );
}

export default function ConsultantCoverageMap({
  assignments,
  filters,
}: {
  assignments: MapAssignment[];
  filters: ConsultantMapFilters;
}) {
  const [stateFeatures, setStateFeatures] = useState<GeoFeature[]>([]);
  const [lgaFeatures, setLgaFeatures] = useState<GeoFeature[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<MapAssignment | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(STATE_SOURCE).then((response) => response.json()),
      fetch(LGA_SOURCE).then((response) => response.json()),
    ])
      .then(([states, lgas]: Array<{ features?: GeoFeature[] }>) => {
        setStateFeatures(states.features ?? []);
        setLgaFeatures(lgas.features ?? []);
      })
      .catch(() => {
        setStateFeatures([]);
        setLgaFeatures([]);
      });
  }, []);

  const filteredAssignments = useMemo(
    () =>
      assignments.filter(
        (item) =>
          (filters.programme === "All Programmes" || item.programme === filters.programme) &&
          (filters.state === "All States" || item.state === filters.state) &&
          (filters.officer === "All Field Officers" || item.officer === filters.officer),
      ),
    [assignments, filters],
  );

  useEffect(() => {
    if (filters.state === "All States") return;
    setSelectedState(filters.state);
    setSelectedLga(null);
    setSelectedProject(null);
  }, [filters.state]);

  useEffect(() => {
    if (selectedProject && !filteredAssignments.some((item) => item.id === selectedProject.id)) {
      setSelectedProject(null);
      setSelectedLga(null);
    }
  }, [filteredAssignments, selectedProject]);

  const lgaStateIndex = useMemo(() => {
    const index = new Map<string, GeoFeature[]>();
    for (const lga of lgaFeatures) {
      const point = representativePoint(lga);
      const state = stateFeatures.find((candidate) => pointInFeature(point, candidate));
      if (!state) continue;
      const name = stateName(state);
      index.set(name, [...(index.get(name) ?? []), lga]);
    }
    return index;
  }, [lgaFeatures, stateFeatures]);

  const selectedStateLgas = selectedState ? lgaStateIndex.get(selectedState) ?? [] : [];

  const locatedAssignments = useMemo(
    () =>
      filteredAssignments.map((item) => {
        const coordinate = resolveCoordinate(item);
        const stateLgas = lgaStateIndex.get(item.state) ?? [];
        const lgaFeature =
          coordinate &&
          stateLgas.find((feature) =>
            pointInFeature([coordinate.longitude, coordinate.latitude], feature),
          );
        return {
          item,
          coordinate,
          lga: lgaFeature ? lgaName(lgaFeature) : null,
        };
      }),
    [filteredAssignments, lgaStateIndex],
  );

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { item } of locatedAssignments) {
      counts.set(item.state, (counts.get(item.state) ?? 0) + 1);
    }
    return counts;
  }, [locatedAssignments]);

  const stateAssignments = useMemo(
    () =>
      selectedState
        ? locatedAssignments.filter(({ item }) => item.state === selectedState)
        : locatedAssignments,
    [locatedAssignments, selectedState],
  );

  const lgaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of stateAssignments) {
      if (!row.lga) continue;
      counts.set(row.lga, (counts.get(row.lga) ?? 0) + 1);
    }
    return counts;
  }, [stateAssignments]);

  const lgaAssignments = useMemo(
    () =>
      selectedLga
        ? stateAssignments.filter((row) => row.lga === selectedLga)
        : stateAssignments,
    [selectedLga, stateAssignments],
  );

  const nationalProjector = useMemo(
    () => makeProjector(stateFeatures, NATIONAL_VIEW.width, NATIONAL_VIEW.height, 34),
    [stateFeatures],
  );
  const stateProjector = useMemo(
    () => makeProjector(selectedStateLgas, DETAIL_VIEW.width, DETAIL_VIEW.height, 42),
    [selectedStateLgas],
  );
  const selectedLgaFeature = useMemo(
    () => selectedStateLgas.find((feature) => lgaName(feature) === selectedLga) ?? null,
    [selectedLga, selectedStateLgas],
  );
  const lgaProjector = useMemo(
    () =>
      makeProjector(
        selectedLgaFeature ? [selectedLgaFeature] : selectedStateLgas,
        DETAIL_VIEW.width,
        DETAIL_VIEW.height,
        58,
      ),
    [selectedLgaFeature, selectedStateLgas],
  );

  const maximumStateCount = Math.max(0, ...stateCounts.values());
  const maximumLgaCount = Math.max(0, ...lgaCounts.values());
  const visibleList = selectedLga
    ? lgaAssignments
    : selectedState
      ? stateAssignments
      : locatedAssignments;
  const selectedCoordinate = selectedProject ? resolveCoordinate(selectedProject) : null;
  const selectedResolvedLga = selectedProject
    ? locatedAssignments.find((row) => row.item.id === selectedProject.id)?.lga ?? null
    : null;

  const openProject = (item: MapAssignment) => {
    const located = locatedAssignments.find((row) => row.item.id === item.id);
    setSelectedState(item.state);
    setSelectedLga(located?.lga ?? null);
    setSelectedProject(item);
  };

  return (
    <div className="bg-white" data-testid="consultant-coverage-map">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="relative min-h-[390px] overflow-hidden bg-[#f8fbf9] p-3">
          <div className="absolute left-4 top-4 z-10 rounded-lg border border-[#d6e9da] bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#128149]">
              {!selectedState
                ? "National coverage"
                : !selectedLga
                  ? `${selectedState} · LGA coverage`
                  : `${selectedLga} · Project locations`}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">
              {!selectedState
                ? "Click a project state to drill down"
                : !selectedLga
                  ? "Click an LGA or a project pin"
                  : "LGA is resolved from the project coordinate inside the local LGA polygon"}
            </p>
            {selectedState && (
              <button
                type="button"
                onClick={() => {
                  if (selectedLga) {
                    setSelectedLga(null);
                    setSelectedProject(null);
                  } else {
                    setSelectedState(null);
                    setSelectedProject(null);
                  }
                }}
                className="mt-2 text-[9px] font-bold text-[#08733f] hover:underline"
              >
                ← Back
              </button>
            )}
          </div>

          {!stateFeatures.length ? (
            <div className="flex h-[390px] items-center justify-center text-xs font-semibold text-slate-500">
              Loading Nigeria project coverage…
            </div>
          ) : !selectedState ? (
            <svg
              viewBox={`0 0 ${NATIONAL_VIEW.width} ${NATIONAL_VIEW.height}`}
              className="h-[390px] w-full"
              role="img"
              aria-label="Nigeria consultant project coverage by state"
            >
              {stateFeatures.map((feature) => {
                const name = stateName(feature);
                const count = stateCounts.get(name) ?? 0;
                return (
                  <path
                    key={name}
                    data-testid={`consultant-map-state-${name}`}
                    d={pathForFeature(feature, nationalProjector)}
                    fill={densityFill(count, maximumStateCount)}
                    stroke="#ffffff"
                    strokeWidth="1.25"
                    onClick={() => {
                      if (!count) return;
                      setSelectedState(name);
                      setSelectedLga(null);
                      setSelectedProject(null);
                    }}
                    className={count ? "cursor-pointer transition hover:brightness-95" : "cursor-default"}
                  />
                );
              })}
              <ProjectDots
                assignments={locatedAssignments}
                projector={nationalProjector}
                selectedId={selectedProject?.id}
                onSelect={openProject}
              />
            </svg>
          ) : !selectedLga ? (
            <svg
              viewBox={`0 0 ${DETAIL_VIEW.width} ${DETAIL_VIEW.height}`}
              className="h-[390px] w-full"
              role="img"
              aria-label={`${selectedState} consultant projects by local government`}
            >
              {selectedStateLgas.map((feature) => {
                const name = lgaName(feature);
                const count = lgaCounts.get(name) ?? 0;
                return (
                  <path
                    key={name}
                    data-testid={`consultant-map-lga-${name}`}
                    d={pathForFeature(feature, stateProjector)}
                    fill={densityFill(count, maximumLgaCount)}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    onClick={() => {
                      if (!count) return;
                      setSelectedLga(name);
                      setSelectedProject(null);
                    }}
                    className={count ? "cursor-pointer transition hover:brightness-95" : "cursor-default"}
                  />
                );
              })}
              <ProjectDots
                assignments={stateAssignments}
                projector={stateProjector}
                selectedId={selectedProject?.id}
                onSelect={openProject}
              />
            </svg>
          ) : (
            <svg
              viewBox={`0 0 ${DETAIL_VIEW.width} ${DETAIL_VIEW.height}`}
              className="h-[390px] w-full"
              role="img"
              aria-label={`${selectedLga} project locations`}
            >
              {selectedLgaFeature && (
                <path
                  d={pathForFeature(selectedLgaFeature, lgaProjector)}
                  fill="#e5f3e9"
                  stroke="#6cad80"
                  strokeWidth="1.5"
                />
              )}
              <ProjectDots
                assignments={lgaAssignments}
                projector={lgaProjector}
                selectedId={selectedProject?.id}
                onSelect={setSelectedProject}
              />
            </svg>
          )}
        </div>

        <aside className="max-h-[414px] overflow-y-auto border-t border-slate-100 bg-white p-3 lg:border-l lg:border-t-0">
          <p className="mb-2 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
            {selectedLga
              ? `${selectedLga} projects`
              : selectedState
                ? `${selectedState} projects`
                : "Consultant portfolio"}
          </p>
          <div className="space-y-2">
            {visibleList.slice(0, 40).map(({ item, coordinate, lga }) => (
              <button
                key={item.id}
                type="button"
                data-testid={`consultant-map-project-${item.id}`}
                onClick={() => openProject(item)}
                className={`w-full rounded-lg border p-2.5 text-left transition ${
                  selectedProject?.id === item.id
                    ? "border-[#79be91] bg-[#eff9f2]"
                    : "border-slate-100 hover:border-[#cfe5d5] hover:bg-[#fbfefc]"
                }`}
              >
                <p className="truncate text-[10px] font-bold text-[#173b2a]">{item.projectName}</p>
                <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{lga ?? "LGA unresolved"}, {item.state}</span>
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[8px]">
                  <span className="truncate text-slate-400">
                    {coordinate
                      ? `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`
                      : "GPS unavailable"}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 font-bold text-white"
                    style={{ backgroundColor: statusColor(item) }}
                  >
                    {assignmentStatusLabel(item)}
                  </span>
                </div>
              </button>
            ))}
            {!visibleList.length && (
              <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center text-[10px] text-slate-500">
                No consultant projects match the current filters.
              </div>
            )}
          </div>
        </aside>
      </div>

      {selectedProject && (
        <div
          data-testid="consultant-map-project-details"
          className="grid gap-2 border-t border-slate-100 bg-[#fbfefc] px-4 py-3 text-[9px] text-slate-500 sm:grid-cols-2 lg:grid-cols-7"
        >
          <div><span className="block font-bold uppercase text-slate-400">Project</span><strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.projectName}</strong></div>
          <div><span className="block font-bold uppercase text-slate-400">Programme</span><strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.programme}</strong></div>
          <div><span className="block font-bold uppercase text-slate-400">State</span><strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.state}</strong></div>
          <div><span className="block font-bold uppercase text-slate-400">LGA</span><strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedResolvedLga ?? "Unresolved"}</strong></div>
          <div><span className="block font-bold uppercase text-slate-400">Community</span><strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.community}</strong></div>
          <div><span className="block font-bold uppercase text-slate-400">GPS</span><strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedCoordinate ? `${selectedCoordinate.latitude.toFixed(6)}, ${selectedCoordinate.longitude.toFixed(6)}` : "Unavailable"}</strong></div>
          <div><span className="block font-bold uppercase text-slate-400">GPS source</span><strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedCoordinate?.source ?? "—"}</strong></div>
        </div>
      )}
    </div>
  );
}
