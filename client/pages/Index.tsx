import { useEffect, useMemo, useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bell,
  BellRing,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  MapPin,
  Home,
  Zap,
  Menu,
  Minus,
  Plus,
  Search,
  ScanSearch,
  Settings,
  ArrowRight,
  UsersRound,
  X,
} from "lucide-react";
import {
  defaultFilters,
  filterDefaults,
  filterLabels,
  getFilterOptions,
  matchingProjects,
  projects,
  summarizePortfolio,
  summarizeProjectsByState,
  type FilterKey,
  type Filters,
  type Project,
  type StateSummary,
} from "../lib/dashboard-data";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Projects", icon: FolderKanban },
  { label: "Project Map", icon: MapPin },
  { label: "Inspections", icon: ClipboardCheck },
  { label: "Verified Reports", icon: FileCheck2 },
  { label: "Contractors", icon: Building2 },
  { label: "Programmes", icon: UsersRound },
];

type BoundaryFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};
type MapMode = "projects" | "capacity" | "households";
type MapPoint = { x: number; y: number };

const mapBounds = { minLon: 2.5, maxLon: 15, minLat: 3.5, maxLat: 14 };
const mapPalette = ["#f2f8f3", "#dcefe0", "#b9dfc3", "#7fc393", "#18743e"];
const mapModeOptions: Array<{
  value: MapMode;
  label: string;
  shortLabel: string;
}> = [
  { value: "projects", label: "View by Projects", shortLabel: "Projects" },
  { value: "capacity", label: "View by Capacity", shortLabel: "Capacity" },
  {
    value: "households",
    label: "View by Households",
    shortLabel: "Households",
  },
];

