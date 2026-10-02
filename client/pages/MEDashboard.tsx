import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { fetchReaMapProjects, reaRecordToDashboardProject } from "../lib/rea-project-map-data";
import { summarizePortfolio, type Project } from "../lib/dashboard-data";

type Inspection = {
  id: string;
  projectId: string;
  projectName: string;
  programme: string;
  component: string;
  contractor: string;
  state: string;
  lga: string;
  community: string;
  status: string;
  updatedAt?: string;
  submittedAt?: string | null;
  teamName?: string;
  form?: Record<string, string>;
};

type Tab = "Overview" | "Projects" | "Inspections" | "Verification" | "Findings" | "Analytics" | "Reports";

const navigation: Array<{ label: Tab; icon: typeof LayoutDashboard }> = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Projects", icon: FolderKanban },
  { label: "Inspections", icon: ClipboardCheck },
  { label: "Verification", icon: FileCheck2 },
  { label: "Findings", icon: AlertTriangle },
  { label: "Analytics", icon: BarChart3 },
  { label: "Reports", icon: FileText },
];

async function fetchInspectionPortfolio(token: string) {
  const response = await fetch("/api/field/rea-inspections", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load M&E inspection data.");
  return Array.isArray(payload.inspections) ? payload.inspections as Inspection[] : [];
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("verified") || normalized.includes("approved")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized.includes("submitted") || normalized.includes("review")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (normalized.includes("reinspection") || normalized.includes("risk")) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function MEDashboard() {
  const { session, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!session?.apiToken) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      fetchReaMapProjects(session.apiToken).then((records) => records.map(reaRecordToDashboardProject)),
      fetchInspectionPortfolio(session.apiToken),
    ]).then(([projectRecords, inspectionRecords]) => {
      if (cancelled) return;
      setProjects(projectRecords);
      setInspections(inspectionRecords);
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to load the M&E workspace.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [session?.apiToken]);

  const totals = useMemo(() => summarizePortfolio(projects), [projects]);
  const inspectionSummary = useMemo(() => {
    const submitted = inspections.filter((item) => item.status === "Submitted").length;
    const verified = inspections.filter((item) => item.status === "Verified" || item.status === "Approved").length;
    const inProgress = inspections.filter((item) => item.status === "In Progress").length;
    const flagged = inspections.filter((item) => /re-?inspection|risk|issue/i.test(item.status) || /critical|outstanding|failed/i.test(JSON.stringify(item.form || {}))).length;
    return { submitted, verified, inProgress, flagged };
  }, [inspections]);

  const visibleProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return projects;
    return projects.filter((project) =>
      [project.name, project.programme, project.component, project.contractor, project.state, project.lga || "", project.community || "", project.status]
        .join(" ").toLowerCase().includes(term),
    );
  }, [projects, query]);

  const visibleInspections = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return inspections;
    return inspections.filter((inspection) =>
      [inspection.projectName, inspection.programme, inspection.component, inspection.contractor, inspection.state, inspection.lga, inspection.community, inspection.status, inspection.teamName || ""]
        .join(" ").toLowerCase().includes(term),
    );
  }, [inspections, query]);

  const programmeRows = useMemo(() => [...new Set(projects.map((project) => project.programme))].map((programme) => {
    const matching = projects.filter((project) => project.programme === programme);
    const verified = matching.filter((project) => project.verified).length;
    return {
      programme,
      projects: matching.length,
      verified,
      pending: matching.length - verified,
      rate: matching.length ? Math.round((verified / matching.length) * 100) : 0,
    };
  }).sort((a, b) => b.projects - a.projects), [projects]);

  const findings = useMemo(() => inspections.filter((inspection) =>
    /re-?inspection|risk|issue/i.test(inspection.status) || /critical|outstanding|failed|defect|corrective/i.test(JSON.stringify(inspection.form || {})),
  ), [inspections]);

  const kpis = [
    { label: "Projects Monitored", value: totals.projects, detail: "National project portfolio", icon: FolderKanban },
    { label: "Inspections Completed", value: inspectionSummary.submitted + inspectionSummary.verified, detail: "Submitted or completed reviews", icon: ClipboardCheck },
    { label: "Verified Projects", value: totals.verified, detail: `${totals.verificationRate}% of monitored projects`, icon: ShieldCheck },
    { label: "Pending Review", value: Math.max(totals.pending, inspectionSummary.submitted), detail: "Requires monitoring attention", icon: Gauge },
    { label: "Projects at Risk", value: inspectionSummary.flagged, detail: "Findings or reinspection signals", icon: AlertTriangle },
  ];

  return (
    <main className="min-h-screen bg-[#f6f9f7] text-[#183126]">
      <div className="flex min-h-screen">
        <aside className="hidden w-[238px] shrink-0 border-r border-[#dce8df] bg-white lg:flex lg:flex-col">
          <div className="border-b border-[#e5eee8] px-5 py-5">
            <div className="flex items-center gap-3">
              <img src="/rea-brand-mark.svg" alt="" className="h-10 w-10 object-contain" />
              <div><p className="text-sm font-extrabold text-[#173b2a]">Veritas</p><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-slate-500">M&E Workspace</p></div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 p-3">
            {navigation.map(({ label, icon: Icon }) => (
              <button key={label} type="button" onClick={() => setActiveTab(label)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs font-bold transition ${activeTab === label ? "bg-[#eaf6ee] text-[#08733f]" : "text-slate-600 hover:bg-slate-50"}`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </nav>
          <div className="border-t border-[#e5eee8] p-4">
            <div className="mb-3 rounded-lg bg-[#f7faf8] p-3"><p className="text-xs font-bold text-[#173b2a]">{session?.name}</p><p className="mt-1 text-[10px] text-slate-500">Monitoring & Evaluation</p></div>
            <button onClick={logout} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4"/>Sign out</button>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-[#dfeae2] bg-white px-4 py-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
              <div><p className="text-[10px] font-extrabold uppercase tracking-[.13em] text-[#08733f]">Monitoring & Evaluation</p><h1 className="mt-1 text-xl font-extrabold tracking-tight text-[#173b2a]">{activeTab}</h1><p className="mt-1 text-xs text-slate-500">Monitor delivery, inspection evidence, verification progress and exceptions.</p></div>
              <div className="hidden rounded-lg border border-[#d8e8dd] bg-[#f7fbf8] px-3 py-2 text-right sm:block"><p className="text-[10px] font-bold text-[#08733f]">Read-only oversight</p><p className="text-[10px] text-slate-500">No user or system administration</p></div>
            </div>
          </header>

          <div className="mx-auto max-w-[1500px] p-4 sm:p-6 lg:p-8">
            {error && <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">{error}</div>}
            {loading && <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">Loading live M&E portfolio…</div>}

            {(activeTab === "Overview" || activeTab === "Projects" || activeTab === "Inspections" || activeTab === "Verification") && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                <Search className="h-4 w-4 text-slate-400"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search project, programme, state, contractor or status…" className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"/>
              </div>
            )}

            {activeTab === "Overview" && <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {kpis.map(({ label, value, detail, icon: Icon }) => <article key={label} className="rounded-xl border border-[#dce8df] bg-white p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="mt-2 text-2xl font-extrabold text-[#173b2a]">{value.toLocaleString()}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf7f0] text-[#08733f]"><Icon className="h-4 w-4"/></span></div><p className="mt-3 text-[10px] text-slate-500">{detail}</p></article>)}
              </div>

              <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
                <article className="rounded-xl border border-[#dce8df] bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-extrabold text-[#173b2a]">Programme Performance</h2><p className="mt-1 text-[10px] text-slate-500">Verification progress by programme</p></div><BarChart3 className="h-4 w-4 text-[#08733f]"/></div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead><tr className="border-b bg-[#fafcfb] text-[10px] uppercase tracking-wide text-slate-500"><th className="px-5 py-3">Programme</th><th className="px-5 py-3">Projects</th><th className="px-5 py-3">Verified</th><th className="px-5 py-3">Pending</th><th className="px-5 py-3">Rate</th></tr></thead><tbody>{programmeRows.map((row)=><tr key={row.programme} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3 text-xs font-bold text-[#173b2a]">{row.programme}</td><td className="px-5 py-3 text-xs text-slate-600">{row.projects}</td><td className="px-5 py-3 text-xs text-slate-600">{row.verified}</td><td className="px-5 py-3 text-xs text-slate-600">{row.pending}</td><td className="px-5 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{row.rate}%</span></td></tr>)}</tbody></table></div>
                </article>

                <article className="rounded-xl border border-[#dce8df] bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between"><div><h2 className="text-sm font-extrabold text-[#173b2a]">Monitoring Attention</h2><p className="mt-1 text-[10px] text-slate-500">Items requiring review</p></div><Activity className="h-4 w-4 text-[#08733f]"/></div>
                  <div className="mt-4 space-y-3">
                    {[["Pending verification", totals.pending],["Submitted inspections", inspectionSummary.submitted],["In progress inspections", inspectionSummary.inProgress],["Flagged / reinspection", inspectionSummary.flagged]].map(([label,value])=><div key={String(label)} className="flex items-center justify-between rounded-lg border border-slate-100 bg-[#fafcfb] px-3 py-3"><span className="text-xs font-semibold text-slate-600">{label}</span><span className="text-sm font-extrabold text-[#173b2a]">{Number(value).toLocaleString()}</span></div>)}
                  </div>
                </article>
              </div>
            </>}

            {activeTab === "Projects" && <DataTableProjects projects={visibleProjects}/>}
            {activeTab === "Inspections" && <DataTableInspections inspections={visibleInspections}/>}
            {activeTab === "Verification" && <DataTableProjects projects={visibleProjects.filter((project)=>!project.verified)} verificationMode/>}

            {activeTab === "Findings" && <article className="rounded-xl border border-[#dce8df] bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-extrabold text-[#173b2a]">Findings & Corrective Attention</h2><p className="mt-1 text-[10px] text-slate-500">Read-only register derived from inspection records with outstanding or risk signals.</p></div>{findings.length ? <div className="divide-y divide-slate-100">{findings.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-bold text-[#173b2a]">{item.projectName}</p><p className="mt-1 text-[10px] text-slate-500">{item.state} · {item.lga} · {item.teamName || "Inspection team"}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusTone(item.status)}`}>{item.status}</span></div>)}</div> : <div className="p-8 text-center text-xs text-slate-500">No risk or corrective-action signals are currently recorded.</div>}</article>}

            {activeTab === "Analytics" && <div className="grid gap-4 lg:grid-cols-3">
              {[["Verification rate", `${totals.verificationRate}%`, "Share of projects verified"],["Inspection completion", inspections.length ? `${Math.round(((inspectionSummary.submitted + inspectionSummary.verified) / inspections.length) * 100)}%` : "0%", "Submitted or completed inspections"],["At-risk signals", inspectionSummary.flagged.toLocaleString(), "Projects/inspections requiring attention"]].map(([label,value,detail])=><article key={label} className="rounded-xl border border-[#dce8df] bg-white p-5 shadow-sm"><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="mt-2 text-3xl font-extrabold text-[#173b2a]">{value}</p><p className="mt-2 text-[10px] text-slate-500">{detail}</p></article>)}
            </div>}

            {activeTab === "Reports" && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {["Monthly M&E Report","Programme Performance Report","State Performance Report","Projects at Risk Report","Outstanding Findings Report","Verification Progress Report"].map((report)=><article key={report} className="rounded-xl border border-[#dce8df] bg-white p-5 shadow-sm"><FileText className="h-5 w-5 text-[#08733f]"/><h3 className="mt-3 text-sm font-extrabold text-[#173b2a]">{report}</h3><p className="mt-2 text-xs leading-5 text-slate-500">Report template available to M&E staff. Export actions can be connected to the existing Veritas reporting service.</p></article>)}
            </div>}
          </div>
        </section>
      </div>
    </main>
  );
}

