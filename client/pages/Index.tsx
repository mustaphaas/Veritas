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

const filterOptions = {
  programs: ["All programmes", "NEP", "DARES", "AMP"],
  components: ["All components", "Solar mini-grid", "Grid extension", "Standalone solar"],
  contracts: ["All contracts", "EPC", "Framework", "Community-led"],
  months: ["June 2024", "May 2024", "April 2024", "March 2024"],
};

type FilterKey = keyof typeof filterOptions;
type Filters = Record<FilterKey, string>;

const defaultFilters: Filters = {
  programs: filterOptions.programs[0],
  components: filterOptions.components[0],
  contracts: filterOptions.contracts[0],
  months: filterOptions.months[0],
};

function getKpis(filters: Filters) {
  const selectedCount = Object.values(filters).filter((value, index) => value !== Object.values(defaultFilters)[index]).length;
  const monthFactor = filters.months === "June 2024" ? 1 : filters.months === "May 2024" ? 0.91 : filters.months === "April 2024" ? 0.84 : 0.76;
  const factor = monthFactor * (selectedCount === 0 ? 1 : Math.max(0.38, 1 - selectedCount * 0.13));
  const format = (value: number) => Math.round(value * factor).toLocaleString();

  return [
    { label: "Total Programmes", value: selectedCount ? "1" : "3", detail: selectedCount ? "Filtered programme view" : "NEP · AMP · DARES", icon: Building2, highlighted: false },
    { label: "Installed capacity", value: `${format(18420)} kW`, detail: "Across monitored projects", icon: Zap, highlighted: true },
    { label: "Households reached", value: format(24860), detail: "Connected households", icon: Home, highlighted: false },
    { label: "Verified inspections", value: format(84), detail: `${Math.round(66.7 * factor)}% of submitted inspections`, icon: CheckCircle2, highlighted: false },
    { label: "Pending verification", value: format(18), detail: "Requires officer action", icon: ClipboardCheck, highlighted: false, warning: true },
  ];
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label className="flex min-w-[150px] flex-1 flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full appearance-none rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-[#173b2a] outline-none transition-colors focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10">{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

const projects = [
  { name: "Kano Solar Mini-grid Programme", location: "Kano Municipal, Kano", programme: "NEP", status: "Verified", tone: "verified" },
  { name: "Gidan Dadi Electrification Project", location: "Gusau, Zamfara", programme: "DARES", status: "Pending", tone: "pending" },
  { name: "Akpabuyo Grid Extension", location: "Akpabuyo, Cross River", programme: "AMP", status: "In progress", tone: "progress" },
  { name: "Wuse Community Solar Hub", location: "Abuja Municipal, FCT", programme: "NEP", status: "Submitted", tone: "submitted" },
];

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
  const metrics = getKpis(filters);
  const updateFilter = (key: FilterKey, value: string) => setFilters((current) => ({ ...current, [key]: value }));

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

          <section className="mt-7 rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-4 sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-[#173b2a]">Global filters</h2><p className="mt-1 text-xs text-slate-500">Filter programme performance across the dashboard</p></div><button onClick={() => setFilters(defaultFilters)} className="text-xs font-semibold text-[#08733f] hover:underline">Reset filters</button></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><FilterSelect label="Programmes" value={filters.programs} options={filterOptions.programs} onChange={(value) => updateFilter("programs", value)} /><FilterSelect label="Components" value={filters.components} options={filterOptions.components} onChange={(value) => updateFilter("components", value)} /><FilterSelect label="Contract" value={filters.contracts} options={filterOptions.contracts} onChange={(value) => updateFilter("contracts", value)} /><FilterSelect label="Month" value={filters.months} options={filterOptions.months} onChange={(value) => updateFilter("months", value)} /></div></section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map(({ label, value, detail, icon: Icon, highlighted, warning }) => <article key={label} className={`rounded-lg border p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${highlighted ? "border-[#cdebd6] bg-[#f4fcf6]" : "border-slate-200 bg-white"}`}><div className="flex items-start justify-between"><div className={`flex h-9 w-9 items-center justify-center rounded-md ${warning ? "bg-[#fff5dc] text-[#ad7200]" : "bg-[#eaf8ef] text-[#08733f]"}`}><Icon className="h-5 w-5" /></div><MoreHorizontal className="h-5 w-5 text-slate-400" /></div><p className="mt-5 text-sm font-medium text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-[#153b28]">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></article>)}
          </section>

          <section className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
            <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-[#173b2a]">National project coverage</h2><p className="mt-1 text-xs text-slate-500">Active projects by state and verification status</p></div><div className="flex gap-2"><button className="rounded-md border border-[#b9dfc5] bg-[#effaf2] px-3 py-1.5 text-xs font-semibold text-[#08733f]">All Programmes</button><button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600">2024</button></div></div>
              <div className="relative h-[345px] overflow-hidden bg-[#f8fbf8] p-6">
                <div className="absolute inset-0 opacity-[0.32]" style={{ backgroundImage: "linear-gradient(#d9eadc 1px, transparent 1px), linear-gradient(90deg, #d9eadc 1px, transparent 1px)", backgroundSize: "36px 36px" }} />
                <svg className="relative z-10 h-full w-full" viewBox="0 0 650 300" fill="none" aria-label="Stylized Nigeria project map">
                  <path d="M154 58 L224 45 L271 65 L337 48 L396 79 L476 87 L505 123 L485 163 L506 208 L454 248 L385 240 L333 269 L274 247 L206 260 L159 218 L112 178 L129 128 Z" fill="#e4f3e7" stroke="#aacfb1" strokeWidth="2" />
                  <path d="M189 74 L201 236 M249 58 L265 248 M322 60 L326 258 M390 77 L381 243 M457 101 L438 236 M132 128 L489 132 M130 177 L492 178 M163 219 L461 219" stroke="#bbd9c0" strokeWidth="1" />
                  {[{x:218,y:107,c:'#08733f'},{x:293,y:129,c:'#08733f'},{x:358,y:113,c:'#d89100'},{x:421,y:151,c:'#08733f'},{x:250,y:192,c:'#075c33'},{x:376,y:205,c:'#d89100'},{x:325,y:237,c:'#08733f'}].map((point, i) => <g key={i}><circle cx={point.x} cy={point.y} r="11" fill={point.c} opacity=".14"/><circle cx={point.x} cy={point.y} r="5" fill={point.c} stroke="white" strokeWidth="2"/></g>)}
                  <text x="276" y="156" fill="#557060" fontSize="10" fontWeight="600">NIGERIA</text>
                </svg>
                <div className="absolute bottom-5 left-5 z-20 flex flex-wrap gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-[10px] font-medium text-slate-600 shadow-sm"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#08733f]" /> Verified</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#d89100]" /> Pending verification</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#075c33]" /> Selected project</span></div>
              </div>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="border-b border-slate-200 px-5 py-4"><h2 className="font-bold text-[#173b2a]">Verification progress</h2><p className="mt-1 text-xs text-slate-500">National reporting status</p></div><div className="space-y-5 p-5">{[{label:'Verified',value:84,max:126,color:'bg-[#08733f]'},{label:'In progress',value:24,max:126,color:'bg-[#5d8fc6]'},{label:'Pending review',value:18,max:126,color:'bg-[#d89100]'}].map(item => <div key={item.label}><div className="mb-2 flex justify-between text-xs"><span className="font-medium text-slate-700">{item.label}</span><span className="font-semibold text-[#173b2a]">{item.value} <span className="font-normal text-slate-400">projects</span></span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${item.color}`} style={{width:`${item.value / item.max * 100}%`}} /></div></div>)}<div className="mt-7 border-t border-slate-100 pt-5"><div className="flex items-center gap-3 rounded-md bg-[#f4fcf6] p-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d9f0df] text-[#08733f]"><CheckCircle2 className="h-5 w-5" /></div><p className="text-xs leading-5 text-[#396148]"><strong>12 projects</strong> were verified by field officers this week.</p></div></div></div></article>
          </section>

          <section className="mt-7 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><h2 className="font-bold text-[#173b2a]">Recent project activity</h2><p className="mt-1 text-xs text-slate-500">Latest submissions and field verification updates</p></div><button className="text-xs font-semibold text-[#08733f] hover:underline">View all projects</button></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Project</th><th className="px-4 py-3 font-semibold">Programme</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Updated</th></tr></thead><tbody>{projects.map((project, index) => <tr key={project.name} className={index !== projects.length - 1 ? "border-b border-slate-100" : ""}><td className="px-5 py-4"><p className="text-sm font-semibold text-[#173b2a]">{project.name}</p><p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{project.location}</p></td><td className="px-4 py-4 text-xs font-medium text-slate-600">{project.programme}</td><td className="px-4 py-4"><StatusBadge tone={project.tone}>{project.status}</StatusBadge></td><td className="px-5 py-4 text-right text-xs text-slate-500">{index === 0 ? "Today, 10:24" : `${index + 1} days ago`}</td></tr>)}</tbody></table></div></section>
        </div>
      </main>
    </div>
  );
}
