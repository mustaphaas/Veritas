import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Bell,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Download,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  Map as MapIcon,
  MapPin,
  LocateFixed,
  LogOut,
  Home,
  Maximize2,
  Zap,
  Menu,
  Minus,
  Plus,
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
import { useAuth } from "../lib/auth";
import ReaAnalyticsDashboard from "../components/ReaAnalyticsDashboard";
import ReaUserManagement from "../components/ReaUserManagement";
import ReaAuditTrail from "../components/ReaAuditTrail";
import ReaConsultantsManagement from "../components/ReaConsultantsManagement";
import ReaVerificationManagement from "../components/ReaVerificationManagement";
import ReaClaimsManagement from "../components/ReaClaimsManagement";
import ReaReportsManagement from "../components/ReaReportsManagement";

class TabErrorBoundary extends Component<{ children: ReactNode; tab: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: { tab: string }) {
    if (previous.tab !== this.props.tab && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <section className="my-4 rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm"><p className="text-sm font-bold text-[#173b2a]">{this.props.tab} could not load from the saved browser session.</p><p className="mt-2 text-xs text-slate-500">Retry the page without changing your dashboard data.</p><button type="button" onClick={() => this.setState({ failed: false })} className="mt-4 rounded-lg bg-[#08733f] px-4 py-2.5 text-xs font-bold text-white">Retry {this.props.tab}</button></section>;
  }
}

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Claims", icon: ClipboardCheck },
  { label: "Verification", icon: FileCheck2 },
  { label: "Consultants", icon: Building2 },
  { label: "Analytics", icon: BarChart3 },
  { label: "Reports", icon: FileCheck2 },
  { label: "Users", icon: UsersRound },
  { label: "Audit Trail", icon: FileCheck2 },
];

type BoundaryFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};
type MapMode = "projects" | "capacity" | "households";
type MapPoint = { x: number; y: number };

const mapBounds = { minLon: 2.5, maxLon: 15, minLat: 3.5, maxLat: 14 };
const mapViewBox = { width: 650, height: 300 };
const mapMeanLatRadians =
  (((mapBounds.minLat + mapBounds.maxLat) / 2) * Math.PI) / 180;
const mapLonCorrection = Math.cos(mapMeanLatRadians);
const mapLonSpanAdjusted =
  (mapBounds.maxLon - mapBounds.minLon) * mapLonCorrection;
const mapLatSpan = mapBounds.maxLat - mapBounds.minLat;
const mapScale = Math.min(
  mapViewBox.width / mapLonSpanAdjusted,
  mapViewBox.height / mapLatSpan,
);
const mapOffsetX = (mapViewBox.width - mapLonSpanAdjusted * mapScale) / 2;
const mapOffsetY = (mapViewBox.height - mapLatSpan * mapScale) / 2;
const mapPalette = ["#f2f8f3", "#dcefe0", "#b9dfc3", "#7fc393", "#18743e"];
const mapModeOptions: Array<{
  value: MapMode;
  label: string;
  shortLabel: string;
}> = [
  { value: "projects", label: "View by Projects", shortLabel: "Projects" },
  {
    value: "capacity",
    label: "View by Capacity (MW)",
    shortLabel: "Capacity",
  },
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
      (longitude - mapBounds.minLon) * mapLonCorrection * mapScale +
      mapOffsetX,
    y:
      mapViewBox.height -
      mapOffsetY -
      (latitude - mapBounds.minLat) * mapScale,
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
    if (value <= 8) return 1;
    if (value <= 12) return 2;
    if (value <= 16) return 3;
    return 4;
  }
  const ratio = maximum ? value / maximum : 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
