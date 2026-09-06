import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, LocateFixed, MapPin } from "lucide-react";
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
  if (!count) return "#edf5ef";
  const ratio = maximum ? count / maximum : 0;
  if (ratio > 0.75) return "#128149";
  if (ratio > 0.5) return "#5fa774";
  if (ratio > 0.25) return "#9dcaab";
  return "#d8ebdd";
}

function osmEmbedUrl(item: InspectionAssignment) {
  const lat = item.latitude;
  const lon = item.longitude;
  const latDelta = 0.018;
  const lonDelta = 0.024;
  const bbox = [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta]
    .map((value) => value.toFixed(6))
    .join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
}

function mapsUrl(item: InspectionAssignment) {
  return `https://www.google.com/maps/search/?api=1&query=${item.latitude.toFixed(6)},${item.longitude.toFixed(6)}`;
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
              r={selected ? 16 : 11}
              fill={statusColor(item)}
              opacity={selected ? 0.2 : 0.12}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={selected ? 6.5 : 4.5}
              fill={statusColor(item)}
              stroke="#ffffff"
              strokeWidth="2.5"
            />
          </g>
        );
      })}
    </>
  );
}

function RealProjectMap({ item }: { item: InspectionAssignment }) {
  return (
    <div className="relative h-[390px] overflow-hidden rounded-xl border border-[#cfe4d5] bg-[#e9f2ec] shadow-inner">
      <iframe
        key={`${item.id}-${item.latitude}-${item.longitude}`}
        title={`${item.projectName} location map`}
        src={osmEmbedUrl(item)}
        className="h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/20 to-transparent" />

      <div className="absolute left-3 top-3 max-w-[75%] rounded-xl border border-white/70 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow"
            style={{ backgroundColor: statusColor(item) }}
          >
            <LocateFixed className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-extrabold text-[#173b2a]">{item.projectName}</p>
            <p className="truncate text-[9px] text-slate-500">
              {item.community ? `${item.community} · ` : ""}{item.lga}, {item.state}
            </p>
          </div>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 rounded-lg border border-white/70 bg-[#103e29]/92 px-3 py-2 text-white shadow-lg backdrop-blur">
        <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/60">Project coordinates</p>
        <p className="mt-0.5 font-mono text-[10px] font-semibold">
          {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
        </p>
      </div>

      <a
        href={mapsUrl(item)}
        target="_blank"
        rel="noreferrer"
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-[#b9dbc4] bg-white/95 px-3 py-2 text-[9px] font-bold text-[#08733f] shadow-lg transition hover:bg-white"
      >
        Open in Maps <ExternalLink className="h-3 w-3" />
      </a>
    </div>
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
    <div className="overflow-hidden bg-white">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="relative min-h-[414px] overflow-hidden bg-[radial-gradient(circle_at_top_left,_#f0faf3,_#f8fbf9_48%,_#eef6f0)] p-3">
          <div className="absolute left-4 top-4 z-10 rounded-xl border border-[#d1e7d7] bg-white/95 px-3.5 py-2.5 shadow-[0_8px_30px_rgba(8,115,63,0.09)] backdrop-blur">
            <p className="text-[9px] font-black uppercase tracking-[0.13em] text-[#128149]">
              {selectedProject && validCoordinate(selectedProject)
                ? "Live project location"
                : !selectedState
                  ? "National coverage"
                  : !selectedLga
                    ? `${selectedState} · LGA coverage`
                    : `${selectedLga} · Project locations`}
            </p>
            <p className="mt-1 text-[9px] text-slate-500">
              {selectedProject && validCoordinate(selectedProject)
                ? "Map centered on the stored project GPS coordinates"
                : !selectedState
                  ? "Select a state or project to inspect coverage"
                  : !selectedLga
                    ? "Select an LGA or project pin"
                    : "Select a project to open its real geographic location"}
            </p>
            {selectedState && (
              <button
                type="button"
                onClick={() => {
                  if (selectedProject) {
                    setSelectedProject(null);
                  } else if (selectedLga) {
                    setSelectedLga(null);
                  } else {
                    setSelectedState(null);
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
          ) : selectedProject && validCoordinate(selectedProject) ? (
            <RealProjectMap item={selectedProject} />
          ) : !selectedState ? (
            <svg
              viewBox={`0 0 ${NATIONAL_VIEW.width} ${NATIONAL_VIEW.height}`}
              className="h-[390px] w-full drop-shadow-[0_14px_20px_rgba(25,80,49,0.08)]"
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
                    strokeWidth="1.35"
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
              className="h-[390px] w-full drop-shadow-[0_14px_20px_rgba(25,80,49,0.08)]"
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
                    strokeWidth="1.25"
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
              className="h-[390px] w-full drop-shadow-[0_14px_20px_rgba(25,80,49,0.08)]"
              role="img"
              aria-label={`${selectedLga} project locations`}
            >
              {selectedLgaFeature && (
                <path
                  d={pathForFeature(selectedLgaFeature, lgaProjector)}
                  fill="#e5f3e9"
                  stroke="#6cad80"
                  strokeWidth="1.6"
                />
              )}
              <ProjectDots
                assignments={lgaAssignments}
                projector={lgaProjector}
                selectedId={selectedProject?.id}
                onSelect={openProject}
              />
            </svg>
          )}
        </div>

        <aside className="max-h-[414px] overflow-y-auto border-t border-slate-100 bg-gradient-to-b from-white to-[#fbfefc] p-3 lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                {selectedLga
                  ? `${selectedLga} projects`
                  : selectedState
                    ? `${selectedState} projects`
                    : "Consultant portfolio"}
              </p>
              <p className="mt-0.5 text-[8px] text-slate-400">{visibleList.length} project{visibleList.length === 1 ? "" : "s"}</p>
            </div>
            <span className="rounded-full bg-[#e9f6ed] px-2 py-1 text-[8px] font-black text-[#08733f]">
              GPS linked
            </span>
          </div>

          <div className="space-y-2">
            {visibleList.slice(0, 40).map((item) => (
              <button
                key={item.id}
                onClick={() => openProject(item)}
                className={`group w-full rounded-xl border p-2.5 text-left transition-all ${
                  selectedProject?.id === item.id
                    ? "border-[#69b583] bg-[#eff9f2] shadow-sm"
                    : "border-slate-100 bg-white hover:-translate-y-px hover:border-[#c9e3d1] hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                    style={{ backgroundColor: statusColor(item) }}
                  >
                    <MapPin className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-extrabold text-[#173b2a]">{item.projectName}</p>
                    <p className="mt-1 truncate text-[9px] text-slate-500">{item.lga}, {item.state}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[8px]">
                      <span className="truncate text-slate-400">{item.officer}</span>
                      <span
                        className="rounded-full px-2 py-0.5 font-bold text-white"
                        style={{ backgroundColor: statusColor(item) }}
                      >
                        {getAssignmentDisplayStatus(item.status)}
                      </span>
                    </div>
                    <p className={`mt-1.5 font-mono text-[7.5px] ${validCoordinate(item) ? "text-[#3d7d57]" : "text-amber-600"}`}>
                      {validCoordinate(item)
                        ? `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
                        : "Project GPS unavailable"}
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {!visibleList.length && (
              <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-[10px] text-slate-500">
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
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedProject.community || "—"}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">GPS</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">
              {validCoordinate(selectedProject)
                ? `${selectedProject.latitude.toFixed(6)}, ${selectedProject.longitude.toFixed(6)}`
                : "Coordinates unavailable"}
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
          "Interactive State → LGA coverage with real project locations plotted from stored GPS coordinates";
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
