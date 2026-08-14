import { useState } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  MapPin,
  Home,
  Zap,
  Menu,
  MoreHorizontal,
  Search,
  Settings,
  UsersRound,
  X,
} from "lucide-react";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Projects", icon: FolderKanban },
  { label: "Project Map", icon: MapPin },
  { label: "Inspections", icon: ClipboardCheck },
  { label: "Verified Reports", icon: FileCheck2 },
  { label: "Contractors", icon: Building2 },
  { label: "Programmes", icon: UsersRound },
];

type Project = {
  name: string; state: string; programme: string; component: string; contractor: string; month: string;
  status: string; tone: string; kw: number; households: number; verified: boolean; x: number; y: number;
};

const projects: Project[] = [
  { name: "Kano Solar Mini-grid Programme", state: "Kano", programme: "NEP", component: "Mini Grid", contractor: "SunVolt Nigeria", month: "June 2024", status: "Verified", tone: "verified", kw: 3200, households: 4200, verified: true, x: 218, y: 107 },
  { name: "Kaduna Rural Energy Access", state: "Kaduna", programme: "DARES", component: "Solar Home System", contractor: "NorthGrid EPC", month: "June 2024", status: "Verified", tone: "verified", kw: 2800, households: 3600, verified: true, x: 293, y: 129 },
  { name: "Katsina Community Power", state: "Katsina", programme: "AMP", component: "Mini Grid", contractor: "Apex Power Works", month: "May 2024", status: "In progress", tone: "progress", kw: 2400, households: 3100, verified: false, x: 358, y: 113 },
  { name: "Abuja Solar Hub", state: "FCT", programme: "NEP", component: "Solar Street Light", contractor: "NorthGrid EPC", month: "June 2024", status: "Submitted", tone: "submitted", kw: 1800, households: 2500, verified: false, x: 421, y: 151 },
  { name: "Akpabuyo Grid Extension", state: "Cross River", programme: "AMP", component: "Solar Home System", contractor: "Apex Power Works", month: "April 2024", status: "Verified", tone: "verified", kw: 3900, households: 5200, verified: true, x: 250, y: 192 },
  { name: "Sokoto Solar Home Systems", state: "Sokoto", programme: "DARES", component: "Solar Home System", contractor: "SunVolt Nigeria", month: "March 2024", status: "Verified", tone: "verified", kw: 1700, households: 2100, verified: true, x: 376, y: 205 },
  { name: "Jigawa Mini-grid Expansion", state: "Jigawa", programme: "NEP", component: "Mini Grid", contractor: "SunVolt Nigeria", month: "May 2024", status: "Pending", tone: "pending", kw: 1500, households: 1900, verified: false, x: 325, y: 237 },
  { name: "Gombe Grid Extension", state: "Gombe", programme: "DARES", component: "Mini Grid", contractor: "NorthGrid EPC", month: "April 2024", status: "Verified", tone: "verified", kw: 1200, households: 1700, verified: true, x: 440, y: 190 },
];

const filterDefaults = { programs: "All Programmes", components: "All Components", contractors: "All Contractors", months: "Month" } as const;
type FilterKey = keyof typeof filterDefaults;
type Filters = Record<FilterKey, string>;
const defaultFilters: Filters = { ...filterDefaults };
const filterLabels: Record<FilterKey, string> = { programs: "Programmes", components: "Components", contractors: "Contractor", months: "Month" };

function matchingProjects(filters: Filters, ignore?: FilterKey) {
  return projects.filter((project) =>
    (ignore === "programs" || filters.programs === filterDefaults.programs || project.programme === filters.programs) &&
    (ignore === "components" || filters.components === filterDefaults.components || project.component === filters.components) &&
    (ignore === "contractors" || filters.contractors === filterDefaults.contractors || project.contractor === filters.contractors) &&
    (ignore === "months" || filters.months === filterDefaults.months || project.month === filters.months),
  );
}

function getFilterOptions(filters: Filters, key: FilterKey) {
  const values = [...new Set(matchingProjects(filters, key).map((project) => key === "programs" ? project.programme : key === "components" ? project.component : key === "contractors" ? project.contractor : project.month))];
  return [filterDefaults[key], ...values];
}

