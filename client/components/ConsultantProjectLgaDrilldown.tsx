import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  type InspectionAssignment,
} from "../lib/inspection-workflow";
import { useConsultantPortfolio } from "../lib/use-consultant-portfolio";

type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

type Coordinate = {
  latitude: number;
  longitude: number;
  source: "Inspection GPS" | "Verified arrival GPS" | "Project GPS";
};

type Point = { x: number; y: number };
type Projector = (coordinate: [number, number]) => Point;

const LGA_SOURCE =
  "https://cdn.jsdelivr.net/gh/qedsoftware/geojson_data@main/nigeria-lga.geojson";
const VIEW = { width: 900, height: 540 };

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

function resolveCoordinate(item: InspectionAssignment): Coordinate | null {
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

function geometryRings(geometry: GeoFeature["geometry"]) {
  return geometry.type === "Polygon"
    ? (geometry.coordinates as number[][][])
    : (geometry.coordinates as number[][][][]).flat();
}

function lgaName(feature: GeoFeature) {
  return String(
    feature.properties.VARNAME_2 ??
      feature.properties.NAME_2 ??
      feature.properties.shapeName ??
      feature.properties.name ??
      "Local Government Area",
  ).trim();
}

function stateName(feature: GeoFeature) {
  return String(
    feature.properties.NAME_1 ??
      feature.properties.STATE ??
      feature.properties.state ??
      "",
  )
    .replace(/ State$/i, "")
    .trim();
}

function pointInRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects =
      yi > latitude !== yj > latitude &&
      longitude < ((xj - xi) * (latitude - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function featureContains(feature: GeoFeature, coordinate: Coordinate) {
  const polygons =
    feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as number[][][]]
      : (feature.geometry.coordinates as number[][][][]);

  return polygons.some((polygon) => {
    const outer = polygon[0];
    if (!outer || !pointInRing(coordinate.longitude, coordinate.latitude, outer)) {
      return false;
    }
    const holes = polygon.slice(1);
    return !holes.some((hole) => pointInRing(coordinate.longitude, coordinate.latitude, hole));
  });
}

function makeProjector(feature: GeoFeature): Projector {
  const coordinates = geometryRings(feature.geometry).flat();
  const lons = coordinates.map((coordinate) => coordinate[0]);
  const lats = coordinates.map((coordinate) => coordinate[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const padding = 55;
  const lonSpan = Math.max(maxLon - minLon, 0.001);
  const latSpan = Math.max(maxLat - minLat, 0.001);
  const scale = Math.min(
    (VIEW.width - padding * 2) / lonSpan,
    (VIEW.height - padding * 2) / latSpan,
  );
  const usedWidth = lonSpan * scale;
  const usedHeight = latSpan * scale;
  const xOffset = (VIEW.width - usedWidth) / 2;
  const yOffset = (VIEW.height - usedHeight) / 2;

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

export default function ConsultantProjectLgaDrilldown() {
  const location = useLocation();
  const { visibleAssignments: assignments } = useConsultantPortfolio();
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [selected, setSelected] = useState<InspectionAssignment | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    fetch(LGA_SOURCE)
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load LGA boundaries");
        return response.json();
      })
      .then((data: { features?: GeoFeature[] }) => setFeatures(data.features ?? []))
      .catch(() => setFeatures([]));
  }, []);

  useEffect(() => {
    if (location.pathname.replace(/\/+$/, "") !== "/consultant-admin") {
      setSelected(null);
      setHost(null);
      return;
    }

    let observer: MutationObserver | null = null;

    const attach = () => {
      const root = document.querySelector<HTMLElement>("[data-consultant-coverage-map]");
      if (!root) return false;
      const mapHost = root.querySelector<HTMLElement>("div.grid > div.relative");
      if (!mapHost) return false;
      setHost(mapHost);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>(
        "[data-consultant-coverage-map] aside button",
      );
      if (!button) return;

      const projectName = button.querySelector("p")?.textContent?.trim();
      if (!projectName) return;
      const assignment = assignments.find(
        (item) => item.projectName.trim() === projectName,
      );
      if (!assignment) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSelected(assignment);
    };

    document.addEventListener("click", onClickCapture, true);
    return () => {
      observer?.disconnect();
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [assignments, location.pathname]);

  const coordinate = useMemo(
    () => (selected ? resolveCoordinate(selected) : null),
    [selected],
  );
  useEffect(() => {
    if (selected && !assignments.some((item) => item.id === selected.id)) setSelected(null);
  }, [assignments, selected]);

  const actualLga = useMemo(() => {
    if (!coordinate || !features.length) return null;
    return features.find((feature) => featureContains(feature, coordinate)) ?? null;
  }, [coordinate, features]);

  const projector = useMemo(
    () => (actualLga ? makeProjector(actualLga) : null),
    [actualLga],
  );

  if (!selected || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-[#f8fbf9]">
      <div className="flex items-center justify-between gap-3 border-b border-[#d9e9dd] bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-[#128149]">
            Nigeria › {actualLga ? stateName(actualLga) || selected.state : selected.state} › {actualLga ? lgaName(actualLga) : "Project LGA"}
          </p>
          <p className="mt-1 truncate text-[11px] font-extrabold text-[#173b2a]">
            {selected.projectName}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="shrink-0 rounded-lg border border-[#cfe4d5] bg-white px-3 py-2 text-[9px] font-bold text-[#08733f] transition hover:bg-[#f3faf5]"
        >
          ← Back to Nigeria
        </button>
      </div>

      <div className="relative min-h-0 flex-1 p-3">
        {actualLga && projector && coordinate ? (
          <svg
            viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
            className="h-full w-full"
            role="img"
            aria-label={`${lgaName(actualLga)} local government project location`}
          >
            <path
              d={pathForFeature(actualLga, projector)}
              fill="#e4f2e8"
              stroke="#4d9a68"
              strokeWidth="2"
            />
            {(() => {
              const point = projector([coordinate.longitude, coordinate.latitude]);
              return (
                <g>
                  <circle cx={point.x} cy={point.y} r="15" fill="#08733f" opacity="0.18" />
                  <circle cx={point.x} cy={point.y} r="7" fill="#08733f" stroke="#ffffff" strokeWidth="3" />
                </g>
              );
            })()}
          </svg>
        ) : (
          <div className="flex h-full min-h-[300px] items-center justify-center">
            <div className="max-w-sm rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
              <MapPin className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-3 text-xs font-bold text-slate-700">
                {coordinate ? "Local Government boundary not found" : "Project GPS unavailable"}
              </p>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                {coordinate
                  ? "The project coordinate could not be matched to an LGA boundary in the current boundary dataset."
                  : "This project needs a valid project, arrival, or inspection coordinate before it can drill down to its LGA."}
              </p>
            </div>
          </div>
        )}

        {coordinate && (
          <div className="absolute bottom-5 left-5 rounded-lg border border-white/80 bg-[#103e29]/94 px-3 py-2 text-white shadow-lg backdrop-blur">
            <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/60">
              {coordinate.source}
            </p>
            <p className="mt-0.5 font-mono text-[10px] font-semibold">
              {coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}
            </p>
          </div>
        )}
      </div>
    </div>,
    host,
  );
}
