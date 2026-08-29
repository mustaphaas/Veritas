from pathlib import Path
import re

map_path = Path("client/components/ReaProjectMapProgramme.tsx")
data_path = Path("client/lib/dashboard-data.ts")

s = map_path.read_text()
d = data_path.read_text()

# Shared project records can now carry surveyed GPS coordinates from the backend/field app.
old = "  verified: boolean;\n  x: number;\n  y: number;"
new = "  verified: boolean;\n  latitude?: number;\n  longitude?: number;\n  x: number;\n  y: number;"
if old not in d:
    raise RuntimeError("Project type shape changed")
d = d.replace(old, new, 1)

# Project Map keeps using the exact Overview project dataset, but resolves each record to geographic coordinates.
old = '''type MapProject = Project & {
  id: string;
  lga: string;
};'''
new = '''type MapProject = Project & {
  id: string;
  lga: string;
  latitude: number;
  longitude: number;
  coordinateSource: "Project GPS" | "LGA centroid";
};'''
if old not in s:
    raise RuntimeError("MapProject type changed")
s = s.replace(old, new, 1)

# Executive-style green density palette from the supplied visual reference.
s = s.replace(
    'const densityPalette = ["#eef3ef", "#dbece0", "#b9d9c2", "#80bb90", "#2b8b55"];',
    'const densityPalette = ["#103830", "#145042", "#17664a", "#1d8254", "#24ad68"];',
    1,
)

old_bg = '''.veritas-map-canvas {
  background:
    radial-gradient(circle at 18% 22%, rgba(22,130,75,0.07), transparent 30%),
    radial-gradient(circle at 82% 76%, rgba(37,99,235,0.05), transparent 28%),
    linear-gradient(145deg, #fbfdfc 0%, #f4f8f5 52%, #edf3ef 100%);
  animation: veritas-map-enter 380ms cubic-bezier(.22,1,.36,1) both;
}'''
new_bg = '''.veritas-map-canvas {
  background:
    radial-gradient(circle at 48% 44%, rgba(36,173,104,0.10), transparent 34%),
    radial-gradient(circle at 12% 86%, rgba(18,92,72,0.15), transparent 30%),
    linear-gradient(145deg, #08131c 0%, #0c1922 52%, #0a161e 100%);
  animation: veritas-map-enter 380ms cubic-bezier(.22,1,.36,1) both;
}'''
if old_bg not in s:
    raise RuntimeError("Map canvas style changed")
s = s.replace(old_bg, new_bg, 1)
s = s.replace(
    '.veritas-area:hover path { filter: brightness(.96) drop-shadow(0 2px 3px rgba(26,55,40,.14)); }',
    '.veritas-area:hover path { filter: brightness(1.12) drop-shadow(0 3px 6px rgba(13,219,119,.18)); }',
    1,
)

# Labels are redesigned for the dark executive map surface.
start = s.index("function MetricLabel({")
end = s.index("\nfunction ProjectMap({", start)
label = r'''function MetricLabel({
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
  const titleSize = compact ? 7 : 7.5;
  const metricSize = compact ? 5.3 : 5.7;
  return (
    <g pointerEvents="none">
      <text
        x={x}
        y={y - 6}
        textAnchor="middle"
        fill="#effff5"
        fontSize={titleSize}
        fontWeight="850"
        stroke="#091a16"
        strokeWidth="2.6"
        paintOrder="stroke"
      >
        {title}
      </text>
      <text
        x={x}
        y={y + 2}
        textAnchor="middle"
        fill="#b9dfc8"
        fontSize={metricSize}
        fontWeight="800"
        stroke="#091a16"
        strokeWidth="2.2"
        paintOrder="stroke"
      >
        P {metrics.projects} · V {metrics.verified}
      </text>
      <text
        x={x}
        y={y + 9}
        textAnchor="middle"
        fill="#55d98b"
        fontSize={metricSize}
        fontWeight="850"
        stroke="#091a16"
        strokeWidth="2.2"
        paintOrder="stroke"
      >
        {formatMw(metrics.kw)} · {compactNumber(metrics.households)} HH
      </text>
    </g>
  );
}
'''
s = s[:start] + label + s[end:]

# True longitude/latitude centroid from the real LGA polygon, used only as a transparent demo fallback.
marker = "function jitterWithin(\n"
idx = s.index(marker)
geo_helper = r'''function featureGeoCentroid(feature: GeoFeature): [number, number] {
  const ring = largestRing(feature);
  if (!ring.length) return [8.6753, 9.082];

  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    twiceArea += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }

  if (Math.abs(twiceArea) < 1e-10) {
    const lon = ring.reduce((sum, coordinate) => sum + coordinate[0], 0) / ring.length;
    const lat = ring.reduce((sum, coordinate) => sum + coordinate[1], 0) / ring.length;
    return [lon, lat];
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

'''
s = s[:idx] + geo_helper + s[idx:]