function getKpis(filteredProjects: Project[]) {
  const verified = filteredProjects.filter((project) => project.verified).length;
  const sum = (field: "kw" | "households") => filteredProjects.reduce((total, project) => total + project[field], 0).toLocaleString();
  return [
    { label: "Programs", value: new Set(filteredProjects.map((project) => project.programme)).size.toString(), detail: "Filtered portfolio", icon: Building2, highlighted: false },
    { label: "Installed capacity", value: `${sum("kw")} kW`, detail: "Across filtered projects", icon: Zap, highlighted: true },
    { label: "Households reached", value: sum("households"), detail: "Connected households", icon: Home, highlighted: false },
    { label: "Verified inspections", value: filteredProjects.length ? `${Math.round((verified / filteredProjects.length) * 100)}%` : "0%", detail: `${verified} inspections verified`, icon: CheckCircle2, highlighted: false },
  ];
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 text-sm font-medium leading-10 text-[#173b2a] outline-none transition-colors focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function AtlasMark() {
  return (
    <div className="grid h-10 w-10 grid-cols-2 gap-1 rounded-lg bg-[#08733f] p-2 shadow-sm" aria-hidden="true">
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

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

export default function Index() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("Overview");
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const visibleProjects = matchingProjects(filters);
  const metrics = getKpis(visibleProjects);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const stateSummaries = [...new Set(visibleProjects.map((project) => project.state))].map((state) => {
    const stateProjects = visibleProjects.filter((project) => project.state === state);
    return { state, projects: stateProjects.length, programmes: new Set(stateProjects.map((project) => project.programme)).size, components: [...new Set(stateProjects.map((project) => project.component))], kw: stateProjects.reduce((sum, project) => sum + project.kw, 0), households: stateProjects.reduce((sum, project) => sum + project.households, 0), pending: stateProjects.some((project) => !project.verified) };
  });
  const selectedSummary = stateSummaries.find((summary) => summary.state === selectedState);
  const verificationStats = [
    { label: "Verified", value: visibleProjects.filter((project) => project.verified).length, color: "bg-[#08733f]" },
    { label: "In progress", value: visibleProjects.filter((project) => project.status === "In progress").length, color: "bg-[#5d8fc6]" },
    { label: "Pending review", value: visibleProjects.filter((project) => project.status === "Pending").length, color: "bg-[#d89100]" },
  ];
  const updateFilterWithDependencies = (key: FilterKey, value: string) => {
    const next = { ...filters, [key]: value };
    (Object.keys(filterDefaults) as FilterKey[]).forEach((filterKey) => {
      if (filterKey !== key && !getFilterOptions(next, filterKey).includes(next[filterKey])) next[filterKey] = filterDefaults[filterKey];
    });
    setFilters(next);
  };

  const navContent = (
    <>
      <div className="flex items-center gap-3 px-5 py-6">
        <AtlasMark />
        <div>
          <p className="text-[15px] font-bold tracking-[0.08em] text-[#075c33]">ATLAS GRID</p>
          <p className="mt-0.5 text-[9px] font-semibold tracking-[0.08em] text-slate-500">REA FIELD MONITORING</p>
        </div>
      </div>
      <div className="mx-5 h-px bg-slate-200" />
      <nav className="flex-1 space-y-1 px-3 py-5">
        <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p>
        {navigation.map(({ label, icon: Icon }) => (
          <button
            key={label}
            onClick={() => { setActiveNav(label); setMobileMenuOpen(false); }}
            className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors ${
              activeNav === label ? "bg-[#edf9f0] text-[#08733f]" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={activeNav === label ? 2.5 : 1.8} />
            {label}
          </button>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-3">
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          <Settings className="h-[18px] w-[18px]" /> Settings
        </button>
        <div className="mt-3 flex items-center gap-3 rounded-md bg-[#f6fcf7] px-3 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d8f0df] text-xs font-bold text-[#075c33]">MA</div>
          <div className="min-w-0 text-left"><p className="truncate text-xs font-semibold text-[#173b2a]">Mustapha Aliyu</p><p className="text-[10px] text-slate-500">REA Administrator</p></div>
          <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">{navContent}</aside>
      <div className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "" : "pointer-events-none"}`}>
        <div onClick={() => setMobileMenuOpen(false)} className={`absolute inset-0 bg-slate-900/20 transition-opacity ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`} />
        <aside className={`absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-xl transition-transform ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <button onClick={() => setMobileMenuOpen(false)} className="absolute right-3 top-4 rounded p-2 text-slate-500"><X className="h-5 w-5" /></button>
          {navContent}
        </aside>
      </div>

      <main className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileMenuOpen(true)} className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
            <div className="relative hidden w-64 md:block"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10" placeholder="Search projects, locations..." /></div>
            <p className="text-sm font-semibold text-[#173b2a] md:hidden">ATLAS GRID</p>
          </div>
          <div className="flex items-center gap-3"><span className="hidden text-xs text-slate-500 sm:block">Friday, 14 June 2024</span><button className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" /><span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border border-white bg-[#d89100]" /></button></div>
        </header>

        <div className="mx-auto max-w-[1520px] px-4 py-7 sm:px-7 lg:px-9">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.13em] text-[#08733f]">Rural Electrification Agency</p><h1 className="text-2xl font-bold tracking-tight text-[#153b28] sm:text-[28px]">National Project Overview</h1><p className="mt-1.5 text-sm text-slate-500">Monitor programme delivery and field verification across Nigeria.</p></div>
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#08733f] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#065d32]"><ClipboardCheck className="h-4 w-4" /> Review inspections</button>
          </div>

          <section className="mt-7 rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-4 sm:p-5"><div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]"><FilterSelect label={filterLabels.programs} value={filters.programs} options={getFilterOptions(filters, "programs")} onChange={(value) => updateFilterWithDependencies("programs", value)} /><FilterSelect label={filterLabels.components} value={filters.components} options={getFilterOptions(filters, "components")} onChange={(value) => updateFilterWithDependencies("components", value)} /><FilterSelect label={filterLabels.contractors} value={filters.contractors} options={getFilterOptions(filters, "contractors")} onChange={(value) => updateFilterWithDependencies("contractors", value)} /><FilterSelect label={filterLabels.months} value={filters.months} options={getFilterOptions(filters, "months")} onChange={(value) => updateFilterWithDependencies("months", value)} /><button onClick={() => setFilters(defaultFilters)} className="mb-0.5 justify-self-end whitespace-nowrap px-2 text-xs font-semibold text-[#08733f] hover:underline">Reset filters</button></div></section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map(({ label, value, detail, icon: Icon, highlighted }) => <article key={label} className={`flex min-h-[174px] flex-col items-center justify-center rounded-lg border p-5 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${highlighted ? "border-[#cdebd6] bg-[#f4fcf6]" : "border-slate-200 bg-white"}`}><div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#eaf8ef] text-[#08733f]"><Icon className="h-5 w-5" /></div><p className="mt-4 text-sm font-medium text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-[#153b28]">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></article>)}
          </section>

          <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-[#173b2a]">National project coverage</h2><p className="mt-1 text-xs text-slate-500">All programs across states in Nigeria</p></div><div className="flex flex-wrap gap-2"><select value={filters.contractors} onChange={(event) => updateFilterWithDependencies("contractors", event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-[#08733f] outline-none"><option value={filterDefaults.contractors}>View projects by: All Contractors</option>{getFilterOptions(filters, "contractors").filter((option) => option !== filterDefaults.contractors).map((option) => <option key={option}>{option}</option>)}</select><select value={filters.programs} onChange={(event) => updateFilterWithDependencies("programs", event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none"><option value={filterDefaults.programs}>All Programmes</option>{getFilterOptions(filters, "programs").filter((option) => option !== filterDefaults.programs).map((option) => <option key={option}>{option}</option>)}</select><select value={filters.components} onChange={(event) => updateFilterWithDependencies("components", event.target.value)} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium text-slate-600 outline-none"><option value={filterDefaults.components}>All Components</option>{getFilterOptions(filters, "components").filter((option) => option !== filterDefaults.components).map((option) => <option key={option}>{option}</option>)}</select></div></div>{false && <div className="grid grid-cols-2 gap-3 border-b border-slate-100 bg-[#fbfefb] p-4 sm:grid-cols-5"><div><p className="text-[10px] uppercase tracking-wider text-slate-500">Total projects</p><p className="mt-1 text-lg font-bold text-[#153b28]">{visibleProjects.length}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-500">Programmes</p><p className="mt-1 text-lg font-bold text-[#153b28]">{new Set(visibleProjects.map((project) => project.programme)).size}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-500">Components</p><p className="mt-1 text-lg font-bold text-[#153b28]">{new Set(visibleProjects.map((project) => project.component)).size}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-500">Total kW</p><p className="mt-1 text-lg font-bold text-[#153b28]">{visibleProjects.reduce((sum, project) => sum + project.kw, 0).toLocaleString()}</p></div><div><p className="text-[10px] uppercase tracking-wider text-slate-500">Households</p><p className="mt-1 text-lg font-bold text-[#153b28]">{visibleProjects.reduce((sum, project) => sum + project.households, 0).toLocaleString()}</p></div></div>}<div className="relative h-[345px] overflow-hidden bg-[#f8fbf8] p-6">
                <div className="absolute inset-0 opacity-[0.32]" style={{ backgroundImage: "linear-gradient(#d9eadc 1px, transparent 1px), linear-gradient(90deg, #d9eadc 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
                <svg className="relative z-10 h-full w-full" viewBox="0 0 650 300" fill="none" aria-label="Stylized Nigeria project map">
                  <path d="M154 58 L224 45 L271 65 L337 48 L396 79 L476 87 L505 123 L485 163 L506 208 L454 248 L385 240 L333 269 L274 247 L206 260 L159 218 L112 178 L129 128 Z" fill="#e4f3e7" stroke="#aacfb1" strokeWidth="2" />
                  <path d="M189 74 L201 236 M249 58 L265 248 M322 60 L326 258 M390 77 L381 243 M457 101 L438 236 M132 128 L489 132 M130 177 L492 178 M163 219 L461 219" stroke="#bbd9c0" strokeWidth="1" />
                  {stateSummaries.map((summary) => { const project = visibleProjects.find((item) => item.state === summary.state)!; return <g key={summary.state} className="cursor-pointer" onClick={() => setSelectedState(summary.state)}><circle cx={project.x} cy={project.y} r={summary.state === selectedState ? 19 : 11 + summary.programmes * 2} fill={summary.pending ? "#d89100" : "#08733f"} opacity=".16"/><circle cx={project.x} cy={project.y} r={summary.state === selectedState ? 8 : 5} fill={summary.pending ? "#d89100" : "#08733f"} stroke="white" strokeWidth="2"/><text x={project.x + 10} y={project.y - 8} fill="#557060" fontSize="8" fontWeight="600">{summary.state} · {summary.programmes}</text></g>; })}
                  <text x="276" y="156" fill="#557060" fontSize="10" fontWeight="600">NIGERIA</text>
                </svg>
                {selectedSummary && <div className="absolute right-5 top-5 z-20 w-56 rounded-md border border-[#b9dfc5] bg-white p-4 text-xs shadow-md"><div className="flex items-start justify-between"><div><p className="font-bold text-[#173b2a]">{selectedSummary.state}</p><p className="mt-1 text-slate-500">Filtered location summary</p></div><button onClick={() => setSelectedState(null)} className="text-slate-400" aria-label="Close location summary">×</button></div><dl className="mt-3 space-y-2 text-slate-600"><div className="flex justify-between"><dt>Programmes</dt><dd className="font-semibold text-[#173b2a]">{selectedSummary.programmes}</dd></div><div className="flex justify-between"><dt>Projects</dt><dd className="font-semibold text-[#173b2a]">{selectedSummary.projects}</dd></div><div><dt>Components</dt><dd className="mt-1 font-semibold text-[#173b2a]">{selectedSummary.components.join(", ")}</dd></div><div className="flex justify-between"><dt>Installed capacity</dt><dd className="font-semibold text-[#173b2a]">{selectedSummary.kw.toLocaleString()} kW</dd></div><div className="flex justify-between"><dt>Households</dt><dd className="font-semibold text-[#173b2a]">{selectedSummary.households.toLocaleString()}</dd></div></dl></div>}
                <div className="absolute bottom-5 left-5 z-20 flex flex-wrap gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px] font-medium text-slate-600 shadow-sm"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#08733f]" /> Verified</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#d89100]" /> Pending verification</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#075c33]" /> Selected project</span></div>
              </div>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-[#173b2a]">Verification progress</h2><p className="mt-1 text-xs text-slate-500">National reporting status</p></div><div className="space-y-5 p-5">{verificationStats.map(item => <div key={item.label}><div className="mb-2 flex justify-between text-xs"><span className="font-medium text-slate-700">{item.label}</span><span className="font-semibold text-[#173b2a]">{item.value} <span className="font-normal text-slate-400">projects</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{width:`${visibleProjects.length ? item.value / visibleProjects.length * 100 : 0}%`}} /></div></div>)}<div className="mt-7 border-t border-slate-100 pt-5"><div className="flex items-center gap-3 rounded-md bg-[#f4fcf6] p-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d9f0df] text-[#08733f]"><CheckCircle2 className="h-5 w-5" /></div><p className="text-xs leading-5 text-[#396148]"><strong>{visibleProjects.filter((project) => project.verified).length} projects</strong> are verified in the current view.</p></div></div></div></article>
          </section>

          <section className="mt-7 rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-[#173b2a]">Inspection &amp; Verification Pipeline</h2><p className="mt-1 text-xs text-slate-500">Workflow status for the current filtered view</p></div><span className="rounded-full bg-[#f0fbf3] px-2.5 py-1 text-xs font-semibold text-[#08733f]">{visibleProjects.length} reports</span></div><div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center md:gap-0">{[{ label: "Inspection Conducted", value: visibleProjects.length + 4 }, { label: "Submitted", value: visibleProjects.length }, { label: "Consultant Approved", value: visibleProjects.filter((project) => project.verified || project.status === "In progress").length }, { label: "Pending REA Review", value: visibleProjects.filter((project) => !project.verified).length }, { label: "REA Verified", value: visibleProjects.filter((project) => project.verified).length }].map((stage, index, stages) => <div key={stage.label} className="flex flex-1 items-center"><div className="min-w-0 flex-1 rounded-md bg-[#f7fcf8] px-3 py-3 text-center"><p className="text-xl font-bold text-[#153b28]">{stage.value}</p><p className="mt-1 text-[10px] font-semibold leading-4 text-slate-500">{stage.label}</p></div>{index < stages.length - 1 && <span className="hidden px-2 text-lg text-[#8ab69a] md:block">→</span>}</div>)}</div><div className="mt-4 flex flex-col items-start justify-between gap-3 rounded-md bg-[#fff9ea] px-4 py-3 sm:flex-row sm:items-center"><p className="text-xs text-[#745313]"><strong>{visibleProjects.filter((project) => !project.verified).length} reports</strong> are pending REA verification <span className="ml-1 text-[#9a7a3c]">· Current bottleneck · Average review time: 2.4 days</span></p><button onClick={() => setActiveNav("Inspections")} className="text-xs font-bold text-[#9a6500] hover:underline">Review queue →</button></div></section>

          <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-[#173b2a]">Projects across Nigeria</h2><p className="mt-1 text-xs text-slate-500">{filters.contractors === defaultFilters.contractors ? "Breakdown by program and contractor" : `${filters.contractors} projects across Nigeria`}</p></div><button className="text-xs font-semibold text-[#08733f] hover:underline">View all projects</button></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Project</th><th className="px-4 py-3 font-semibold">Programme</th><th className="px-4 py-3 font-semibold">Contractor</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Updated</th></tr></thead><tbody>{visibleProjects.map((project, index) => <tr key={project.name} className={index !== visibleProjects.length - 1 ? "border-b border-slate-100" : ""}><td className="px-5 py-4"><p className="text-sm font-semibold text-[#173b2a]">{project.name}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{project.state}</p></td><td className="px-4 py-4 text-xs font-medium text-slate-600">{project.programme}</td><td className="px-4 py-4 text-xs font-medium text-slate-600">{project.contractor}</td><td className="px-4 py-4"><StatusBadge tone={project.tone}>{project.status}</StatusBadge></td><td className="px-5 py-4 text-right text-xs text-slate-500">{index === 0 ? "Today, 10:24" : `${index + 1} days ago`}</td></tr>)}</tbody></table></div></section>
        </div>
      </main>
    </div>
  );
}