function DataTableProjects({ projects, verificationMode = false }: { projects: Project[]; verificationMode?: boolean }) {
  return <article className="rounded-xl border border-[#dce8df] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-extrabold text-[#173b2a]">{verificationMode ? "Pending Verification" : "Projects Monitored"}</h2><p className="mt-1 text-[10px] text-slate-500">{projects.length.toLocaleString()} records in current view</p></div><MapPinned className="h-4 w-4 text-[#08733f]"/></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b bg-[#fafcfb] text-[10px] uppercase tracking-wide text-slate-500"><th className="px-5 py-3">Project</th><th className="px-5 py-3">Programme</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Contractor</th><th className="px-5 py-3">Component</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{projects.slice(0,100).map((project)=><tr key={project.id || project.name} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3 text-xs font-bold text-[#173b2a]">{project.name}</td><td className="px-5 py-3 text-xs text-slate-600">{project.programme}</td><td className="px-5 py-3 text-xs text-slate-600">{project.state}{project.lga ? ` · ${project.lga}` : ""}</td><td className="px-5 py-3 text-xs text-slate-600">{project.contractor}</td><td className="px-5 py-3 text-xs text-slate-600">{project.component}</td><td className="px-5 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${project.verified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{project.verified ? "Verified" : project.status || "Pending"}</span></td></tr>)}</tbody></table></div></article>
}

function DataTableInspections({ inspections }: { inspections: Inspection[] }) {
  return <article className="rounded-xl border border-[#dce8df] bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-extrabold text-[#173b2a]">Inspection Monitoring</h2><p className="mt-1 text-[10px] text-slate-500">{inspections.length.toLocaleString()} inspection records</p></div><CheckCircle2 className="h-4 w-4 text-[#08733f]"/></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b bg-[#fafcfb] text-[10px] uppercase tracking-wide text-slate-500"><th className="px-5 py-3">Project</th><th className="px-5 py-3">Programme</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Team</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Updated</th></tr></thead><tbody>{inspections.slice(0,100).map((item)=><tr key={item.id} className="border-b border-slate-100 last:border-0"><td className="px-5 py-3 text-xs font-bold text-[#173b2a]">{item.projectName}</td><td className="px-5 py-3 text-xs text-slate-600">{item.programme}</td><td className="px-5 py-3 text-xs text-slate-600">{item.state} · {item.lga}</td><td className="px-5 py-3 text-xs text-slate-600">{item.teamName || "—"}</td><td className="px-5 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusTone(item.status)}`}>{item.status}</span></td><td className="px-5 py-3 text-xs text-slate-500">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div></article>
}
