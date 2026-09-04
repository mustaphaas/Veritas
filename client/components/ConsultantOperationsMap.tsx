import { useEffect, useMemo, useState } from "react";
import { Activity, MapPin, Navigation, Radio, Route, UserCheck } from "lucide-react";
import { useInspectionWorkflow, type InspectionAssignment } from "../lib/inspection-workflow";

type GeoFeature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry?: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
};

type GeoCollection = { type: "FeatureCollection"; features: GeoFeature[] };

const WIDTH = 760;
const HEIGHT = 470;
const LON_MIN = 2.5;
const LON_MAX = 15.0;
const LAT_MIN = 4.0;
const LAT_MAX = 14.6;

function projectPoint(longitude: number, latitude: number) {
  const x = ((longitude - LON_MIN) / (LON_MAX - LON_MIN)) * WIDTH;
  const y = HEIGHT - ((latitude - LAT_MIN) / (LAT_MAX - LAT_MIN)) * HEIGHT;
  return { x, y };
}

function ringPath(ring: number[][]) {
  return ring
    .map(([lon, lat], index) => {
      const { x, y } = projectPoint(lon, lat);
      return `${index ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ") + " Z";
}

function featurePath(feature: GeoFeature) {
  if (!feature.geometry) return "";
  if (feature.geometry.type === "Polygon") {
    return (feature.geometry.coordinates as number[][][]).map(ringPath).join(" ");
  }
  return (feature.geometry.coordinates as number[][][][])
    .flatMap((polygon) => polygon.map(ringPath))
    .join(" ");
}

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(a: InspectionAssignment, b: InspectionAssignment) {
  const earthKm = 6371;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function isCollecting(assignment: InspectionAssignment) {
  if (assignment.status === "Draft") return true;
  if (assignment.status !== "Assigned") return false;
  return assignment.audit?.some((event) =>
    /navigation|arrival|gps|field|data collection|inspection started/i.test(event.action),
  );
}

function markerTone(status: InspectionAssignment["status"]) {
  if (status === "Verified") return "#08733f";
  if (status === "Approved") return "#36a864";
  if (status === "Submitted") return "#3974b6";
  if (status === "Re-inspection") return "#d97706";
  if (status === "Draft") return "#7c3aed";
  return "#64748b";
}

export default function ConsultantOperationsMap() {
  const { assignments } = useInspectionWorkflow();
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [selectedId, setSelectedId] = useState(assignments[0]?.id ?? "");

  useEffect(() => {
    let mounted = true;
    fetch("/nigeria-adm1.geojson")
      .then((response) => response.json())
      .then((data: GeoCollection) => {
        if (mounted) setFeatures(data.features ?? []);
      })
      .catch(() => {
        if (mounted) setFeatures([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!assignments.some((item) => item.id === selectedId)) {
      setSelectedId(assignments[0]?.id ?? "");
    }
  }, [assignments, selectedId]);

  const selected = assignments.find((item) => item.id === selectedId) ?? assignments[0];
  const collecting = useMemo(() => assignments.filter(isCollecting), [assignments]);
  const proximity = useMemo(
    () =>
      collecting.map((current) => {
        const nearest = assignments
          .filter((item) => item.id !== current.id)
          .map((item) => ({ assignment: item, km: distanceKm(current, item) }))
          .sort((a, b) => a.km - b.km)[0];
        return { current, nearest };
      }),
    [assignments, collecting],
  );

  return (
    <section className="consultant-operations-map mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#173b2a]">Assigned Projects — Nigeria</h2>
            <span className="rounded-full bg-[#edf8f0] px-2.5 py-1 text-[9px] font-bold text-[#08733f]">
              {assignments.length} assigned
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Consultant portfolio coverage with live field-activity proximity.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[#cfe7d6] bg-[#f5fbf7] px-3 py-1.5 text-[9px] font-bold text-[#08733f]">
          <Radio className="h-3.5 w-3.5" /> {collecting.length} collecting now
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,.85fr)]">
        <div className="relative min-h-[430px] overflow-hidden bg-[#f5f9f6] p-4 sm:p-5">
          <div className="absolute left-5 top-4 z-10 rounded-lg border border-white/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">Coverage</p>
            <p className="mt-0.5 text-xs font-bold text-[#173b2a]">
              {[...new Set(assignments.map((item) => item.state))].length} states · {assignments.length} projects
            </p>
          </div>
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-[420px] w-full" role="img" aria-label="Nigeria map showing consultant assigned projects">
            <g>
              {features.map((feature, index) => (
                <path
                  key={`${String(feature.properties?.shapeName ?? feature.properties?.name ?? "state")}-${index}`}
                  d={featurePath(feature)}
                  fill="#e7f4ea"
                  stroke="#b8d8c1"
                  strokeWidth="1.1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
            {assignments.map((item) => {
              const point = projectPoint(item.longitude, item.latitude);
              const active = selected?.id === item.id;
              const collectingNow = isCollecting(item);
              return (
                <g
                  key={item.id}
                  transform={`translate(${point.x} ${point.y})`}
                  onClick={() => setSelectedId(item.id)}
                  className="cursor-pointer"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") setSelectedId(item.id);
                  }}
                  aria-label={`${item.projectName}, ${item.state}`}
                >
                  {collectingNow && <circle r="13" fill="none" stroke="#16a15a" strokeWidth="2" opacity=".32" />}
                  <circle r={active ? 8 : 6} fill={markerTone(item.status)} stroke="#fff" strokeWidth={active ? 3 : 2} />
                  {active && <circle r="12" fill="none" stroke="#173b2a" strokeWidth="1.4" opacity=".35" />}
                </g>
              );
            })}
          </svg>
          <div className="absolute bottom-4 left-5 right-5 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[8px] font-semibold text-slate-500 backdrop-blur">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#7c3aed]" />Data collection</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#3974b6]" />Submitted</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#36a864]" />Approved</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#08733f]" />Verified</span>
          </div>
        </div>

        <aside className="border-t border-slate-100 bg-white xl:border-l xl:border-t-0">
          {selected && (
            <div className="border-b border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Selected project</p>
                  <h3 className="mt-1 text-xs font-bold text-[#173b2a]">{selected.projectName}</h3>
                  <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                    <MapPin className="h-3 w-3" /> {selected.community}, {selected.state}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-bold text-slate-600">{selected.status}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
                <div className="rounded-md bg-[#f7faf8] p-2.5"><span className="text-slate-400">Field officer</span><p className="mt-1 font-bold text-[#173b2a]">{selected.officer}</p></div>
                <div className="rounded-md bg-[#f7faf8] p-2.5"><span className="text-slate-400">Programme</span><p className="mt-1 font-bold text-[#173b2a]">{selected.programme}</p></div>
              </div>
            </div>
          )}

          <div className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-bold text-[#173b2a]"><Navigation className="h-4 w-4 text-[#08733f]" /> Closest project to active field officer</h3>
                <p className="mt-1 text-[9px] text-slate-500">Calculated from project GPS coordinates.</p>
              </div>
              <Activity className="h-4 w-4 text-[#16a15a]" />
            </div>
            <div className="mt-3 space-y-2.5">
              {proximity.map(({ current, nearest }) => (
                <button
                  type="button"
                  key={current.id}
                  onClick={() => setSelectedId(current.id)}
                  className="w-full rounded-lg border border-slate-100 bg-[#fbfdfb] p-3 text-left hover:border-[#b9dfc5] hover:bg-[#f6fbf7]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[10px] font-bold text-[#173b2a]">{current.officer}</p>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#e9f7ed] px-2 py-1 text-[8px] font-bold text-[#08733f]"><UserCheck className="h-3 w-3" /> Collecting</span>
                  </div>
                  <p className="mt-1 truncate text-[9px] text-slate-500">At {current.projectName}</p>
                  {nearest ? (
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-white p-2">
                      <Route className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#3974b6]" />
                      <div className="min-w-0">
                        <p className="truncate text-[9px] font-bold text-[#173b2a]">{nearest.assignment.projectName}</p>
                        <p className="mt-0.5 text-[8px] text-slate-500">{nearest.assignment.community}, {nearest.assignment.state} · {nearest.km < 1 ? `${Math.round(nearest.km * 1000)} m` : `${nearest.km.toFixed(1)} km`} away</p>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-[9px] text-slate-400">No second assigned project available.</p>
                  )}
                </button>
              ))}
              {!proximity.length && (
                <div className="rounded-lg border border-dashed border-slate-200 p-5 text-center">
                  <Navigation className="mx-auto h-5 w-5 text-slate-300" />
                  <p className="mt-2 text-[10px] font-semibold text-slate-500">No officer is currently in data collection.</p>
                  <p className="mt-1 text-[9px] text-slate-400">This panel activates when an assigned inspection enters field activity or Draft status.</p>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