function projectPoint(coordinate: number[]): MapPoint {
  const [longitude, latitude] = coordinate;
  return {
    x:
      ((longitude - mapBounds.minLon) / (mapBounds.maxLon - mapBounds.minLon)) *
      650,
    y:
      300 -
      ((latitude - mapBounds.minLat) / (mapBounds.maxLat - mapBounds.minLat)) *
        300,
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
function geometryCentroid(geometry: BoundaryFeature["geometry"]): MapPoint {
  const rings = geometryRings(geometry);
  const ring = rings.reduce(
    (largest, candidate) =>
      Math.abs(ringArea(candidate)) > Math.abs(ringArea(largest))
        ? candidate
        : largest,
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
  if (Math.abs(twiceArea) < 0.001)
    return points.reduce(
      (total, point) => ({
        x: total.x + point.x / points.length,
        y: total.y + point.y / points.length,
      }),
      { x: 0, y: 0 },
    );
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
}
function normalizedStateName(properties: Record<string, unknown>) {
  return String(properties.shapeName ?? properties.name ?? "")
    .replace(/ State$/i, "")
    .replace(/^(Abuja )?Federal Capital Territory$/i, "FCT");
}
function mapMetric(summary: StateSummary | undefined, mode: MapMode) {
  if (!summary) return 0;
  if (mode === "capacity") return summary.kw / 1000;
  if (mode === "households") return summary.households;
  return summary.projects;
}
function formatMapMetric(value: number, mode: MapMode, compact = false) {
  if (mode === "capacity")
    return `${value.toLocaleString(undefined, { minimumFractionDigits: compact ? 0 : 1, maximumFractionDigits: 1 })} MW`;
  return value.toLocaleString();
}
function mapBand(value: number, mode: MapMode, maximum: number) {
  if (value <= 0) return 0;
  if (mode === "projects") {
    if (value <= 2) return 1;
    if (value <= 5) return 2;
    if (value <= 9) return 3;
    return 4;
  }
  const ratio = maximum ? value / maximum : 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
function mapLegend(mode: MapMode, maximum: number) {
  if (mode === "projects") return ["0", "1–2", "3–5", "6–9", "10+"];
  const unit = mode === "capacity" ? " MW" : "";
  return [
    "0",
    ...[0.25, 0.5, 0.75].map(
      (ratio) =>
        `≤ ${(maximum * ratio).toLocaleString(undefined, { maximumFractionDigits: mode === "capacity" ? 1 : 0 })}${unit}`,
    ),
    `${maximum.toLocaleString(undefined, { maximumFractionDigits: mode === "capacity" ? 1 : 0 })}${unit}`,
  ];
}

function getKpis(filteredProjects: Project[]) {
  const totals = summarizePortfolio(filteredProjects);
  return [
    {
      label: "Projects",
      value: totals.projects.toLocaleString(),
      detail: "Across filtered portfolio",
      icon: FolderKanban,
      tone: "default",
    },
    {
      label: "Installed Capacity",
      value: `${(totals.kw / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MW`,
      detail: "Total commissioned capacity",
      icon: Zap,
      tone: "highlighted",
    },
    {
      label: "Households Reached",
      value: totals.households.toLocaleString(),
      detail: "Connections delivered",
      icon: Home,
      tone: "default",
    },
    {
      label: "Verification Rate",
      value: `${totals.verificationRate}%`,
      detail: `${totals.verified} of ${totals.projects} reports verified`,
      icon: CheckCircle2,
      tone: "default",
    },
    {
      label: "Pending Verification",
      value: totals.pending.toLocaleString(),
      detail: "Reports awaiting REA review",
      icon: Clock3,
      tone: "pending",
      action: "Inspections",
    },
  ];
}

function FilterSelect({
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
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 text-sm font-medium leading-10 text-[#173b2a] outline-none transition-colors focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10"
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function AtlasMark() {
  return (
    <div
      className="grid h-10 w-10 grid-cols-2 gap-1 rounded-lg bg-[#08733f] p-2 shadow-sm"
      aria-hidden="true"
    >
      <span className="rounded-sm bg-white/95" />
      <span className="rounded-sm bg-[#a7e1bd]" />
      <span className="rounded-sm bg-[#dff5e6]" />
      <span className="rounded-sm bg-white/95" />
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: string; children: string }) {
  const styles = {
    verified: "border-[#b8dfc5] bg-[#eaf8ef] text-[#08733f]",
    pending: "border-[#f1d48a] bg-[#fff8e5] text-[#9a6500]",
    progress: "border-[#bcd3ed] bg-[#eef6ff] text-[#2563a7]",
    submitted: "border-[#c8e8d1] bg-[#f0fbf3] text-[#39764d]",
  } as Record<string, string>;

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

export default function Index() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [boundaries, setBoundaries] = useState<BoundaryFeature[]>([]);
  useEffect(() => {
    fetch("/nigeria-adm1.geojson")
      .then((response) => response.json())
      .then((data: { features: BoundaryFeature[] }) =>
        setBoundaries(data.features),
      );
  }, []);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [mapMode, setMapMode] = useState<MapMode>("projects");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapFocus, setMapFocus] = useState<MapPoint>({ x: 325, y: 150 });
  const [mapTooltip, setMapTooltip] = useState<{
    state: string;
    x: number;
    y: number;
  } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const visibleProjects = useMemo(() => matchingProjects(filters), [filters]);
  const metrics = getKpis(visibleProjects);
  const programmePerformance = useMemo(
    () =>
      [...new Set(visibleProjects.map((project) => project.programme))].map(
        (programme) => {
          const matching = visibleProjects.filter(
            (project) => project.programme === programme,
          );
          const verified = matching.filter(
            (project) => project.verified,
          ).length;
          return {
            programme,
            projects: matching.length,
            capacity:
              matching.reduce((total, project) => total + project.kw, 0) / 1000,
            households: matching.reduce(
              (total, project) => total + project.households,
              0,
            ),
            verified: matching.length
              ? Math.round((verified / matching.length) * 100)
              : 0,
          };
        },
      ),
    [visibleProjects],
  );
  const trendData = useMemo(() => {
    return [...new Set(visibleProjects.map((project) => project.month))]
      .sort((left, right) => Date.parse(`1 ${left}`) - Date.parse(`1 ${right}`))
      .map((month) => {
        const monthProjects = visibleProjects.filter(
          (project) => project.month === month,
        );
        return {
          month: month.slice(0, 3),
          inspections: monthProjects.length,
          submitted: monthProjects.filter(
            (project) => project.status !== "In progress",
          ).length,
          verified: monthProjects.filter((project) => project.verified).length,
        };
      });
  }, [visibleProjects]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const stateSummaries = useMemo(
    () => summarizeProjectsByState(visibleProjects),
    [visibleProjects],
  );
  const stateBoundaryData = useMemo(
    () =>
      boundaries.map((boundary, index) => ({
        boundary,
        state: normalizedStateName(boundary.properties),
        centroid: geometryCentroid(boundary.geometry),
        key: String(
          boundary.properties.shapeISO ?? boundary.properties.shapeID ?? index,
        ),
      })),
    [boundaries],
  );
  const selectedSummary = stateSummaries.find(
    (summary) => summary.state === selectedState,
  );
  const maximumMapMetric = Math.max(
    0,
    ...stateSummaries.map((summary) => mapMetric(summary, mapMode)),
  );
  const legendLabels = mapLegend(mapMode, maximumMapMetric);
  const tooltipSummary = stateSummaries.find(
    (summary) => summary.state === mapTooltip?.state,
  );
  const activeMapFilters = [
    filters.programs === filterDefaults.programs ? null : filters.programs,
    filters.components === filterDefaults.components
      ? null
      : filters.components,
    filters.contractors === filterDefaults.contractors
      ? null
      : filters.contractors,
    filters.months === filterDefaults.months ? null : filters.months,
  ]
    .filter(Boolean)
    .join(" / ");

  useEffect(() => {
    if (filters.states === filterDefaults.states) return;
    const boundary = stateBoundaryData.find(
      (item) => item.state === filters.states,
    );
    setSelectedState(filters.states);
    if (boundary) {
      setMapFocus(boundary.centroid);
      setMapZoom(1.55);
    }
  }, [filters.states, stateBoundaryData]);

  useEffect(() => {
    if (
      selectedState &&
      !stateSummaries.some((summary) => summary.state === selectedState)
    ) {
      setSelectedState(null);
      setMapFocus({ x: 325, y: 150 });
      setMapZoom(1);
    }
  }, [selectedState, stateSummaries]);

  const resetMapView = () => {
    setMapZoom(1);
    setMapFocus({ x: 325, y: 150 });
  };

  const selectMapState = (state: string, centroid: MapPoint) => {
    if (!stateSummaries.some((summary) => summary.state === state)) return;
    setSelectedState(state);
    setMapFocus(centroid);
    setMapZoom((zoom) => Math.max(zoom, 1.35));
  };
  const updateFilterWithDependencies = (key: FilterKey, value: string) => {
    const next = { ...filters, [key]: value };
    (Object.keys(filterDefaults) as FilterKey[]).forEach((filterKey) => {
      if (
        filterKey !== key &&
        !getFilterOptions(next, filterKey).includes(next[filterKey])
      )
        next[filterKey] = filterDefaults[filterKey];
    });
    setFilters(next);
  };

  const navContent = (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <AtlasMark />
        <div>
          <p className="text-[15px] font-bold tracking-[0.08em] text-[#075c33]">
            ATLAS GRID
          </p>
          <p className="mt-0.5 text-[9px] font-semibold tracking-[0.08em] text-slate-500">
            REA FIELD MONITORING
          </p>
        </div>
      </div>
      <div className="mx-5 h-px bg-slate-200" />
      <nav className="flex-1 space-y-1 px-3 py-5">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
          Workspace
        </p>
        {navigation.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => {
              setActiveNav(label);
              setMobileMenuOpen(false);
            }}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              activeNav === label
                ? "bg-[#edf9f0] text-[#08733f]"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon
              className="h-[18px] w-[18px]"
              strokeWidth={activeNav === label ? 2.5 : 1.8}
            />
            {label}
          </button>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Settings className="h-[18px] w-[18px]" /> Settings
        </button>
        <div className="mt-3 flex items-center gap-3 rounded-md bg-[#f6fcf7] px-3 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d8f0df] text-xs font-bold text-[#075c33]">
            MA
          </div>
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-semibold text-[#173b2a]">
              Mustapha Aliyu
            </p>
            <p className="text-[10px] text-slate-500">REA Administrator</p>
          </div>
          <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        {navContent}
      </aside>
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`}
      >
        <div
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-slate-900/20 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="absolute right-3 top-4 rounded p-2 text-slate-500"
          >
            <X className="h-5 w-5" />
          </button>
          {navContent}
        </aside>
      </div>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative hidden w-64 md:block">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10"
                placeholder="Search projects, locations..."
              />
            </div>
            <p className="text-sm font-semibold text-[#173b2a] md:hidden">
              ATLAS GRID
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex">
              <i className="h-2 w-2 rounded-full bg-[#08733f]" />
              Online · Friday, 14 June 2024
            </span>
            <button
              className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-white bg-[#d89100]" />
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-[1520px] px-4 py-7 sm:px-7 lg:px-9">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.13em] text-[#08733f]">
                RURAL ELECTRIFICATION AGENCY
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-[#153b28] sm:text-[28px]">
                National Project Overview
              </h1>
              <p className="mt-1.5 text-sm text-slate-500">
                Monitor programme delivery and field verification across
                Nigeria.
              </p>
            </div>
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#08733f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#065d32]">
              <ClipboardCheck className="h-4 w-4" /> Review Inspections
            </button>
          </div>

          <section className="mt-7 rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-4 sm:p-5">
            <div className="flex flex-wrap items-end gap-3 xl:flex-nowrap">
              {(Object.keys(filterDefaults) as FilterKey[]).map((key) => (
                <div key={key} className="min-w-[150px] flex-1">
                  <FilterSelect
                    label={filterLabels[key]}
                    value={filters[key]}
                    options={getFilterOptions(filters, key)}
                    onChange={(value) =>
                      updateFilterWithDependencies(key, value)
                    }
                  />
                </div>
              ))}
              <button
                onClick={() => {
                  setFilters(defaultFilters);
                  setSelectedState(null);
                  resetMapView();
                }}
                className="h-10 whitespace-nowrap rounded-md border border-[#b9dfc5] bg-white px-4 text-xs font-bold text-[#08733f] hover:bg-[#edf9f0]"
              >
                Reset
              </button>
            </div>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {metrics.map(
              ({ label, value, detail, icon: Icon, tone, action }) => {
                const cardClassName = `flex min-h-[174px] w-full flex-col items-center justify-center rounded-lg border p-5 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${tone === "highlighted" ? "border-[#cdebd6] bg-[#f0fdf4]" : tone === "pending" ? "border-[#f1d48a] bg-[#fffbeb] transition-colors hover:border-[#d97706] hover:bg-[#fff7d6]" : "border-slate-200 bg-white"}`;
                const cardContent = (
                  <>
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-md ${tone === "pending" ? "bg-[#fef3c7] text-[#d97706]" : "bg-[#eaf8ef] text-[#15803d]"}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 text-sm font-medium text-slate-600">
                      {label}
                    </p>
                    <p
                      className={`mt-1 text-2xl font-bold tracking-tight ${tone === "pending" ? "text-[#92400e]" : tone === "highlighted" ? "text-[#166534]" : "text-[#111827]"}`}
                    >
                      {value}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">{detail}</p>
                  </>
                );
                return action ? (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setActiveNav(action)}
                    className={cardClassName}
                    aria-label={`${label}: ${value}. Open verification queue`}
                  >
                    {cardContent}
                  </button>
                ) : (
                  <article key={label} className={cardClassName}>
                    {cardContent}
                  </article>
                );
              },
            )}
          </section>

          <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="font-bold text-[#173b2a]">
                  National Project Coverage
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Live distribution across all 36 states and FCT · Values
                  reflect the current dashboard filters
                </p>
              </div>
              <div
                className="inline-flex w-full overflow-x-auto rounded-md border border-slate-200 bg-white p-1 lg:w-auto"
                aria-label="Map viewing mode"
              >
                {mapModeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setMapMode(option.value)}
                    className={`whitespace-nowrap rounded px-3 py-2 text-xs font-semibold transition-colors ${mapMode === option.value ? "bg-[#08733f] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div
              className={
                selectedSummary
                  ? "grid lg:grid-cols-[minmax(0,1fr)_320px]"
                  : "grid"
              }
            >
              <div
                ref={mapContainerRef}
                className="relative min-h-[440px] overflow-hidden bg-[#f8fbf8] sm:h-[520px]"
                onWheel={(event) => {
                  event.preventDefault();
                  setMapZoom((zoom) =>
                    Math.min(
                      2.5,
                      Math.max(1, zoom + (event.deltaY < 0 ? 0.15 : -0.15)),
                    ),
                  );
                }}
              >
                <div
                  className="absolute inset-0 opacity-[0.28]"
                  style={{
                    backgroundImage:
                      "linear-gradient(#d9eadc 1px, transparent 1px), linear-gradient(90deg, #d9eadc 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }}
                />

                <div className="absolute left-3 top-3 z-20 flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() =>
                      setMapZoom((zoom) => Math.min(2.5, zoom + 0.25))
                    }
                    className="border-b border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    aria-label="Zoom in"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMapZoom((zoom) => Math.max(1, zoom - 0.25))
                    }
                    className="border-b border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                    aria-label="Zoom out"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={resetMapView}
                    className="p-2 text-slate-600 hover:bg-slate-50"
                    aria-label="Fit map to Nigeria"
                  >
                    <ScanSearch className="h-4 w-4" />
                  </button>
                </div>

                <svg
                  className="relative z-10 h-full min-h-[440px] w-full touch-pan-x touch-pan-y sm:min-h-0"
                  viewBox="0 0 650 300"
                  fill="none"
                  aria-label={`Interactive Nigeria state map viewed by ${mapMode}`}
                >
                  {stateBoundaryData.length ? (
                    <g
                      transform={`translate(325 150) scale(${mapZoom}) translate(${-mapFocus.x} ${-mapFocus.y})`}
                    >
                      {stateBoundaryData.map(
                        ({ boundary, state, centroid, key }) => {
                          const summary = stateSummaries.find(
                            (item) => item.state === state,
                          );
                          const value = mapMetric(summary, mapMode);
                          const selected =
                            state === selectedState || filters.states === state;
                          return (
                            <path
                              key={key}
                              d={geometryPath(boundary.geometry)}
                              fill={
                                mapPalette[
                                  mapBand(value, mapMode, maximumMapMetric)
                                ]
                              }
                              stroke={selected ? "#075c33" : "#9fc8aa"}
                              strokeWidth={selected ? 2 : summary ? 1.05 : 0.7}
                              vectorEffect="non-scaling-stroke"
                              className={
                                summary
                                  ? "cursor-pointer transition-colors hover:brightness-95 focus:outline-none"
                                  : ""
                              }
                              role={summary ? "button" : undefined}
                              tabIndex={summary ? 0 : undefined}
                              aria-label={
                                summary
                                  ? `${state}: ${formatMapMetric(value, mapMode)}`
                                  : `${state}: no matching project data`
                              }
                              onClick={() => selectMapState(state, centroid)}
                              onKeyDown={(event) => {
                                if (
                                  summary &&
                                  (event.key === "Enter" || event.key === " ")
                                )
                                  selectMapState(state, centroid);
                              }}
                              onMouseMove={(event) => {
                                if (!summary) return;
                                const bounds =
                                  mapContainerRef.current?.getBoundingClientRect();
                                if (bounds)
                                  setMapTooltip({
                                    state,
                                    x: event.clientX - bounds.left,
                                    y: event.clientY - bounds.top,
                                  });
                              }}
                              onMouseLeave={() => setMapTooltip(null)}
                            />
                          );
                        },
                      )}
                      {stateBoundaryData.map(({ state, centroid, key }) => {
                        const summary = stateSummaries.find(
                          (item) => item.state === state,
                        );
                        const value = mapMetric(summary, mapMode);
                        const selected =
                          state === selectedState || filters.states === state;
                        const markerWidth =
                          mapMode === "projects"
                            ? 20
                            : mapMode === "capacity"
                              ? 42
                              : 38;
                        return (
                          <g
                            key={`${key}-label`}
                            transform={`translate(${centroid.x} ${centroid.y})`}
                            pointerEvents="none"
                          >
                            <text
                              y={summary ? -5 : 2}
                              textAnchor="middle"
                              fill={selected ? "#064e2b" : "#315b3f"}
                              fontSize="6.5"
                              fontWeight={summary ? "700" : "500"}
                            >
                              {state}
                            </text>
                            {summary && (
                              <>
                                <rect
                                  x={-markerWidth / 2}
                                  y="0"
                                  width={markerWidth}
                                  height="15"
                                  rx="7.5"
                                  fill={selected ? "#08733f" : "white"}
                                  stroke={selected ? "white" : "#b9dfc5"}
                                  strokeWidth="1.2"
                                  vectorEffect="non-scaling-stroke"
                                />
                                <text
                                  y="10.5"
                                  textAnchor="middle"
                                  fill={selected ? "white" : "#08733f"}
                                  fontSize={
                                    mapMode === "projects" ? "8" : "6.2"
                                  }
                                  fontWeight="800"
                                >
                                  {formatMapMetric(value, mapMode, true)}
                                </text>
                              </>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  ) : (
                    <text
                      x="325"
                      y="150"
                      textAnchor="middle"
                      fill="#557060"
                      fontSize="12"
                      fontWeight="600"
                    >
                      Nigeria state boundary data is unavailable.
                    </text>
                  )}
                </svg>

                {mapTooltip && tooltipSummary && (
                  <div
                    className="pointer-events-none absolute z-30 w-52 rounded-md border border-[#b9dfc5] bg-white p-3 text-xs shadow-lg"
                    style={{
                      left: mapTooltip.x + 12,
                      top: Math.max(12, mapTooltip.y - 36),
                    }}
                  >
                    <p className="font-bold text-[#173b2a]">
                      {tooltipSummary.state}
                      {activeMapFilters ? ` — ${activeMapFilters}` : ""}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-500">
                      <span>Projects</span>
                      <strong className="text-right text-[#173b2a]">
                        {tooltipSummary.projects}
                      </strong>
                      <span>Capacity</span>
                      <strong className="text-right text-[#173b2a]">
                        {(tooltipSummary.kw / 1000).toFixed(1)} MW
                      </strong>
                      <span>Households</span>
                      <strong className="text-right text-[#173b2a]">
                        {tooltipSummary.households.toLocaleString()}
                      </strong>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#173b2a]">
                    {
                      mapModeOptions.find((option) => option.value === mapMode)
                        ?.shortLabel
                    }
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
                    {legendLabels.map((label, index) => (
                      <span
                        key={`${label}-${index}`}
                        className="flex items-center gap-1.5 text-[10px] text-slate-500"
                      >
                        <i
                          className="h-2.5 w-5 rounded-sm"
                          style={{ backgroundColor: mapPalette[index] }}
                        />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {selectedSummary && (
                <aside
                  className="border-t border-slate-200 bg-white p-5 lg:border-l lg:border-t-0"
                  aria-label={`${selectedSummary.state} state details`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-[#173b2a]">
                        {selectedSummary.state} State
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Current filtered view
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedState(null);
                        resetMapView();
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100"
                      aria-label="Close state details"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <dl className="mt-5 divide-y divide-slate-100 text-sm">
                    {[
                      {
                        label: "Projects",
                        value: selectedSummary.projects.toLocaleString(),
                        icon: FolderKanban,
                        tone: "text-[#08733f]",
                      },
                      {
                        label: "Installed Capacity",
                        value: `${(selectedSummary.kw / 1000).toFixed(1)} MW`,
                        icon: Zap,
                        tone: "text-[#08733f]",
                      },
                      {
                        label: "Households Reached",
                        value: selectedSummary.households.toLocaleString(),
                        icon: Home,
                        tone: "text-[#08733f]",
                      },
                      {
                        label: "Verified Reports",
                        value: selectedSummary.verified.toLocaleString(),
                        icon: CheckCircle2,
                        tone: "text-[#08733f]",
                      },
                      {
                        label: "Pending Verification",
                        value: selectedSummary.pending.toLocaleString(),
                        icon: Clock3,
                        tone: "text-[#d89100]",
                      },
                    ].map(({ label, value, icon: Icon, tone }) => (
                      <div key={label} className="flex items-center gap-3 py-3">
                        <Icon className={`h-4 w-4 ${tone}`} />
                        <dt className="text-xs text-slate-600">{label}</dt>
                        <dd className="ml-auto font-bold text-[#173b2a]">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <h4 className="text-sm font-bold text-[#173b2a]">
                      Projects by Component
                    </h4>
                    <div className="mt-3 space-y-3">
                      {selectedSummary.byComponent.map((component) => (
                        <div key={component.name}>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600">
                              {component.name}
                            </span>
                            <strong className="text-[#173b2a]">
                              {component.value}
                            </strong>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-[#18a15b]"
                              style={{
                                width: `${(component.value / selectedSummary.projects) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateFilterWithDependencies(
                        "states",
                        selectedSummary.state,
                      );
                      setActiveNav("Projects");
                      window.requestAnimationFrame(() =>
                        document
                          .getElementById("projects-table")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          }),
                      );
                    }}
                    className="mt-6 flex w-full items-center justify-between rounded-md border border-[#8bcba0] px-3 py-2.5 text-xs font-bold text-[#08733f] hover:bg-[#f0fbf3]"
                  >
                    View all projects in {selectedSummary.state}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </aside>
              )}
            </div>
            <div className="flex items-center gap-2 border-t border-slate-200 bg-[#fbfefb] px-5 py-3 text-xs text-slate-500">
              <MapIcon className="h-4 w-4 text-[#08733f]" />
              The map shows live filtered {mapMode}. Select a state for its
              detailed breakdown.
            </div>
          </section>

          <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-[#173b2a]">
                Programme Performance
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Programme-level delivery for the current filtered view
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    {[
                      "Programme",
                      "Projects",
                      "Capacity",
                      "Households",
                      "Verified",
                    ].map((heading) => (
                      <th key={heading} className="px-5 py-3 font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {programmePerformance.map((row) => (
                    <tr
                      key={row.programme}
                      className="border-t border-slate-100"
                    >
                      <td className="px-5 py-4 text-sm font-bold text-[#08733f]">
                        {row.programme}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-[#173b2a]">
                        {row.projects}
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {row.capacity.toFixed(1)} MW
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-600">
                        {row.households.toLocaleString()}
                      </td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-[#eaf8ef] px-2.5 py-1 text-xs font-bold text-[#08733f]">
                          {row.verified}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!programmePerformance.length && (
              <p className="px-5 py-8 text-center text-sm text-slate-500">
                No programme data matches the selected filters.
              </p>
            )}
          </section>

          <section className="mt-7 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div>
              <h2 className="font-bold text-[#173b2a]">
                Project &amp; Verification Trend
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Monthly movement in inspections, submissions and REA
                verification
              </p>
            </div>
            <div
              className="mt-5 h-64"
              aria-label="Project and verification trend chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData}
                  margin={{ top: 8, right: 12, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5ece7" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      borderColor: "#dbe7de",
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="inspections"
                    name="Inspections completed"
                    stroke="#08733f"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="submitted"
                    name="Reports submitted"
                    stroke="#377fd2"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="verified"
                    name="Reports verified"
                    stroke="#d89100"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
              {[
                ["#08733f", "Inspections completed"],
                ["#377fd2", "Reports submitted"],
                ["#d89100", "Reports verified"],
              ].map(([color, label]) => (
                <span key={label} className="flex items-center gap-2">
                  <i
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {label}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-7 grid gap-5 sm:grid-cols-[1.25fr_.9fr]">
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eaf8ef] text-[#08733f]">
                    <Clock3 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#173b2a]">
                      Recent Activity
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      Latest updates across projects
                    </p>
                  </div>
                </div>
                <button className="text-xs font-semibold text-[#08733f] hover:underline">
                  View all activity
                </button>
              </div>
              <div className="px-5 py-2">
                {visibleProjects.slice(0, 5).map((project, index) => (
                  <div
                    key={project.name}
                    className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${project.verified ? "bg-[#18a15b]" : project.status === "Pending" ? "bg-[#e6ad21]" : "bg-[#377fd2]"}`}
                    />
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${project.verified ? "bg-[#edf8f0] text-[#08733f]" : "bg-[#eef5fc] text-[#3772ad]"}`}
                    >
                      {project.verified ? (
                        <MapPin className="h-4 w-4" />
                      ) : (
                        <FileCheck2 className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-[#173b2a]">
                        {project.name}
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {project.verified
                          ? "Inspection verified"
                          : project.status === "Pending"
                            ? "Report submitted for review"
                            : "Application submitted"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-500">
                      {index === 0
                        ? "Today, 10:24 AM"
                        : `${index + 2} days ago`}
                    </span>
                  </div>
                ))}
              </div>
            </article>
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eaf8ef] text-[#08733f]">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#173b2a]">
                    Quick Actions
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Do more with your projects
                  </p>
                </div>
              </div>
              <div className="space-y-2 p-3">
                <button
                  onClick={() => setActiveNav("Inspections")}
                  className="flex w-full items-center gap-3 rounded-md border border-[#f1dfad] bg-[#fff9e9] px-3 py-3 text-left"
                >
                  <BellRing className="h-4 w-4 text-[#ad7600]" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-xs text-[#173b2a]">
                      Review Pending Reports (
                      {
                        visibleProjects.filter((project) => !project.verified)
                          .length
                      }
                      )
                    </strong>
                    <small className="mt-0.5 block text-[11px] text-slate-500">
                      Awaiting REA verification
                    </small>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                </button>
                <button
                  onClick={() => setActiveNav("Projects")}
                  className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
                >
                  <ListChecks className="h-4 w-4 text-[#3772ad]" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-xs text-[#173b2a]">
                      View All Projects
                    </strong>
                    <small className="mt-0.5 block text-[11px] text-slate-500">
                      See full list and details
                    </small>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                </button>
                <button
                  onClick={() => setActiveNav("Project Map")}
                  className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
                >
                  <MapIcon className="h-4 w-4 text-[#08733f]" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-xs text-[#173b2a]">
                      View Map
                    </strong>
                    <small className="mt-0.5 block text-[11px] text-slate-500">
                      Explore projects by location
                    </small>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                </button>
                <button className="flex w-full items-center gap-3 rounded-md border border-slate-200 px-3 py-3 text-left hover:bg-slate-50">
                  <Download className="h-4 w-4 text-slate-700" />
                  <span className="min-w-0 flex-1">
                    <strong className="block text-xs text-[#173b2a]">
                      Export Reports
                    </strong>
                    <small className="mt-0.5 block text-[11px] text-slate-500">
                      Download summary data
                    </small>
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            </article>
          </section>

          <section className="mt-7 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-[#173b2a]">
                  Inspection &amp; Verification Pipeline
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Workflow status for the current filtered view
                </p>
              </div>
              <span className="rounded-full bg-[#f0fbf3] px-2.5 py-1 text-xs font-semibold text-[#08733f]">
                {visibleProjects.length} reports
              </span>
            </div>
            <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:gap-0">
              {[
                {
                  label: "Inspection Conducted",
                  value: visibleProjects.length,
                },
                {
                  label: "Submitted",
                  value: visibleProjects.filter(
                    (project) => project.status !== "In progress",
                  ).length,
                },
                {
                  label: "Consultant Approved",
                  value: visibleProjects.filter(
                    (project) =>
                      project.verified || project.status === "In progress",
                  ).length,
                },
                {
                  label: "Pending REA Review",
                  value: visibleProjects.filter((project) => !project.verified)
                    .length,
                },
                {
                  label: "REA Verified",
                  value: visibleProjects.filter((project) => project.verified)
                    .length,
                },
              ].map((stage, index, stages) => (
                <div key={stage.label} className="flex flex-1 items-center">
                  <div className="min-w-0 flex-1 rounded-md bg-[#f7fcf8] px-3 py-3 text-center">
                    <p className="text-xl font-bold text-[#153b28]">
                      {stage.value}
                    </p>
                    <p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">
                      {stage.label}
                    </p>
                  </div>
                  {index < stages.length - 1 && (
                    <span className="hidden px-2 text-lg text-[#8ab69a] md:block">
                      →
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-md bg-[#fff9ea] px-4 py-3 sm:flex-row sm:items-center">
              <p className="text-xs text-[#745313]">
                <strong>
                  {
                    visibleProjects.filter((project) => !project.verified)
                      .length
                  }{" "}
                  reports
                </strong>{" "}
                are pending REA verification{" "}
                <span className="ml-1 text-[#9a7a3c]">
                  · Review-time data unavailable
                </span>
              </p>
              <button
                onClick={() => setActiveNav("Inspections")}
                className="text-xs font-bold text-[#9a6500] hover:underline"
              >
                Review queue →
              </button>
            </div>
          </section>

          <section
            id="projects-table"
            className="mt-7 scroll-mt-20 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="font-bold text-[#173b2a]">
                  Projects across Nigeria
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {filters.contractors === defaultFilters.contractors
                    ? "Breakdown by program and contractor"
                    : `${filters.contractors} projects across Nigeria`}
                </p>
              </div>
              <button className="text-xs font-semibold text-[#08733f] hover:underline">
                View all projects
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Project</th>
                    <th className="px-4 py-3 font-semibold">Programme</th>
                    <th className="px-4 py-3 font-semibold">Contractor</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-5 py-3 text-right font-semibold">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.map((project, index) => (
                    <tr
                      key={project.name}
                      className={
                        index !== visibleProjects.length - 1
                          ? "border-b border-slate-100"
                          : ""
                      }
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-[#173b2a]">
                          {project.name}
                        </p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="h-3 w-3" />
                          {project.state}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-slate-600">
                        {project.programme}
                      </td>
                      <td className="px-4 py-4 text-xs font-medium text-slate-600">
                        {project.contractor}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={project.tone}>
                          {project.status}
                        </StatusBadge>
                      </td>
                      <td className="px-5 py-4 text-right text-xs text-slate-500">
                        {index === 0 ? "Today, 10:24" : `${index + 1} days ago`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <footer className="mt-8 -mx-4 flex flex-col gap-3 border-t border-[#d6e9da] bg-[#f0fbf5] px-4 py-5 sm:-mx-7 sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:-mx-9 lg:px-9">
            <div className="flex items-center gap-3">
              <div
                className="relative h-10 w-12 overflow-hidden"
                aria-hidden="true"
              >
                <div className="absolute left-1 top-1 h-8 w-9 -skew-x-12 rounded-[45%_55%_45%_55%] bg-[#79c893]" />
                <div className="absolute left-2 top-2 h-6 w-8 -skew-x-12 rounded-[45%_55%_45%_55%] bg-[#a7dfb8]" />
              </div>
              <div>
                <p className="text-base font-bold tracking-[0.12em] text-[#075c33]">
                  REA
                </p>
                <p className="text-[11px] text-slate-500">
                  Reliable power. Stronger communities. A brighter Nigeria.
                </p>
              </div>
            </div>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Clock3 className="h-4 w-4 text-[#08733f]" />
              Last updated: Today, 4:07 AM
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
}
