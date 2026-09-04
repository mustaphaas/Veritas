import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  getAssignmentDisplayStatus,
  useInspectionWorkflow,
  type InspectionAssignment,
} from "../lib/inspection-workflow";

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};
type Point = { x: number; y: number };
type Projector = (coordinate: [number, number]) => Point;

const STATE_SOURCE = "/nigeria-adm1.geojson";
const LGA_SOURCE =
  "https://cdn.jsdelivr.net/gh/qedsoftware/geojson_data@main/nigeria-lga.geojson";
const NATIONAL_VIEW = { width: 850, height: 520 };
const DETAIL_VIEW = { width: 900, height: 540 };

function normaliseStateName(value: unknown) {
  const state = String(value ?? "").replace(/ State$/i, "").trim();
  if (/Federal Capital Territory/i.test(state) || /^Abuja$/i.test(state)) return "FCT";
  return state;
}
function normalisePlace(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/local government area|local government|lga/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
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
function validCoordinate(item: InspectionAssignment) {
  return (
    Number.isFinite(item.latitude) &&
    Number.isFinite(item.longitude) &&
    item.latitude >= 4 &&
    item.latitude <= 14.5 &&
    item.longitude >= 2.5 &&
    item.longitude <= 15
  );
}
function statusColor(assignment: InspectionAssignment) {
  const status = getAssignmentDisplayStatus(assignment.status);
  if (status === "Verified") return "#08733f";
  if (status === "Approved") return "#26a269";
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
  assignments: InspectionAssignment[];
  projector: Projector;
  selectedId?: string;
  onSelect: (assignment: InspectionAssignment) => void;
}) {
  return (
    <>
      {assignments.filter(validCoordinate).map((item) => {
        const point = projector([item.longitude, item.latitude]);
        const selected = selectedId === item.id;
        return (
          <g key={item.id} onClick={() => onSelect(item)} className="cursor-pointer">
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

function ConsultantCoverageMap({ assignments }: { assignments: InspectionAssignment[] }) {
  const [stateFeatures, setStateFeatures] = useState<GeoFeature[]>([]);
  const [lgaFeatures, setLgaFeatures] = useState<GeoFeature[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<InspectionAssignment | null>(null);
  const [filterVersion, setFilterVersion] = useState(0);

  useEffect(() => {
    fetch(STATE_SOURCE)
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

  useEffect(() => {
    const listener = () => setFilterVersion((value) => value + 1);
    document.addEventListener("change", listener);
    return () => document.removeEventListener("change", listener);
  }, []);

  const pageFilters = useMemo(() => {
    void filterVersion;
    const labels = Array.from(document.querySelectorAll("label"));
    const read = (name: string, fallback: string) => {
      const label = labels.find((item) =>
        item.textContent?.trim().toLowerCase().startsWith(name.toLowerCase()),
      );
      return (label?.querySelector("select") as HTMLSelectElement | null)?.value ?? fallback;
    };
    return {
      programme: read("Programme", "All Programmes"),
      state: read("State", "All States"),
      officer: read("Field officer", "All Field Officers"),
    };
  }, [filterVersion]);

  const filteredAssignments = useMemo(
    () =>
      assignments.filter(
        (item) =>
          (pageFilters.programme === "All Programmes" || item.programme === pageFilters.programme) &&
          (pageFilters.state === "All States" || item.state === pageFilters.state) &&
          (pageFilters.officer === "All Field Officers" || item.officer === pageFilters.officer),
      ),
    [assignments, pageFilters],
  );

  useEffect(() => {
    if (pageFilters.state !== "All States") {
      setSelectedState(pageFilters.state);
      setSelectedLga(null);
      setSelectedProject(null);
    }
  }, [pageFilters.state]);

  const stateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredAssignments.forEach((item) => counts.set(item.state, (counts.get(item.state) ?? 0) + 1));
    return counts;
  }, [filteredAssignments]);

  const selectedStateLgas = useMemo(
    () =>
      selectedState
        ? lgaFeatures.filter((feature) => stateName(feature) === selectedState)
        : [],
    [lgaFeatures, selectedState],
  );
  const stateAssignments = useMemo(
    () =>
      selectedState
        ? filteredAssignments.filter((item) => item.state === selectedState)
        : filteredAssignments,
    [filteredAssignments, selectedState],
  );
  const lgaCounts = useMemo(() => {
    const counts = new Map<string, number>();
    stateAssignments.forEach((item) => {
      const feature = selectedStateLgas.find(
        (candidate) => normalisePlace(lgaName(candidate)) === normalisePlace(item.lga),
      );
      const key = feature ? lgaName(feature) : item.lga;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return counts;
  }, [selectedStateLgas, stateAssignments]);
  const lgaAssignments = useMemo(
    () =>
      selectedLga
        ? stateAssignments.filter(
            (item) => normalisePlace(item.lga) === normalisePlace(selectedLga),
          )
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
    () =>
      selectedStateLgas.find(
        (feature) => normalisePlace(lgaName(feature)) === normalisePlace(selectedLga),
      ) ?? null,
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
  const visibleList = selectedLga ? lgaAssignments : selectedState ? stateAssignments : filteredAssignments;

  const openProject = (item: InspectionAssignment) => {
    setSelectedState(item.state);
    setSelectedLga(item.lga || null);
    setSelectedProject(item);
  };

  return (
    <div className="bg-white">
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
                  : "Pins are plotted from the stored project GPS coordinates"}
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
                assignments={filteredAssignments}
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
            {visibleList.slice(0, 40).map((item) => (
              <button
                key={item.id}
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
                  <span className="truncate">{item.lga}, {item.state}</span>
                </p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[8px]">
                  <span className="truncate text-slate-400">{item.officer}</span>
                  <span
                    className="rounded-full px-2 py-0.5 font-bold text-white"
                    style={{ backgroundColor: statusColor(item) }}
                  >
                    {getAssignmentDisplayStatus(item.status)}
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
        <div className="grid gap-2 border-t border-slate-100 bg-[#fbfefc] px-4 py-3 text-[9px] text-slate-500 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <span className="block font-bold uppercase text-slate-400">Project</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.projectName}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">Programme</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.programme}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">State</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.state}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">LGA</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.lga}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">Community</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.community}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">GPS</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">
              {selectedProject.latitude.toFixed(6)}, {selectedProject.longitude.toFixed(6)}
            </strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsultantCoverageMapEnhancer() {
  const location = useLocation();
  const { assignments } = useInspectionWorkflow();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (location.pathname !== "/consultant-admin") {
      setTarget(null);
      return;
    }

    let mount: HTMLDivElement | null = null;
    let legacyChildren: HTMLElement[] = [];
    let cancelled = false;

    const attach = () => {
      if (cancelled) return false;
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (element) =>
          element.textContent?.trim() === "Interactive Project Map" ||
          element.textContent?.trim() === "Consultant Project Coverage",
      );
      const section = heading?.closest("section");
      if (!section) return false;
      const header = heading.closest("div.border-b");
      if (!header) return false;

      const existing = section.querySelector<HTMLDivElement>("[data-consultant-coverage-map]");
      if (existing) {
        mount = existing;
        setTarget(existing);
        return true;
      }

      legacyChildren = Array.from(section.children)
        .filter((child) => child !== header)
        .map((child) => child as HTMLElement);
      legacyChildren.forEach((child) => {
        child.dataset.consultantLegacyDisplay = child.style.display;
        child.style.display = "none";
      });

      heading.textContent = "Consultant Project Coverage";
      const subtitle = header.querySelector("p");
      if (subtitle) {
        subtitle.textContent =
          "Interactive State → LGA project coverage synchronized with consultant assignment locations";
      }

      mount = document.createElement("div");
      mount.dataset.consultantCoverageMap = "true";
      section.appendChild(mount);
      setTarget(mount);
      return true;
    };

    if (!attach()) {
      const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timeout = window.setTimeout(() => observer.disconnect(), 5000);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
        observer.disconnect();
      };
    }

    return () => {
      cancelled = true;
      setTarget(null);
      mount?.remove();
      legacyChildren.forEach((child) => {
        child.style.display = child.dataset.consultantLegacyDisplay ?? "";
        delete child.dataset.consultantLegacyDisplay;
      });
    };
  }, [location.pathname]);

  if (location.pathname !== "/consultant-admin" || !target) return null;
  return createPortal(<ConsultantCoverageMap assignments={assignments} />, target);
}