# Assign demo records across real LGAs and prefer actual project GPS whenever present.
enrich_start = s.index("function enrichProjects(lgaFeatures: GeoFeature[]): MapProject[] {")
enrich_end = s.index("\nfunction aggregateBy", enrich_start)
enrich = r'''function enrichProjects(lgaFeatures: GeoFeature[]): MapProject[] {
  const byState = new Map<string, GeoFeature[]>();
  lgaFeatures.forEach((feature) => {
    const state = stateName(feature);
    if (!state) return;
    const existing = byState.get(state) ?? [];
    existing.push(feature);
    byState.set(state, existing);
  });
  byState.forEach((features) => features.sort((a, b) => lgaName(a).localeCompare(lgaName(b))));

  const stateCursor = new Map<string, number>();
  return projects.map((project, index) => {
    const available = byState.get(project.state) ?? [];
    const cursor = stateCursor.get(project.state) ?? 0;
    stateCursor.set(project.state, cursor + 1);
    const feature = available.length ? available[cursor % available.length] : undefined;
    const lga = feature ? lgaName(feature) : `${project.state} LGA`;
    const [fallbackLongitude, fallbackLatitude] = feature
      ? featureGeoCentroid(feature)
      : [8.6753, 9.082];
    const hasProjectGps =
      Number.isFinite(project.latitude) &&
      Number.isFinite(project.longitude) &&
      Math.abs(project.latitude ?? 0) <= 90 &&
      Math.abs(project.longitude ?? 0) <= 180;

    return {
      ...project,
      id: `REA-${project.programme}-${project.state.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(4, "0")}`,
      lga,
      latitude: hasProjectGps ? project.latitude! : fallbackLatitude,
      longitude: hasProjectGps ? project.longitude! : fallbackLongitude,
      coordinateSource: hasProjectGps ? "Project GPS" : "LGA centroid",
    };
  });
}
'''
s = s[:enrich_start] + enrich + s[enrich_end:]

# Remove old screen-space scatter helpers from the component's memo section and project real lon/lat directly.
section_start = s.index("  const stateFeatureByName = useMemo(")
section_end = s.index("\n  const maximumStateProjects", section_start)
points = r'''  const nationalPoints = useMemo(() => {
    const positions = new Map<string, Point>();
    filteredProjects.forEach((project) => {
      positions.set(project.id, stateProjector([project.longitude, project.latitude]));
    });
    return positions;
  }, [filteredProjects, stateProjector]);

  const statePoints = useMemo(() => {
    const positions = new Map<string, Point>();
    stateProjects.forEach((project) => {
      positions.set(project.id, lgaProjector([project.longitude, project.latitude]));
    });
    return positions;
  }, [lgaProjector, stateProjects]);

  const lgaPoints = useMemo(() => {
    const positions = new Map<string, Point>();
    lgaProjects.forEach((project) => {
      positions.set(project.id, lgaProjector([project.longitude, project.latitude]));
    });
    return positions;
  }, [lgaProjector, lgaProjects]);
'''
s = s[:section_start] + points + s[section_end:]

# Dark-map surface and executive-green boundaries.
s = s.replace('fill={layers["Coverage Density"]\n                        ? densityPalette[densityBand(metrics.projects, maximumStateProjects)]\n                        : "#e8efea"}',
              'fill={layers["Coverage Density"]\n                        ? densityPalette[densityBand(metrics.projects, maximumStateProjects)]\n                        : "#173f37"}', 1)
s = s.replace('stroke="#ffffff"\n                            strokeWidth="1.35"', 'stroke="#315f54"\n                            strokeWidth="1.1"', 1)
s = s.replace('fill = isSelected\n                      ? "#dff1e5"', 'fill = isSelected\n                      ? "#2ac879"', 1)
s = s.replace('                        : "#e8efea";', '                        : "#173f37";', 1)
s = s.replace('stroke={isSelected ? "#117a44" : "#ffffff"}', 'stroke={isSelected ? "#72f1a6" : "#315f54"}', 1)

# Dark overlay controls on the map itself.
s = s.replace(
    'className="hidden rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur sm:block"',
    'className="hidden rounded-lg border border-[#29483e] bg-[#0b171f]/95 px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur sm:block"',
    1,
)
s = s.replace('text-[#128149]">{mapTitle}', 'text-[#64d993]">{mapTitle}', 1)
s = s.replace(
    '<p className="mt-0.5 text-[9px] text-slate-500">Dots are projects; colour identifies programme.</p>',
    '<p className="mt-0.5 text-[9px] text-slate-300">Green shading = Overview project density · pins use project GPS when available.</p>',
    1,
)
s = s.replace(
    'className="absolute right-4 top-4 z-20 flex overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"',
    'className="absolute right-4 top-4 z-20 flex overflow-hidden rounded-md border border-[#29483e] bg-[#0b171f]/95 shadow-lg backdrop-blur"',
    1,
)
s = s.replace('className="p-2 text-slate-500 transition hover:bg-slate-50"', 'className="p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"', 1)
s = s.replace('className="border-l border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"', 'className="border-l border-[#29483e] p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"', 2)

# Dark legend surface to visually match the supplied executive map.
s = s.replace(
    'className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur"',
    'className="absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-[#29483e] bg-[#09141c]/95 px-3 py-2 shadow-lg backdrop-blur"',
    1,
)
s = s.replace('text-slate-500">Programme</span>', 'text-slate-300">Programme</span>', 1)
s = s.replace('font-bold text-slate-600', 'font-bold text-slate-300', 1)
s = s.replace('text-[8px] font-semibold text-slate-400">Each dot = project</span>', 'text-[8px] font-semibold text-slate-400">Same 412-project dataset as Overview</span>', 1)

# Show exact coordinate and source in the project drawer.
needle = '''                ["Local Government", selectedProject.lga],
                ["Programme", selectedProject.programme],'''
replacement = '''                ["Local Government", selectedProject.lga],
                ["GPS Coordinates", `${selectedProject.latitude.toFixed(5)}, ${selectedProject.longitude.toFixed(5)}`],
                ["Coordinate Source", selectedProject.coordinateSource],
                ["Programme", selectedProject.programme],'''
if needle not in s:
    raise RuntimeError("Project drawer fields changed")
s = s.replace(needle, replacement, 1)

map_path.write_text(s)
data_path.write_text(d)
print("Updated Project Map palette, shared data GPS support, and geographic placement")