function mapLegend(mode: MapMode, maximum: number) {
  if (mode === "projects") return ["0", "5–8", "9–12", "13–16", "17–20"];
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

const componentPalette = ["#0f9f55", "#378ce7", "#f5b514", "#a56de2"];

function componentDonutGradient(summary: StateSummary) {
  if (!summary.projects || !summary.byComponent.length) return "#e8eef0";
  let cursor = 0;
  const segments = summary.byComponent.map((component, index) => {
    const start = cursor;
    cursor += (component.value / summary.projects) * 100;
    return `${componentPalette[index % componentPalette.length]} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function getKpis(filteredProjects: Project[]) {
  const totals = summarizePortfolio(filteredProjects);
  return [
    { label: "Projects", value: totals.projects.toLocaleString(), detail: "Across filtered portfolio", icon: FolderKanban, tone: "default" },
    { label: "Installed Capacity", value: `${(totals.kw / 1000).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MW`, detail: "Across filtered projects", icon: SolarCapacityIcon, tone: "highlighted" },
    { label: "Households Reached", value: totals.households.toLocaleString(), detail: "Connected households", icon: Home, tone: "default" },
    { label: "Verification Rate", value: `${totals.verificationRate}%`, detail: `${totals.verified} of ${totals.projects} reports verified`, icon: CheckCircle2, tone: "default" },
    { label: "Pending Verification", value: totals.pending.toLocaleString(), detail: "Reports awaiting REA review", icon: Clock3, tone: "pending", action: "Claims" },
  ];
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 text-sm font-medium leading-10 text-[#173b2a] outline-none transition-colors focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10">
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SolarCapacityIcon({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="18" cy="5" r="2.3"/><path d="M18 1v1M18 8v1M14 5h1M21 5h1M15.2 2.2l.7.7M20.1 7.1l.7.7M20.8 2.2l-.7.7M15.9 7.1l-.7.7"/><path d="M3.5 9.5h11l2 8h-15l2-8Z"/><path d="M4.5 13.5h11M8.5 9.5l-1 8M12 9.5l1 8M9 17.5v3M13 17.5v3M7 20.5h8"/></svg>;
}

function AtlasMark() {
  return <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[#08733f] text-[#08733f]" aria-hidden="true"><Zap className="h-7 w-7" fill="#e7f7ec" strokeWidth={2.5} /></div>;
}

function StatusBadge({ tone, children }: { tone: string; children: string }) {
  const styles = { verified: "border-[#b8dfc5] bg-[#eaf8ef] text-[#08733f]", pending: "border-[#f1d48a] bg-[#fff8e5] text-[#9a6500]", progress: "border-[#bcd3ed] bg-[#eef6ff] text-[#2563a7]", submitted: "border-[#c8e8d1] bg-[#f0fbf3] text-[#39764d]" } as Record<string, string>;
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

export default function Index() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [boundaries, setBoundaries] = useState<BoundaryFeature[]>([]);
  useEffect(() => {
    fetch("/nigeria-adm1.geojson").then((response) => response.json()).then((data: { features: BoundaryFeature[] }) => setBoundaries(data.features));
  }, []);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [mapMode, setMapMode] = useState<MapMode>("projects");
  const [mapZoom, setMapZoom] = useState(1);
  const [mapFocus, setMapFocus] = useState<MapPoint>({ x: 325, y: 150 });
  const [mapTooltip, setMapTooltip] = useState<{ state: string; x: number; y: number } | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const visibleProjects = useMemo(() => matchingProjects(filters), [filters]);
  const displayedProjects = showAllProjects ? visibleProjects : visibleProjects.slice(0, 20);
  useEffect(() => setShowAllProjects(false), [filters]);
  const metrics = getKpis(visibleProjects);
  const programmePerformance = useMemo(() => [...new Set(visibleProjects.map((project) => project.programme))].map((programme) => {
    const matching = visibleProjects.filter((project) => project.programme === programme);
    const verified = matching.filter((project) => project.verified).length;
    return { programme, projects: matching.length, capacity: matching.reduce((total, project) => total + project.kw, 0) / 1000, households: matching.reduce((total, project) => total + project.households, 0), verified: matching.length ? Math.round((verified / matching.length) * 100) : 0 };
  }), [visibleProjects]);
  const trendData = useMemo(() => [...new Set(visibleProjects.map((project) => project.month))].sort((left, right) => Date.parse(`1 ${left}`) - Date.parse(`1 ${right}`)).map((month) => {
    const monthProjects = visibleProjects.filter((project) => project.month === month);
    return { month: month.slice(0, 3), inspections: monthProjects.length, submitted: monthProjects.filter((project) => project.status !== "In progress").length, verified: monthProjects.filter((project) => project.verified).length, verificationRate: monthProjects.length ? Math.round((monthProjects.filter((project) => project.verified).length / monthProjects.length) * 100) : 0 };
  }), [visibleProjects]);
  const [selectedState, setSelectedState] = useState<string | null>("Kano");
  const stateSummaries = useMemo(() => summarizeProjectsByState(visibleProjects), [visibleProjects]);
  const stateBoundaryData = useMemo(() => boundaries.map((boundary, index) => ({ boundary, state: normalizedStateName(boundary.properties), centroid: geometryCentroid(boundary.geometry), key: String(boundary.properties.shapeISO ?? boundary.properties.shapeID ?? index) })), [boundaries]);
  const selectedSummary = stateSummaries.find((summary) => summary.state === selectedState);
  const maximumMapMetric = Math.max(0, ...stateSummaries.map((summary) => mapMetric(summary, mapMode)));
  const legendLabels = mapLegend(mapMode, maximumMapMetric);
  const tooltipSummary = stateSummaries.find((summary) => summary.state === mapTooltip?.state);
  const activeMapFilters = [filters.programs === filterDefaults.programs ? null : filters.programs, filters.components === filterDefaults.components ? null : filters.components, filters.contractors === filterDefaults.contractors ? null : filters.contractors, filters.months === filterDefaults.months ? null : filters.months].filter(Boolean).join(" / ");

  useEffect(() => {
    if (filters.states === filterDefaults.states) return;
    const boundary = stateBoundaryData.find((item) => item.state === filters.states);
    setSelectedState(filters.states);
    if (boundary) {
      setMapFocus(boundary.centroid);
      setMapZoom(1.55);
    }
  }, [filters.states, stateBoundaryData]);

  useEffect(() => {
    if (selectedState && !stateSummaries.some((summary) => summary.state === selectedState)) {
      setSelectedState(null);
      setMapFocus({ x: 325, y: 150 });
      setMapZoom(1);
    }
  }, [selectedState, stateSummaries]);

  const resetMapView = () => {
    setMapZoom(1);
    setMapFocus({ x: 325, y: 150 });
  };

  const selectMapState = (state: string, _centroid: MapPoint) => {
    if (!stateSummaries.some((summary) => summary.state === state)) return;
    setSelectedState(state);
  };

  const updateFilterWithDependencies = (key: FilterKey, value: string) => {
    const next = { ...filters, [key]: value };
    (Object.keys(filterDefaults) as FilterKey[]).forEach((filterKey) => {
      if (filterKey !== key && !getFilterOptions(next, filterKey).includes(next[filterKey])) next[filterKey] = filterDefaults[filterKey];
    });
    setFilters(next);
  };

  const navContent = (
    <>
      <div className="flex h-[94px] items-center gap-3 px-4"><AtlasMark /><div><p className="text-xl font-bold tracking-tight text-[#153b28]">REA</p><p className="mt-0.5 text-[7px] font-bold leading-[9px] text-[#173b2a]">RURAL ELECTRIFICATION<br />AGENCY</p></div></div>
      <div className="h-px bg-slate-200" />
      <nav className="flex-1 space-y-2 px-3 py-5">{navigation.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setActiveNav(label); setMobileMenuOpen(false); }} className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${activeNav === label ? "bg-[#edf9f0] text-[#08733f]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}><Icon className="h-[18px] w-[18px]" strokeWidth={activeNav === label ? 2.5 : 1.8} />{label}</button>)}</nav>
      <div className="border-t border-slate-200 p-3"><button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"><Settings className="h-[18px] w-[18px]" /> Settings</button></div>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f6f8f6] text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[190px] flex-col border-r border-slate-200 bg-white lg:flex">{navContent}</aside>
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`}><div onClick={() => setMobileMenuOpen(false)} className={`absolute inset-0 bg-slate-900/20 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`} /><aside className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}><button onClick={() => setMobileMenuOpen(false)} className="absolute right-3 top-4 rounded p-2 text-slate-500"><X className="h-5 w-5" /></button>{navContent}</aside></div>
      <main className="lg:pl-[190px]">
        <header className="sticky top-0 z-20 flex h-[94px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-8"><div className="flex items-center gap-3"><button onClick={() => setMobileMenuOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Open navigation"><Menu className="h-5 w-5" /></button><div><h1 className="text-lg font-bold tracking-tight text-[#142a1f] sm:text-[22px]">REA Dashboard</h1><p className="mt-1 hidden text-xs text-slate-500 sm:block">Monitor programme delivery and field verification across Nigeria.</p></div></div><div className="flex items-center gap-2 sm:gap-4"><span className="hidden items-center gap-2 text-xs font-semibold text-[#08733f] md:flex"><i className="h-2 w-2 rounded-full bg-[#08733f]" />Live data</span><span className="hidden border-l border-slate-200 pl-4 text-xs text-slate-500 xl:block">Last updated: Today, 10:24 AM</span><button className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" /><span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[#df7d00] px-1 text-[8px] font-bold text-white">3</span></button><div className="hidden items-center gap-2 sm:flex"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UsersRound className="h-5 w-5" /></div><span className="hidden text-xs font-semibold text-[#142a1f] xl:inline">REA Administrator</span></div><button type="button" onClick={() => { logout(); navigate("/login", { replace: true }); }} className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:border-[#e2b5b5] hover:bg-red-50 hover:text-red-700"><LogOut className="h-4 w-4" /><span className="hidden xl:inline">Logout</span></button></div></header>
        <div className="mx-auto max-w-[1580px] px-4 py-0 sm:px-7 lg:px-7">
          {activeNav === "Analytics" ? (
            <TabErrorBoundary key="Analytics" tab="Analytics"><ReaAnalyticsDashboard projects={projects} /></TabErrorBoundary>
          ) : activeNav === "Users" ? (
            <TabErrorBoundary key="Users" tab="Users"><ReaUserManagement /></TabErrorBoundary>
          ) : activeNav === "Audit Trail" ? (
            <TabErrorBoundary key="Audit Trail" tab="Audit Trail"><ReaAuditTrail /></TabErrorBoundary>
          ) : activeNav === "Consultants" ? (
            <TabErrorBoundary key="Consultants" tab="Consultants"><ReaConsultantsManagement /></TabErrorBoundary>
          ) : activeNav === "Claims" ? (
            <TabErrorBoundary key="Claims" tab="Claims"><ReaClaimsManagement /></TabErrorBoundary>
          ) : activeNav === "Verification" ? (
            <ReaVerificationManagement />
          ) : activeNav === "Reports" ? (
            <TabErrorBoundary key="Reports" tab="Reports"><ReaReportsManagement projects={projects} /></TabErrorBoundary>
          ) : (
            <>
          <section className="rounded-b-lg border border-t-0 border-[#d6e9da] bg-[#f7fcf8] p-3"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_205px]">{(Object.keys(filterDefaults) as FilterKey[]).map((key) => <div key={key} className="min-w-0 self-end"><FilterSelect label={filterLabels[key]} value={filters[key]} options={getFilterOptions(filters, key)} onChange={(value) => updateFilterWithDependencies(key, value)} /></div>)}<div className="flex gap-2 sm:col-span-2 xl:col-span-1 xl:flex-col"><button onClick={() => setActiveNav("Claims")} className="flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#08733f] px-3 text-[11px] font-bold text-white hover:bg-[#065d32]"><ClipboardCheck className="h-4 w-4" /> Review Pending Reports ({visibleProjects.filter((project) => !project.verified).length})</button><button onClick={() => { setFilters(defaultFilters); setSelectedState("Kano"); resetMapView(); }} className="flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#76bd91] bg-white px-4 text-xs font-bold text-[#08733f] hover:bg-[#edf9f0]"><LocateFixed className="h-4 w-4" /> Reset filters</button></div></div></section>
          <section className="mt-3 flex gap-3 overflow-x-auto pb-1">{metrics.map(({ label, value, detail, icon: Icon, tone, action }) => { const cardClassName = `min-h-[100px] min-w-[210px] flex-1 rounded-lg border p-3 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${tone === "highlighted" ? "border-[#cdebd6] bg-[#f4fbf6]" : tone === "pending" ? "border-[#f1dfaf] bg-[#fffaf0] transition-colors hover:border-[#d9aa37] hover:bg-[#fff7df]" : "border-slate-200 bg-white"}`; const cardContent = <div className="flex h-full items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone === "pending" ? "bg-[#fff3cf] text-[#e29a00]" : "bg-[#e9f7ed] text-[#159455]"}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#263c31]">{label}</p><p className={`mt-1 text-[21px] font-bold leading-none tracking-tight ${tone === "pending" ? "text-[#9a6300]" : "text-[#13281e]"}`}>{value}</p><p className="mt-2 text-[11px] leading-4 text-slate-500">{detail}</p>{label === "Verification Rate" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#119653]" style={{ width: value }} /></div>}</div></div>; return action ? <button key={label} type="button" onClick={() => setActiveNav(action)} className={cardClassName} aria-label={`${label}: ${value}. Open verification queue`}>{cardContent}</button> : <article key={label} className={cardClassName}>{cardContent}</article>; })}</section>
          <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(360px,1fr)]">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <div className="border-b border-slate-200 px-3 py-3"><h2 className="text-sm font-bold text-[#173b2a]">National Project Coverage</h2><div className="mt-3 inline-flex max-w-full overflow-x-auto rounded-md border border-slate-200 bg-white p-0.5" aria-label="Map viewing mode">{mapModeOptions.map((option) => <button key={option.value} type="button" onClick={() => setMapMode(option.value)} className={`whitespace-nowrap rounded px-3 py-2 text-[10px] font-semibold transition-colors ${mapMode === option.value ? "bg-[#08733f] text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"}`}>{option.label}</button>)}</div></div>
              <div className={selectedSummary ? "grid lg:grid-cols-[minmax(0,1fr)_290px]" : "grid"}>
                <div ref={mapContainerRef} className="relative min-h-[390px] overflow-hidden bg-[#f7fbf8] sm:h-[390px]" onWheel={(event) => { event.preventDefault(); setMapZoom((zoom) => Math.min(2.5, Math.max(1, zoom + (event.deltaY < 0 ? 0.15 : -0.15)))); }}>
                  <div className="absolute inset-0 opacity-80" style={{ backgroundImage: "radial-gradient(circle at 48% 45%, #ffffff 0%, #f4faf6 48%, #edf6f0 100%)" }} />
                  <div className="absolute left-3 top-3 z-20 flex flex-col overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setMapZoom((zoom) => Math.min(2.5, zoom + 0.25))} className="border-b border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Zoom in"><Plus className="h-4 w-4" /></button><button type="button" onClick={() => setMapZoom((zoom) => Math.max(1, zoom - 0.25))} className="border-b border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Zoom out"><Minus className="h-4 w-4" /></button><button type="button" onClick={() => { if (document.fullscreenElement) { void document.exitFullscreen(); } else { void mapContainerRef.current?.requestFullscreen(); } }} className="border-b border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label="Toggle fullscreen map"><Maximize2 className="h-4 w-4" /></button><button type="button" onClick={resetMapView} className="p-2 text-slate-600 hover:bg-slate-50" aria-label="Fit map to Nigeria"><LocateFixed className="h-4 w-4" /></button></div>
                  <svg className="relative z-10 h-full min-h-[390px] w-full touch-pan-x touch-pan-y sm:min-h-0" viewBox="0 0 650 300" fill="none" aria-label={`Interactive Nigeria state map viewed by ${mapMode}`}>
                    {stateBoundaryData.length ? <g transform={`translate(325 150) scale(${mapZoom}) translate(${-mapFocus.x} ${-mapFocus.y})`}>
                      {stateBoundaryData.map(({ boundary, state, centroid, key }) => { const summary = stateSummaries.find((item) => item.state === state); const value = mapMetric(summary, mapMode); const selected = state === selectedState || filters.states === state; return <path key={key} d={geometryPath(boundary.geometry)} fill={mapPalette[mapBand(value, mapMode, maximumMapMetric)]} stroke={selected ? "#075c33" : "#9fc8aa"} strokeWidth={selected ? 2 : summary ? 1.05 : 0.7} vectorEffect="non-scaling-stroke" className={summary ? "cursor-pointer transition-colors hover:brightness-95 focus:outline-none" : ""} role={summary ? "button" : undefined} tabIndex={summary ? 0 : undefined} aria-label={summary ? `${state}: ${formatMapMetric(value, mapMode)}` : `${state}: no matching project data`} onClick={() => selectMapState(state, centroid)} onKeyDown={(event) => { if (summary && (event.key === "Enter" || event.key === " ")) selectMapState(state, centroid); }} onMouseMove={(event) => { if (!summary) return; const bounds = mapContainerRef.current?.getBoundingClientRect(); if (bounds) setMapTooltip({ state, x: event.clientX - bounds.left, y: event.clientY - bounds.top }); }} onMouseLeave={() => setMapTooltip(null)} />; })}
                      {stateBoundaryData.map(({ state, centroid, key }) => { const summary = stateSummaries.find((item) => item.state === state); const value = mapMetric(summary, mapMode); const selected = state === selectedState || filters.states === state; const markerWidth = mapMode === "projects" ? 18 : mapMode === "capacity" ? 42 : 38; return <g key={`${key}-label`} transform={`translate(${centroid.x} ${centroid.y})`} pointerEvents="none"><text y={summary ? -5 : 2} textAnchor="middle" fill={selected ? "#064e2b" : "#315b3f"} fontSize="7" fontWeight={summary ? "700" : "500"}>{state}</text>{summary && <><rect x={-markerWidth / 2} y="0" width={markerWidth} height={mapMode === "projects" ? 18 : 15} rx={mapMode === "projects" ? 9 : 7.5} fill={selected ? "#08733f" : "white"} stroke={selected ? "white" : "#b9dfc5"} strokeWidth="1.2" vectorEffect="non-scaling-stroke" /><text y={mapMode === "projects" ? 12.2 : 10.5} textAnchor="middle" fill={selected ? "white" : "#08733f"} fontSize={mapMode === "projects" ? "8" : "6.2"} fontWeight="800">{formatMapMetric(value, mapMode, true)}</text></>}</g>; })}
                    </g> : <text x="325" y="150" textAnchor="middle" fill="#557060" fontSize="12" fontWeight="600">Nigeria state boundary data is unavailable.</text>}
                  </svg>
                  {mapTooltip && tooltipSummary && <div className="pointer-events-none absolute z-30 w-52 rounded-md border border-[#b9dfc5] bg-white p-3 text-xs shadow-lg" style={{ left: mapTooltip.x + 12, top: Math.max(12, mapTooltip.y - 36) }}><p className="font-bold text-[#173b2a]">{tooltipSummary.state}{activeMapFilters ? ` — ${activeMapFilters}` : ""}</p><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-slate-500"><span>Projects</span><strong className="text-right text-[#173b2a]">{tooltipSummary.projects}</strong><span>Capacity</span><strong className="text-right text-[#173b2a]">{(tooltipSummary.kw / 1000).toFixed(1)} MW</strong><span>Households</span><strong className="text-right text-[#173b2a]">{tooltipSummary.households.toLocaleString()}</strong></div></div>}
                  <div className="absolute bottom-3 left-3 z-20 w-[208px] max-w-[calc(100%-1.5rem)] rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur"><p className="text-[11px] font-bold text-[#173b2a]">{mapModeOptions.find((option) => option.value === mapMode)?.shortLabel}</p><div className="mt-2 h-2.5 rounded-full" style={{ background: `linear-gradient(90deg, ${mapPalette.join(", ")})` }} /><div className="mt-1.5 grid grid-cols-5 gap-1">{legendLabels.map((label, index) => <span key={`${label}-${index}`} className={`${index === 0 ? "text-left" : index === legendLabels.length - 1 ? "text-right" : "text-center"} text-[9px] text-slate-500`}>{label}</span>)}</div></div>
                </div>
                {selectedSummary && <aside className="border-t border-slate-200 bg-white p-4 lg:border-l lg:border-t-0" aria-label={`${selectedSummary.state} state details`}><div className="flex items-start justify-between"><div><h3 className="font-bold text-[#173b2a]">{selectedSummary.state} State</h3></div><button type="button" onClick={() => { setSelectedState(null); resetMapView(); }} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close state details"><X className="h-4 w-4" /></button></div><dl className="mt-3 divide-y divide-slate-100 text-sm">{[{ label: "Projects", value: selectedSummary.projects.toLocaleString(), icon: FolderKanban, tone: "text-[#08733f]" }, { label: "Installed Capacity", value: `${(selectedSummary.kw / 1000).toFixed(1)} MW`, icon: Zap, tone: "text-[#08733f]" }, { label: "Households Reached", value: selectedSummary.households.toLocaleString(), icon: Home, tone: "text-[#08733f]" }, { label: "Verified Reports", value: selectedSummary.verified.toLocaleString(), icon: CheckCircle2, tone: "text-[#08733f]" }, { label: "Pending Verification", value: selectedSummary.pending.toLocaleString(), icon: Clock3, tone: "text-[#d89100]" }].map(({ label, value, icon: Icon, tone }) => <div key={label} className="flex items-center gap-3 py-2.5"><Icon className={`h-4 w-4 ${tone}`} /><dt className="text-xs text-slate-600">{label}</dt><dd className="ml-auto font-bold text-[#173b2a]">{value}</dd></div>)}</dl><div className="mt-4 border-t border-slate-100 pt-4"><h4 className="text-sm font-bold text-[#173b2a]">Projects by Component</h4><div className="mt-4 flex items-center gap-5"><div className="relative h-[78px] w-[78px] shrink-0 rounded-full" style={{ background: componentDonutGradient(selectedSummary) }} aria-label={`${selectedSummary.state} component distribution`}><div className="absolute inset-[15px] flex items-center justify-center rounded-full bg-white"><span className="text-lg font-bold text-[#173b2a]">{selectedSummary.projects}</span></div></div><div className="min-w-0 flex-1 space-y-2.5">{selectedSummary.byComponent.map((component, index) => <div key={component.name} className="flex items-center gap-2 text-[10px]"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: componentPalette[index % componentPalette.length] }} /><span className="min-w-0 flex-1 truncate text-slate-600">{component.name}</span><strong className="whitespace-nowrap text-[#173b2a]">{component.value} ({Math.round((component.value / selectedSummary.projects) * 100)}%)</strong></div>)}</div></div></div><button type="button" onClick={() => { updateFilterWithDependencies("states", selectedSummary.state); setActiveNav("Projects"); window.requestAnimationFrame(() => document.getElementById("projects-table")?.scrollIntoView({ behavior: "smooth", block: "start" })); }} className="mt-4 flex w-full items-center justify-between rounded-md border border-[#8bcba0] px-3 py-2.5 text-xs font-bold text-[#08733f] hover:bg-[#f0fbf3]">View all projects in {selectedSummary.state}<ArrowRight className="h-4 w-4" /></button></aside>}
              </div>
              <div className="flex items-center gap-2 border-t border-slate-200 bg-[#fbfefb] px-5 py-3 text-xs text-slate-500"><MapIcon className="h-4 w-4 text-[#08733f]" />The map shows live filtered {mapMode}. Select a state for its detailed breakdown.</div>
            </section>
            <div className="grid gap-4"><section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5"><h2 className="text-sm font-bold text-[#173b2a]">Programme Performance</h2><button className="text-[11px] font-semibold text-[#08733f] hover:underline">View all</button></div><div className="divide-y divide-slate-100 px-4">{programmePerformance.map((row, index) => <div key={row.programme} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2.5 py-2"><div className={`flex h-7 w-7 items-center justify-center rounded-md ${index === 3 ? "bg-[#fff4d9] text-[#d18a00]" : "bg-[#eaf8ef] text-[#0c8a49]"}`}><Building2 className="h-4 w-4" /></div><div className="min-w-0"><div className="flex items-center justify-between gap-2 text-[11px]"><strong className="text-[#173b2a]">{row.programme}</strong><span className="text-slate-600">{row.projects} {row.projects === 1 ? "Project" : "Projects"}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#08733f]" style={{ width: `${(row.projects / Math.max(1, ...programmePerformance.map((item) => item.projects))) * 100}%` }} /></div></div><span className="whitespace-nowrap text-[11px] font-semibold text-slate-600">{row.capacity.toFixed(1)} MW</span></div>)}</div>{!programmePerformance.length && <p className="px-5 py-8 text-center text-sm text-slate-500">No programme data matches the selected filters.</p>}</section>
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-[#173b2a]">Project &amp; Verification Trend</h2><span className="rounded-md border border-slate-200 px-2.5 py-1 text-[10px] font-semibold text-slate-600">Current period</span></div><div className="mt-3 flex flex-wrap gap-3 text-[10px] text-slate-500">{[["#cbd5e1", "Submitted"], ["#5bc18d", "Verified"], ["#08733f", "Verification rate"]].map(([color, label]) => <span key={label} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ backgroundColor: color }} />{label}</span>)}</div><div className="mt-3 h-[180px]" aria-label="Project and verification trend chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={trendData} margin={{ top: 8, right: -8, left: -28, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e5ece7" /><XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis yAxisId="reports" allowDecimals={false} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} /><YAxis yAxisId="rate" orientation="right" domain={[0, 100]} tickFormatter={(value) => `${value}%`} tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 8, borderColor: "#dbe7de", fontSize: 12 }} /><Bar yAxisId="reports" dataKey="submitted" name="Submitted" fill="#cbd5e1" radius={[2, 2, 0, 0]} /><Bar yAxisId="reports" dataKey="verified" name="Verified" fill="#5bc18d" radius={[2, 2, 0, 0]} /><Line yAxisId="rate" type="monotone" dataKey="verificationRate" name="Verification rate" stroke="#08733f" strokeWidth={2} dot={{ r: 2.5, fill: "#08733f" }} /></ComposedChart></ResponsiveContainer></div></section></div>
          </div>
          <section className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.08fr_.95fr_1fr]">
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eaf8ef] text-[#08733f]"><Clock3 className="h-5 w-5" /></div><div><h2 className="text-sm font-bold text-[#173b2a]">Recent Activity</h2><p className="mt-1 text-xs text-slate-500">Latest updates across projects</p></div></div><button className="text-xs font-semibold text-[#08733f] hover:underline">View all activity</button></div><div className="px-5 py-2">{visibleProjects.slice(0, 2).map((project, index) => <div key={project.name} className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${project.verified ? "bg-[#18a15b]" : project.status === "Pending" ? "bg-[#e6ad21]" : "bg-[#377fd2]"}`} /><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${project.verified ? "bg-[#edf8f0] text-[#08733f]" : "bg-[#eef5fc] text-[#3772ad]"}`}>{project.verified ? <MapPin className="h-4 w-4" /> : <FileCheck2 className="h-4 w-4" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-[#173b2a]">{project.name}</p><p className="mt-0.5 text-[11px] text-slate-500">{project.verified ? "Inspection verified" : project.status === "Pending" ? "Report submitted for review" : "Application submitted"}</p></div><span className="shrink-0 text-[11px] text-slate-500">{index === 0 ? "Today, 10:24 AM" : `${index + 2} days ago`}</span></div>)}</div></article>
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#eaf8ef] text-[#08733f]"><Zap className="h-5 w-5" /></div><div><h2 className="text-sm font-bold text-[#173b2a]">Quick Actions</h2><p className="mt-1 text-xs text-slate-500">Do more with your projects</p></div></div><div className="grid grid-cols-4 gap-2 p-4"><button onClick={() => setActiveNav("Projects")} className="flex min-h-[92px] flex-col items-center justify-center rounded-lg border border-[#cdebd6] bg-[#effaf2] p-2 text-center hover:bg-[#e6f7eb]"><FolderKanban className="h-6 w-6 text-[#08733f]" /><strong className="mt-2 block text-[11px] text-[#173b2a]">Add Project</strong></button><button className="flex min-h-[92px] flex-col items-center justify-center rounded-lg border border-[#d7e4f5] bg-[#f1f6fd] p-2 text-center hover:bg-[#eaf2fc]"><Download className="h-6 w-6 text-[#3772ad]" /><strong className="mt-2 block text-[11px] text-[#173b2a]">Upload Report</strong></button><button onClick={() => setActiveNav("Claims")} className="flex min-h-[92px] flex-col items-center justify-center rounded-lg border border-[#dddff7] bg-[#f5f4fd] p-2 text-center hover:bg-[#eeecfb]"><UsersRound className="h-6 w-6 text-[#6078d3]" /><strong className="mt-2 block text-[11px] text-[#173b2a]">Assign Inspector</strong></button><button onClick={() => setActiveNav("Claims")} className="flex min-h-[92px] flex-col items-center justify-center rounded-lg border border-[#f3dfad] bg-[#fff8e8] p-2 text-center hover:bg-[#fff3d5]"><Clock3 className="h-6 w-6 text-[#d89100]" /><strong className="mt-2 block text-[11px] text-[#173b2a]">View Pending ({visibleProjects.filter((project) => !project.verified).length})</strong></button></div></article>
            <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] md:col-span-2 xl:col-span-1"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-[#173b2a]">Projects Across Nigeria</h2><span className="text-[10px] font-semibold text-slate-500">Current filtered view</span></div><p className="mt-5 text-4xl font-bold tracking-tight text-[#173b2a]">{visibleProjects.length}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">Total Projects</p><div className="mt-5 grid grid-cols-3 gap-3"><div className="rounded-lg bg-[#edf8f0] p-3 text-center"><p className="text-2xl font-bold text-[#08733f]">{visibleProjects.filter((project) => project.verified).length}</p><p className="mt-1 text-[10px] font-semibold text-[#39764d]">Verified</p></div><div className="rounded-lg bg-[#fff7e3] p-3 text-center"><p className="text-2xl font-bold text-[#c88400]">{visibleProjects.filter((project) => !project.verified).length}</p><p className="mt-1 text-[10px] font-semibold text-[#8a6721]">Pending</p></div><div className="rounded-lg bg-[#eef3fc] p-3 text-center"><p className="text-2xl font-bold text-[#4775c5]">{visibleProjects.filter((project) => project.status === "Submitted").length}</p><p className="mt-1 text-[10px] font-semibold text-[#486a9e]">Submitted</p></div></div></article>
          </section>
          <section id="projects-table" className="mt-7 scroll-mt-20 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-[#173b2a]">Projects across Nigeria</h2><p className="mt-1 text-xs text-slate-500">{filters.contractors === defaultFilters.contractors ? "Breakdown by program and contractor" : `${filters.contractors} projects across Nigeria`}</p></div><button type="button" onClick={() => setShowAllProjects((showAll) => !showAll)} disabled={visibleProjects.length <= 20} className="text-xs font-semibold text-[#08733f] hover:underline disabled:cursor-default disabled:text-slate-400 disabled:no-underline">{visibleProjects.length <= 20 ? "All projects shown" : showAllProjects ? "Show first 20" : "View all projects"}</button></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Project</th><th className="px-4 py-3 font-semibold">Programme</th><th className="px-4 py-3 font-semibold">Contractor</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Updated</th></tr></thead><tbody>{displayedProjects.map((project, index) => <tr key={project.name} className={index !== displayedProjects.length - 1 ? "border-b border-slate-100" : ""}><td className="px-5 py-4"><p className="text-sm font-semibold text-[#173b2a]">{project.name}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{project.state}</p></td><td className="px-4 py-4 text-xs font-medium text-slate-600">{project.programme}</td><td className="px-4 py-4 text-xs font-medium text-slate-600">{project.contractor}</td><td className="px-4 py-4"><StatusBadge tone={project.tone}>{project.status}</StatusBadge></td><td className="px-5 py-4 text-right text-xs text-slate-500">{index === 0 ? "Today, 10:24" : `${index + 1} days ago`}</td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 border-t border-slate-200 bg-[#fbfefb] px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-slate-500">Showing {displayedProjects.length.toLocaleString()} of {visibleProjects.length.toLocaleString()} projects</p>{visibleProjects.length > 20 && <button type="button" onClick={() => setShowAllProjects((showAll) => !showAll)} className="inline-flex items-center gap-2 text-xs font-bold text-[#08733f] hover:underline">{showAllProjects ? "Show first 20" : "View all projects"}<ArrowRight className={`h-4 w-4 transition-transform ${showAllProjects ? "rotate-180" : ""}`} /></button>}</div></section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
