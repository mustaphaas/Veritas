import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  LocateFixed,
  LogOut,
  MapPinned,
  Menu,
  Search,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  UsersRound,
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
  sectionAssignments?: Record<string, string>;
  version?: number;
};

type MeMember = { id: string; name: string; email: string };
type MeTeam = { id: string; name: string; teamLeadId: string; teamLeadName: string; status: string; members: MeMember[] };
type MeStaff = { id: string; name: string; email: string; role: string };
type MePayload = { currentUserId: string; staffRole?: string; staff?: MeStaff[]; teams?: MeTeam[]; projects?: Array<{id:string;name:string;programme:string;component:string;contractor:string;state:string;lga:string;community:string}>; inspections?: Inspection[] };

type Tab = "Overview" | "Teams" | "Projects" | "Inspections" | "Verification" | "Findings" | "Analytics" | "Reports";

const navigation: Array<{ label: Tab; icon: typeof LayoutDashboard; adminOnly?: boolean }> = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Teams", icon: UsersRound, adminOnly: true },
  { label: "Projects", icon: FolderKanban },
  { label: "Inspections", icon: ClipboardCheck },
  { label: "Verification", icon: FileCheck2 },
  { label: "Findings", icon: AlertTriangle },
  { label: "Analytics", icon: BarChart3 },
  { label: "Reports", icon: FileText },
];

const meInspectionSections = [
  { id: "project", title: "Project Details", description: "Confirm the project and implementation details.", fields: ["Project reference confirmed", "Programme and component", "Contractor details"] },
  { id: "site", title: "Site Assessment", description: "Record physical site observations and installation condition.", fields: ["Site condition", "GPS/location notes", "Access and surroundings"] },
  { id: "equipment", title: "Equipment & Infrastructure", description: "Capture installed equipment and technical observations.", fields: ["Equipment installed", "Capacity / specification", "Condition and operation"] },
  { id: "beneficiaries", title: "Beneficiary Verification", description: "Record beneficiary and service information.", fields: ["Beneficiary count", "Community served", "Service availability"] },
  { id: "evidence", title: "Photos & Evidence", description: "Record evidence references and inspection notes.", fields: ["Photo references", "Supporting documents", "Evidence notes"] },
  { id: "hse", title: "HSE / Environment", description: "Capture health, safety and environmental observations.", fields: ["HSE observations", "Environmental observations", "Corrective actions"] },
  { id: "final", title: "Final Observations", description: "Complete the final inspection assessment.", fields: ["Overall observation", "Outstanding issues", "Recommendation"] },
];

async function fetchMeWorkspace(token: string): Promise<MePayload> {
  const response = await fetch("/api/field/rea-inspections", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load M&E inspection data.");
  return payload as MePayload;
}

async function meMutation(token: string, path: string, body?: unknown, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to update the M&E workspace.");
  return payload;
}

function statusTone(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("verified") || normalized.includes("approved")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (normalized.includes("submitted") || normalized.includes("review")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (normalized.includes("reinspection") || normalized.includes("risk")) return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
}

export default function MEDashboard() {
  const navigate = useNavigate();
  const { session, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [projects, setProjects] = useState<Project[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [teams, setTeams] = useState<MeTeam[]>([]);
  const [staff, setStaff] = useState<MeStaff[]>([]);
  const [workspaceRole, setWorkspaceRole] = useState(session?.roleLabel || "");
  const [currentUserId, setCurrentUserId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamLeadId, setTeamLeadId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [programmeFilter, setProgrammeFilter] = useState("All programmes");
  const [stateFilter, setStateFilter] = useState("All states");

  const loadWorkspace = async () => {
    if (!session?.apiToken) return;
    setLoading(true);
    setError("");
    try {
      const [projectRecords, workspace] = await Promise.all([
        fetchReaMapProjects(session.apiToken).then((records) => records.map(reaRecordToDashboardProject)),
        fetchMeWorkspace(session.apiToken),
      ]);
      setProjects(projectRecords);
      setInspections(Array.isArray(workspace.inspections) ? workspace.inspections : []);
      setTeams(Array.isArray(workspace.teams) ? workspace.teams : []);
      setStaff(Array.isArray(workspace.staff) ? workspace.staff : []);
      setWorkspaceRole(workspace.staffRole || session.roleLabel || "");
      setCurrentUserId(workspace.currentUserId || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to load the M&E workspace.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [session?.apiToken]);

  const isMeAdmin = workspaceRole === "M&E Admin";
  const visibleNavigation = navigation.filter((item) => !item.adminOnly || isMeAdmin);

  const programmeOptions = useMemo(() => ["All programmes", ...[...new Set(projects.map((project) => project.programme).filter(Boolean))].sort()], [projects]);
  const stateOptions = useMemo(() => ["All states", ...[...new Set(projects.map((project) => project.state).filter(Boolean))].sort()], [projects]);

  const filteredProjects = useMemo(() => projects.filter((project) => {
    if (programmeFilter !== "All programmes" && project.programme !== programmeFilter) return false;
    if (stateFilter !== "All states" && project.state !== stateFilter) return false;
    return true;
  }), [projects, programmeFilter, stateFilter]);

  const filteredInspections = useMemo(() => inspections.filter((inspection) => {
    if (programmeFilter !== "All programmes" && inspection.programme !== programmeFilter) return false;
    if (stateFilter !== "All states" && inspection.state !== stateFilter) return false;
    return true;
  }), [inspections, programmeFilter, stateFilter]);

  const totals = useMemo(() => summarizePortfolio(filteredProjects), [filteredProjects]);
  const inspectionSummary = useMemo(() => {
    const submitted = filteredInspections.filter((item) => item.status === "Submitted").length;
    const verified = filteredInspections.filter((item) => item.status === "Verified" || item.status === "Approved").length;
    const inProgress = filteredInspections.filter((item) => item.status === "In Progress").length;
    const reinspection = filteredInspections.filter((item) => /re-?inspection/i.test(item.status)).length;
    return { submitted, verified, inProgress, reinspection };
  }, [filteredInspections]);

  const visibleProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return filteredProjects;
    return filteredProjects.filter((project) =>
      [project.name, project.programme, project.component, project.contractor, project.state, project.lga || "", project.community || "", project.status]
        .join(" ").toLowerCase().includes(term),
    );
  }, [filteredProjects, query]);

  const visibleInspections = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return filteredInspections;
    return filteredInspections.filter((inspection) =>
      [inspection.projectName, inspection.programme, inspection.component, inspection.contractor, inspection.state, inspection.lga, inspection.community, inspection.status, inspection.teamName || ""]
        .join(" ").toLowerCase().includes(term),
    );
  }, [filteredInspections, query]);

  const programmeRows = useMemo(() => [...new Set(filteredProjects.map((project) => project.programme))].map((programme) => {
    const matching = filteredProjects.filter((project) => project.programme === programme);
    const verified = matching.filter((project) => project.verified).length;
    return {
      programme,
      projects: matching.length,
      verified,
      pending: matching.length - verified,
      rate: matching.length ? Math.round((verified / matching.length) * 100) : 0,
    };
  }).sort((a, b) => b.projects - a.projects), [filteredProjects]);

  const findings = useMemo(() => filteredInspections.filter((inspection) =>
    /re-?inspection|risk|issue/i.test(inspection.status) || /critical|outstanding|failed|defect|corrective/i.test(JSON.stringify(inspection.form || {})),
  ), [filteredInspections]);

  const kpis = [
    { label: "Projects Monitored", value: totals.projects, detail: "Across filtered portfolio", icon: FolderKanban, card: "border-sky-200 bg-sky-50", iconClass: "bg-sky-600 text-white", valueClass: "text-sky-800" },
    { label: "Inspections Completed", value: inspectionSummary.submitted + inspectionSummary.verified, detail: "Submitted or completed reviews", icon: ClipboardCheck, card: "border-violet-200 bg-violet-50", iconClass: "bg-violet-600 text-white", valueClass: "text-violet-800" },
    { label: "Verified Projects", value: totals.verified, detail: `${totals.verificationRate}% of monitored projects`, icon: ShieldCheck, card: "border-emerald-200 bg-emerald-50", iconClass: "bg-emerald-700 text-white", valueClass: "text-emerald-800" },
    { label: "Pending Review", value: Math.max(totals.pending, inspectionSummary.submitted), detail: "Requires monitoring attention", icon: Gauge, card: "border-orange-200 bg-orange-50", iconClass: "bg-orange-600 text-white", valueClass: "text-orange-800" },
    { label: "Re-Inspection", value: inspectionSummary.reinspection, detail: "Projects requiring another inspection", icon: AlertTriangle, card: "border-rose-200 bg-rose-50", iconClass: "bg-rose-600 text-white", valueClass: "text-rose-800" },
  ];

  const createTeam = async () => {
    if (!session?.apiToken || !teamName.trim() || !teamLeadId) return;
    setAdminSaving(true); setAdminMessage(""); setError("");
    try {
      await meMutation(session.apiToken, "/api/field/rea-inspections/teams", { name: teamName.trim(), teamLeadId, memberIds });
      setTeamName(""); setTeamLeadId(""); setMemberIds([]); setAdminMessage("M&E team created.");
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create M&E team.");
    } finally { setAdminSaving(false); }
  };

  const assignProject = async () => {
    if (!session?.apiToken || !selectedTeamId || !selectedProjectId) return;
    setAdminSaving(true); setAdminMessage(""); setError("");
    try {
      await meMutation(session.apiToken, "/api/field/rea-inspections/assign", { teamId: selectedTeamId, projectId: selectedProjectId, dueDate: dueDate || null });
      setSelectedProjectId(""); setDueDate(""); setAdminMessage("Project assigned to M&E team.");
      await loadWorkspace();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to assign project.");
    } finally { setAdminSaving(false); }
  };

  const saveAssignedSectionField = async (inspectionId: string, field: string, value: string) => {
    if (!session?.apiToken) return;
    setInspections((current) => current.map((item) => item.id === inspectionId
      ? { ...item, form: { ...(item.form || {}), [field]: value }, status: "In Progress" }
      : item
    ));
    try {
      await meMutation(session.apiToken, `/api/field/rea-inspections/${inspectionId}`, { formPatch: { [field]: value } }, "PATCH");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save assigned inspection section.");
      await loadWorkspace();
    }
  };

  const resetFilters = () => {
    setQuery("");
    setProgrammeFilter("All programmes");
    setStateFilter("All states");
  };

  return (
    <div className="veritas-government-app min-h-screen text-slate-900">
      <main className="veritas-rea-main">
        <header className="veritas-government-topbar sticky top-0 z-20 flex h-[94px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Open navigation"><Menu className="h-5 w-5" /></button>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#142a1f] sm:text-[22px]">M&E Dashboard</h1>
              <p className="mt-1 hidden text-xs text-slate-500 sm:block">Monitor assigned M&E team portfolios, inspections, verification and re-inspection.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden items-center gap-2 text-xs font-semibold text-[#08733f] md:flex"><i className="h-2 w-2 rounded-full bg-[#08733f]" />Live data</span>
            <span className="hidden border-l border-slate-200 pl-4 text-xs text-slate-500 xl:block">Monitoring & Evaluation</span>
            <button className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" /><span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[#df7d00] px-1 text-[8px] font-bold text-white">{inspectionSummary.reinspection}</span></button>
            <div className="hidden items-center gap-2 sm:flex"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500"><UsersRound className="h-5 w-5" /></div><span className="hidden text-xs font-semibold text-[#142a1f] xl:inline">{session?.name ?? "M&E Officer"}</span></div>
            <button type="button" onClick={() => { logout(); navigate("/login", { replace: true }); }} className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-600 hover:border-[#e2b5b5] hover:bg-red-50 hover:text-red-700"><LogOut className="h-4 w-4" /><span className="hidden xl:inline">Logout</span></button>
          </div>
        </header>

        <nav className="veritas-rea-side-rail border-b border-slate-200 bg-white" aria-label="M&E dashboard navigation">
          <div className="veritas-rea-side-rail-inner mx-auto flex max-w-[1580px] items-center gap-1 overflow-x-auto px-4 sm:px-7 lg:px-7">
            {visibleNavigation.map(({ label, icon: Icon }) => {
              const active = activeTab === label;
              return <button key={label} type="button" onClick={() => setActiveTab(label)} aria-current={active ? "page" : undefined} aria-label={label} className={`group flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-xs font-bold transition-all duration-300 ease-out ${active ? "border-[#08733f] text-[#08733f]" : "border-transparent text-slate-500 hover:border-[#b8dfc5] hover:text-[#173b2a]"}`}>
                <Icon className="h-4 w-4" /><span className="veritas-rea-nav-label">{label}</span>
              </button>;
            })}
          </div>
        </nav>

        <div className="veritas-dashboard-content mx-auto max-w-[1580px] px-4 py-0 sm:px-7 lg:px-7">
          {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">{error}</div>}
          {loading && <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">Loading live M&E portfolio…</div>}
          {adminMessage && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">{adminMessage}</div>}

          <section className="veritas-overview-filter-bar mt-0 rounded-xl border border-[#d6e9da] bg-[#f7fcf8] p-4">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(180px,.7fr)_minmax(180px,.7fr)_140px] md:items-end">
              <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Search</span><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Project, contractor, state or status" className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-[#173b2a] outline-none transition-colors focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10"/></div></label>
              <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Programme</span><select value={programmeFilter} onChange={(event)=>setProgrammeFilter(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-[#173b2a] outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10">{programmeOptions.map((option)=><option key={option}>{option}</option>)}</select></label>
              <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">State</span><select value={stateFilter} onChange={(event)=>setStateFilter(event.target.value)} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-[#173b2a] outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10">{stateOptions.map((option)=><option key={option}>{option}</option>)}</select></label>
              <button type="button" onClick={resetFilters} className="flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[#76bd91] bg-white px-4 text-xs font-bold text-[#08733f] transition-all hover:border-[#08733f] hover:bg-[#edf9f0]"><LocateFixed className="h-4 w-4"/>Reset filters</button>
            </div>
          </section>

          {activeTab === "Overview" && <>
            <div className="mt-3 flex items-center justify-between rounded-lg border border-[#d6e9da] bg-white px-4 py-2.5 text-xs"><span className="font-semibold text-[#173b2a]">{isMeAdmin ? "M&E Admin national management view" : "Your portfolio is limited to projects assigned to your M&E teams."}</span><span className="text-slate-500">{teams.length} team{teams.length === 1 ? "" : "s"} · {projects.length} project{projects.length === 1 ? "" : "s"}</span></div>
            <section className="veritas-overview-kpis mt-3 flex gap-3 overflow-x-auto pb-1">
              {kpis.map(({ label, value, detail, icon: Icon, card, iconClass, valueClass }) => <article key={label} className={`veritas-overview-kpi-card min-h-[108px] min-w-[210px] flex-1 rounded-xl border p-3.5 text-left shadow-sm ${card}`}><div className="flex h-full items-start gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${iconClass}`}><Icon className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700">{label}</p><p className={`mt-1.5 text-[22px] font-bold leading-none tracking-tight ${valueClass}`}>{value.toLocaleString()}</p><p className="mt-2 text-[10px] leading-4 text-slate-600">{detail}</p></div></div></article>)}
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
              <section className="veritas-overview-panel overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#e3ece6] bg-white px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cce5d4] bg-[#eef8f1] text-[#08733f]"><BarChart3 className="h-4 w-4"/></span><div><h2 className="text-base font-bold tracking-[-0.01em] text-[#173b2a]">Programme Performance</h2><p className="mt-1 text-xs text-slate-500">Verification progress across the filtered M&E portfolio</p></div></div></div>
                <div className="overflow-x-auto"><table className="veritas-data-table w-full min-w-[600px] text-left"><thead><tr><th className="px-5 py-3">Programme</th><th className="px-5 py-3">Projects</th><th className="px-5 py-3">Verified</th><th className="px-5 py-3">Pending</th><th className="px-5 py-3">Rate</th></tr></thead><tbody>{programmeRows.map((row)=><tr key={row.programme}><td className="px-5 py-3 text-xs font-bold text-[#173b2a]">{row.programme}</td><td className="px-5 py-3 text-xs">{row.projects}</td><td className="px-5 py-3 text-xs">{row.verified}</td><td className="px-5 py-3 text-xs">{row.pending}</td><td className="px-5 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{row.rate}%</span></td></tr>)}</tbody></table></div>
              </section>

              <section className="veritas-overview-panel overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#e3ece6] bg-white px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#f1d7b2] bg-[#fff8ed] text-[#c87812]"><Activity className="h-4 w-4"/></span><div><h2 className="text-base font-bold tracking-[-0.01em] text-[#173b2a]">Monitoring Attention</h2><p className="mt-1 text-xs text-slate-500">Items requiring M&E review</p></div></div></div>
                <div className="space-y-2 p-4">
                  {[["Pending verification", totals.pending],["Submitted inspections", inspectionSummary.submitted],["In progress inspections", inspectionSummary.inProgress],["Re-Inspection", inspectionSummary.reinspection]].map(([label,value])=><div key={String(label)} className="flex items-center justify-between rounded-lg border border-slate-100 bg-[#fafcfb] px-3 py-3"><span className="text-xs font-semibold text-slate-600">{label}</span><span className="text-sm font-bold text-[#173b2a]">{Number(value).toLocaleString()}</span></div>)}
                </div>
              </section>
            </div>
          </>}

          <div className={activeTab === "Overview" ? "pb-8" : "py-4"}>
            {activeTab === "Teams" && isMeAdmin && <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
              <section className="veritas-data-panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cce5d4] bg-[#eef8f1] text-[#08733f]"><UserPlus className="h-4 w-4"/></span><div><h2 className="text-base font-bold text-[#173b2a]">Create M&E Team</h2><p className="mt-1 text-xs text-slate-500">Choose a team lead and the officers who will share the assigned project portfolio.</p></div></div>
                <div className="mt-5 grid gap-3">
                  <input value={teamName} onChange={(e)=>setTeamName(e.target.value)} placeholder="Team name" className="h-10 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#08733f]"/>
                  <select value={teamLeadId} onChange={(e)=>{setTeamLeadId(e.target.value);setMemberIds((current)=>current.includes(e.target.value)?current:[...current,e.target.value].filter(Boolean));}} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"><option value="">Select team lead</option>{staff.map((person)=><option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select>
                  <div className="rounded-xl border border-slate-200 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Team members</p><div className="grid gap-2 sm:grid-cols-2">{staff.map((person)=><label key={person.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2 text-xs text-slate-600"><input type="checkbox" checked={memberIds.includes(person.id)} onChange={()=>setMemberIds((current)=>current.includes(person.id)?current.filter((id)=>id!==person.id):[...current,person.id])}/><span>{person.name}<small className="ml-1 text-slate-400">({person.role})</small></span></label>)}</div></div>
                  <button type="button" disabled={adminSaving || !teamName.trim() || !teamLeadId} onClick={()=>void createTeam()} className="h-10 rounded-lg bg-[#08733f] px-4 text-xs font-bold text-white disabled:opacity-50">Create Team</button>
                </div>
              </section>

              <section className="veritas-data-panel rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cce5d4] bg-[#eef8f1] text-[#08733f]"><FolderKanban className="h-4 w-4"/></span><div><h2 className="text-base font-bold text-[#173b2a]">Assign Project to Team</h2><p className="mt-1 text-xs text-slate-500">Officers will only see projects assigned to teams they belong to.</p></div></div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <select value={selectedTeamId} onChange={(e)=>setSelectedTeamId(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"><option value="">Select M&E team</option>{teams.filter((team)=>team.status==="Active").map((team)=><option key={team.id} value={team.id}>{team.name}</option>)}</select>
                  <select value={selectedProjectId} onChange={(e)=>setSelectedProjectId(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"><option value="">Select project</option>{projects.map((project)=><option key={project.id} value={project.id}>{project.name} · {project.state}</option>)}</select>
                  <input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#08733f]"/>
                  <button type="button" disabled={adminSaving || !selectedTeamId || !selectedProjectId} onClick={()=>void assignProject()} className="h-10 rounded-lg bg-[#08733f] px-4 text-xs font-bold text-white disabled:opacity-50">Assign Project</button>
                </div>
                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="veritas-data-table w-full min-w-[620px] text-left"><thead><tr><th className="px-4 py-3">Team</th><th className="px-4 py-3">Lead</th><th className="px-4 py-3">Members</th><th className="px-4 py-3">Assigned projects</th></tr></thead><tbody>{teams.map((team)=><tr key={team.id}><td className="px-4 py-3 text-xs font-bold text-[#173b2a]">{team.name}</td><td className="px-4 py-3 text-xs">{team.teamLeadName}</td><td className="px-4 py-3 text-xs">{team.members.length}</td><td className="px-4 py-3 text-xs">{inspections.filter((inspection)=>inspection.teamName===team.name).length}</td></tr>)}</tbody></table></div>
              </section>
            </div>}
            {activeTab === "Projects" && <DataTableProjects projects={visibleProjects}/>}
            {activeTab === "Inspections" && <DataTableInspections inspections={visibleInspections} currentUserId={currentUserId} isMeAdmin={isMeAdmin} onSaveField={saveAssignedSectionField}/>}
            {activeTab === "Verification" && <DataTableProjects projects={visibleProjects.filter((project)=>!project.verified)} verificationMode/>}

            {activeTab === "Findings" && <section className="veritas-data-panel overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-[#e3ece6] px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600"><AlertTriangle className="h-4 w-4"/></span><div><h2 className="text-base font-bold text-[#173b2a]">Findings & Corrective Attention</h2><p className="mt-1 text-xs text-slate-500">Read-only register of inspection records with outstanding or risk signals.</p></div></div></div>{findings.length ? <div className="divide-y divide-slate-100">{findings.map((item)=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"><div><p className="text-xs font-bold text-[#173b2a]">{item.projectName}</p><p className="mt-1 text-[10px] text-slate-500">{item.state} · {item.lga} · {item.teamName || "Inspection team"}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusTone(item.status)}`}>{item.status}</span></div>)}</div> : <div className="p-8 text-center text-xs text-slate-500">No risk or corrective-action signals are currently recorded.</div>}</section>}

            {activeTab === "Analytics" && <MEAnalytics
              projects={filteredProjects}
              inspections={filteredInspections}
              teams={teams}
              isMeAdmin={isMeAdmin}
              verificationRate={totals.verificationRate}
            />}

            {activeTab === "Reports" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {["Monthly M&E Report","Programme Performance Report","State Performance Report","Re-Inspection Report","Outstanding Findings Report","Verification Progress Report"].map((report)=><article key={report} className="veritas-entity-card rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cce5d4] bg-[#eef8f1] text-[#08733f]"><FileText className="h-4 w-4"/></span><h3 className="mt-3 text-sm font-bold text-[#173b2a]">{report}</h3><p className="mt-2 text-xs leading-5 text-slate-500">Prepared for M&E monitoring and management review using the current filtered portfolio.</p></article>)}
            </div>}
          </div>
        </div>
      </main>
    </div>
  );
}

function DataTableProjects({ projects, verificationMode = false }: { projects: Project[]; verificationMode?: boolean }) {
  return <section className="veritas-data-panel overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-[#e3ece6] px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cce5d4] bg-[#eef8f1] text-[#08733f]"><MapPinned className="h-4 w-4"/></span><div><h2 className="text-base font-bold text-[#173b2a]">{verificationMode ? "Pending Verification" : "Projects Monitored"}</h2><p className="mt-1 text-xs text-slate-500">{projects.length.toLocaleString()} records in current view</p></div></div></div><div className="overflow-x-auto"><table className="veritas-data-table w-full min-w-[900px] text-left"><thead><tr><th className="px-5 py-3">Project</th><th className="px-5 py-3">Programme</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Contractor</th><th className="px-5 py-3">Component</th><th className="px-5 py-3">Status</th></tr></thead><tbody>{projects.slice(0,100).map((project)=><tr key={project.id || project.name}><td className="px-5 py-3 text-xs font-bold text-[#173b2a]">{project.name}</td><td className="px-5 py-3 text-xs">{project.programme}</td><td className="px-5 py-3 text-xs">{project.state}{project.lga ? ` · ${project.lga}` : ""}</td><td className="px-5 py-3 text-xs">{project.contractor}</td><td className="px-5 py-3 text-xs">{project.component}</td><td className="px-5 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${project.verified ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{project.verified ? "Verified" : project.status || "Pending"}</span></td></tr>)}</tbody></table></div></section>
}

function DataTableInspections({
  inspections,
  currentUserId,
  isMeAdmin,
  onSaveField,
}: {
  inspections: Inspection[];
  currentUserId: string;
  isMeAdmin: boolean;
  onSaveField: (inspectionId: string, field: string, value: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const selected = inspections.find((item) => item.id === selectedId) || null;
  const assignedSections = selected
    ? meInspectionSections.filter((section) => isMeAdmin || selected.sectionAssignments?.[section.id] === currentUserId)
    : [];
  const locked = selected ? ["Submitted","Approved","Verified"].includes(selected.status) : false;

  return <div className="space-y-4">
    <section className="veritas-data-panel overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#e3ece6] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#cce5d4] bg-[#eef8f1] text-[#08733f]"><CheckCircle2 className="h-4 w-4"/></span>
          <div><h2 className="text-base font-bold text-[#173b2a]">Inspection Monitoring</h2><p className="mt-1 text-xs text-slate-500">{inspections.length.toLocaleString()} inspection records · open a project to view your assigned sections</p></div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="veritas-data-table w-full min-w-[980px] text-left">
          <thead><tr><th className="px-5 py-3">Project</th><th className="px-5 py-3">Programme</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Team</th><th className="px-5 py-3">My Sections</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead>
          <tbody>{inspections.slice(0,100).map((item) => {
            const mine = meInspectionSections.filter((section) => item.sectionAssignments?.[section.id] === currentUserId);
            return <tr key={item.id}>
              <td className="px-5 py-3 text-xs font-bold text-[#173b2a]">{item.projectName}</td>
              <td className="px-5 py-3 text-xs">{item.programme}</td>
              <td className="px-5 py-3 text-xs">{item.state} · {item.lga}</td>
              <td className="px-5 py-3 text-xs">{item.teamName || "—"}</td>
              <td className="px-5 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${mine.length ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{isMeAdmin ? "Admin view" : `${mine.length} assigned`}</span></td>
              <td className="px-5 py-3"><span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${statusTone(item.status)}`}>{item.status}</span></td>
              <td className="px-5 py-3"><button type="button" onClick={()=>setSelectedId(item.id)} className="rounded-lg border border-[#b9dfc5] bg-white px-3 py-2 text-[10px] font-bold text-[#08733f] hover:bg-[#f2faf4]">View Sections</button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>

    {selected && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[#e3ece6] bg-[#fbfefb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#08733f]">{isMeAdmin ? "Inspection Sections" : "My Assigned Sections"}</p><h3 className="mt-1 text-base font-extrabold text-[#173b2a]">{selected.projectName}</h3><p className="mt-1 text-xs text-slate-500">{selected.teamName || "M&E Team"} · {selected.state} / {selected.lga}</p></div>
        <button type="button" onClick={()=>setSelectedId("")} className="self-start rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-500">Close</button>
      </div>

      {!assignedSections.length && !isMeAdmin ? <div className="p-8 text-center">
        <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300"/>
        <p className="mt-3 text-sm font-bold text-slate-600">No section assigned to you</p>
        <p className="mt-1 text-xs text-slate-400">Your M&E Admin or Team Lead must assign at least one form section to your account.</p>
      </div> : <div className="grid gap-4 p-4 lg:grid-cols-2">
        {assignedSections.map((section) => {
          const completed = section.fields.filter((field) => String(selected.form?.[field] || "").trim()).length;
          return <article key={section.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><h4 className="text-sm font-extrabold text-[#173b2a]">{section.title}</h4><p className="mt-1 text-[10px] leading-4 text-slate-500">{section.description}</p></div>
              <span className="rounded-full bg-[#edf8f0] px-2 py-1 text-[9px] font-bold text-[#08733f]">{completed}/{section.fields.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {section.fields.map((field) => <label key={field} className="block">
                <span className="text-[10px] font-bold text-slate-600">{field}</span>
                <textarea
                  disabled={locked || (!isMeAdmin && selected.sectionAssignments?.[section.id] !== currentUserId)}
                  value={selected.form?.[field] || ""}
                  onChange={(event)=>void onSaveField(selected.id, field, event.target.value)}
                  rows={field.toLowerCase().includes("observation") || field.toLowerCase().includes("notes") ? 4 : 2}
                  className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs text-[#173b2a] outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10 disabled:bg-slate-50 disabled:text-slate-400"
                  placeholder="Enter inspection information…"
                />
              </label>)}
            </div>
          </article>;
        })}
      </div>}
    </section>}
  </div>;
}


type AnalyticsProject = Project;
type AnalyticsInspection = Inspection;

function analyticsMonthLabel(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return {
    key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
    label: date.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
    time: new Date(date.getFullYear(), date.getMonth(), 1).getTime(),
  };
}

function MEAnalytics({
  projects,
  inspections,
  teams,
  isMeAdmin,
  verificationRate,
}: {
  projects: AnalyticsProject[];
  inspections: AnalyticsInspection[];
  teams: MeTeam[];
  isMeAdmin: boolean;
  verificationRate: number;
}) {
  const analytics = useMemo(() => {
    const verifiedProjects = projects.filter((project) => project.verified).length;
    const pendingProjects = Math.max(0, projects.length - verifiedProjects);
    const verificationData = [
      { name: "Verified", value: verifiedProjects, fill: "#0b7a43" },
      { name: "Pending", value: pendingProjects, fill: "#e6a31a" },
    ];

    const statusData = [
      { name: "In Progress", value: inspections.filter((item) => item.status === "In Progress").length, fill: "#2563eb" },
      { name: "Submitted", value: inspections.filter((item) => item.status === "Submitted").length, fill: "#7c3aed" },
      { name: "Verified", value: inspections.filter((item) => /verified|approved/i.test(item.status)).length, fill: "#0b7a43" },
      { name: "Re-Inspection", value: inspections.filter((item) => /re-?inspection/i.test(item.status)).length, fill: "#dc5c5c" },
    ];

    const programmeData = [...new Set(projects.map((project) => project.programme).filter(Boolean))].map((programme) => {
      const programmeProjects = projects.filter((project) => project.programme === programme);
      const programmeInspections = inspections.filter((inspection) => inspection.programme === programme);
      const verified = programmeProjects.filter((project) => project.verified).length;
      return {
        name: programme,
        projects: programmeProjects.length,
        verified,
        pending: Math.max(0, programmeProjects.length - verified),
        reinspection: programmeInspections.filter((inspection) => /re-?inspection/i.test(inspection.status)).length,
      };
    }).sort((a, b) => b.projects - a.projects);

    const monthMap = new Map<string, { key: string; month: string; time: number; submitted: number; verified: number; reinspection: number }>();
    inspections.forEach((inspection) => {
      const month = analyticsMonthLabel(inspection.updatedAt || inspection.submittedAt);
      if (!month) return;
      const current = monthMap.get(month.key) || { key: month.key, month: month.label, time: month.time, submitted: 0, verified: 0, reinspection: 0 };
      if (inspection.status === "Submitted") current.submitted += 1;
      if (/verified|approved/i.test(inspection.status)) current.verified += 1;
      if (/re-?inspection/i.test(inspection.status)) current.reinspection += 1;
      monthMap.set(month.key, current);
    });
    const trendData = [...monthMap.values()].sort((a, b) => a.time - b.time).slice(-8);

    const stateMap = new Map<string, { name: string; projects: number; verified: number; reinspection: number }>();
    projects.forEach((project) => {
      const name = project.state || "Unknown";
      const current = stateMap.get(name) || { name, projects: 0, verified: 0, reinspection: 0 };
      current.projects += 1;
      if (project.verified) current.verified += 1;
      stateMap.set(name, current);
    });
    inspections.forEach((inspection) => {
      if (!/re-?inspection/i.test(inspection.status)) return;
      const current = stateMap.get(inspection.state || "Unknown");
      if (current) current.reinspection += 1;
    });
    const stateData = [...stateMap.values()]
      .map((item) => ({ ...item, verificationRate: item.projects ? Math.round((item.verified / item.projects) * 100) : 0 }))
      .sort((a, b) => b.projects - a.projects)
      .slice(0, 8);

    const contractorMap = new Map<string, { name: string; inspections: number; completed: number; reinspection: number }>();
    inspections.forEach((inspection) => {
      const name = inspection.contractor || "Unassigned";
      const current = contractorMap.get(name) || { name, inspections: 0, completed: 0, reinspection: 0 };
      current.inspections += 1;
      if (/submitted|approved|verified/i.test(inspection.status)) current.completed += 1;
      if (/re-?inspection/i.test(inspection.status)) current.reinspection += 1;
      contractorMap.set(name, current);
    });
    const contractorData = [...contractorMap.values()].sort((a, b) => b.inspections - a.inspections).slice(0, 8);

    const teamData = teams.map((team) => {
      const teamInspections = inspections.filter((inspection) => inspection.teamName === team.name);
      const projectIds = new Set(teamInspections.map((inspection) => inspection.projectId));
      return {
        name: team.name,
        projects: projectIds.size,
        completed: teamInspections.filter((inspection) => /submitted|approved|verified/i.test(inspection.status)).length,
        reinspection: teamInspections.filter((inspection) => /re-?inspection/i.test(inspection.status)).length,
      };
    }).sort((a, b) => b.projects - a.projects);

    return { verificationData, statusData, programmeData, trendData, stateData, contractorData, teamData };
  }, [projects, inspections, teams]);

  const totalInspections = inspections.length;
  const completionRate = totalInspections
    ? Math.round((inspections.filter((item) => /submitted|approved|verified/i.test(item.status)).length / totalInspections) * 100)
    : 0;
  const reinspectionCount = inspections.filter((item) => /re-?inspection/i.test(item.status)).length;
  const analyticsSummary = [
    {
      label: "Verification",
      value: `${verificationRate}%`,
      detail: `${projects.filter((project) => project.verified).length} of ${projects.length} projects`,
      progress: verificationRate,
      icon: ShieldCheck,
      iconClass: "bg-emerald-600 text-white",
      barClass: "bg-emerald-600",
      surfaceClass: "border-emerald-100 bg-emerald-50/65",
    },
    {
      label: "Completion",
      value: `${completionRate}%`,
      detail: `${inspections.filter((item) => /submitted|approved|verified/i.test(item.status)).length} of ${totalInspections} inspections`,
      progress: completionRate,
      icon: CheckCircle2,
      iconClass: "bg-violet-600 text-white",
      barClass: "bg-violet-600",
      surfaceClass: "border-violet-100 bg-violet-50/60",
    },
    {
      label: "Re-Inspection",
      value: reinspectionCount.toLocaleString(),
      detail: reinspectionCount === 1 ? "case requiring another inspection" : "cases requiring another inspection",
      progress: totalInspections ? Math.min(100, Math.round((reinspectionCount / totalInspections) * 100)) : 0,
      icon: RotateCcw,
      iconClass: "bg-rose-600 text-white",
      barClass: "bg-rose-500",
      surfaceClass: "border-rose-100 bg-rose-50/60",
    },
  ];

  const cardMotion = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };

  return <div className="space-y-4">
    <motion.section {...cardMotion} className="overflow-hidden rounded-2xl border border-[#d7e7db] bg-white shadow-[0_8px_30px_rgba(23,59,42,0.06)]">
      <div className="grid gap-0 xl:grid-cols-[minmax(280px,.78fr)_minmax(0,1.72fr)]">
        <div className="relative overflow-hidden border-b border-[#e6eee8] bg-[linear-gradient(135deg,#f4faf6_0%,#ffffff_70%)] p-5 xl:border-b-0 xl:border-r">
          <div className="absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[#dff0e4]/65 blur-2xl" />
          <div className="relative">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#cfe5d6] bg-white px-3 py-1 text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#08733f] shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-[#08733f]" />
                M&E Intelligence
              </span>
              <span className="rounded-full border border-slate-200 bg-white/90 px-2.5 py-1 text-[9px] font-bold text-slate-500">
                {isMeAdmin ? "All M&E teams" : "Assigned portfolio"}
              </span>
            </div>
            <h2 className="text-[20px] font-extrabold tracking-[-0.025em] text-[#173b2a]">Portfolio Analytics</h2>
            <p className="mt-2 max-w-md text-[11px] leading-5 text-slate-500">
              {isMeAdmin
                ? "Live performance signals across all M&E teams and assigned projects."
                : "Live performance signals from projects assigned to your M&E teams only."}
            </p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-semibold text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]" />
              Filters update every chart and metric on this page
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
          {analyticsSummary.map((metric, index) => {
            const Icon = metric.icon;
            return <motion.article
              key={metric.label}
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.32, delay: 0.06 + index * 0.05 }}
              whileHover={{ y: -2 }}
              className={`group rounded-2xl border p-3.5 shadow-[0_5px_16px_rgba(23,59,42,0.04)] transition-all hover:shadow-[0_9px_24px_rgba(23,59,42,0.08)] ${metric.surfaceClass}`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-105 ${metric.iconClass}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.09em] text-slate-400">{metric.label}</span>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <p className="text-[27px] font-extrabold leading-none tracking-[-0.035em] text-[#173b2a]">{metric.value}</p>
                <span className="text-[9px] font-bold text-slate-400">{metric.progress}%</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/80 ring-1 ring-black/[0.03]">
                <motion.div
                  className={`h-full rounded-full ${metric.barClass}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${metric.progress}%` }}
                  transition={{ duration: 0.7, delay: 0.15 + index * 0.06, ease: "easeOut" }}
                />
              </div>
              <p className="mt-2 min-h-[30px] text-[9.5px] leading-[15px] text-slate-500">{metric.detail}</p>
            </motion.article>;
          })}
        </div>
      </div>
    </motion.section>

    <div className="grid gap-4 xl:grid-cols-2">
      <AnalyticsPanel title="Verification Progress" subtitle="Verified versus pending projects" delay={0.04}>
        {projects.length ? <div className="relative h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={analytics.verificationData} dataKey="value" nameKey="name" innerRadius={72} outerRadius={100} paddingAngle={3} isAnimationActive animationDuration={700}>
                {analytics.verificationData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dce8df", fontSize: 12 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="mb-7 text-center"><p className="text-3xl font-extrabold text-[#173b2a]">{verificationRate}%</p><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">verified</p></div>
          </div>
        </div> : <AnalyticsEmpty text="No assigned projects to analyse." />}
      </AnalyticsPanel>

      <AnalyticsPanel title="Inspection Status" subtitle="Current inspection workflow distribution" delay={0.08}>
        {totalInspections ? <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.statusData} layout="vertical" margin={{ top: 8, right: 24, left: 16, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#edf1ee" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dce8df", fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 8, 8, 0]} isAnimationActive animationDuration={650}>
                {analytics.statusData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div> : <AnalyticsEmpty text="No inspection records in the current portfolio." />}
      </AnalyticsPanel>
    </div>

    <AnalyticsPanel title="Programme Performance" subtitle="Projects, verification and re-inspection by programme" delay={0.12}>
      {analytics.programmeData.length ? <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={analytics.programmeData} margin={{ top: 14, right: 18, left: -10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1ee" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dce8df", fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="verified" name="Verified" stackId="projects" fill="#0b7a43" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={700} />
            <Bar dataKey="pending" name="Pending" stackId="projects" fill="#e6a31a" isAnimationActive animationDuration={700} />
            <Bar dataKey="reinspection" name="Re-Inspection" fill="#dc5c5c" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={700} />
          </BarChart>
        </ResponsiveContainer>
      </div> : <AnalyticsEmpty text="No programme data in the current portfolio." />}
    </AnalyticsPanel>

    <div className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
      <AnalyticsPanel title="Verification & Re-Inspection Trend" subtitle="Inspection records grouped by their latest recorded activity month" delay={0.16}>
        {analytics.trendData.length ? <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.trendData} margin={{ top: 10, right: 16, left: -12, bottom: 4 }}>
              <defs>
                <linearGradient id="meVerified" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0b7a43" stopOpacity={0.24}/><stop offset="95%" stopColor="#0b7a43" stopOpacity={0}/></linearGradient>
                <linearGradient id="meReinspection" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#dc5c5c" stopOpacity={0.2}/><stop offset="95%" stopColor="#dc5c5c" stopOpacity={0}/></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1ee" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dce8df", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="verified" name="Verified" stroke="#0b7a43" fill="url(#meVerified)" strokeWidth={2.5} isAnimationActive animationDuration={850} />
              <Area type="monotone" dataKey="reinspection" name="Re-Inspection" stroke="#dc5c5c" fill="url(#meReinspection)" strokeWidth={2.5} isAnimationActive animationDuration={850} />
              <Line type="monotone" dataKey="submitted" name="Submitted" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} isAnimationActive animationDuration={850} />
            </AreaChart>
          </ResponsiveContainer>
        </div> : <AnalyticsEmpty text="No dated inspection activity is available for a trend yet." />}
      </AnalyticsPanel>

      <AnalyticsPanel title="State Performance" subtitle="Largest assigned state portfolios and verification rate" delay={0.2}>
        {analytics.stateData.length ? <div className="space-y-3 pt-2">
          {analytics.stateData.map((state, index) => <motion.div key={state.name} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.28, delay: index * 0.035 }}>
            <div className="mb-1.5 flex items-center justify-between gap-3"><div><span className="text-xs font-bold text-[#173b2a]">{state.name}</span><span className="ml-2 text-[10px] text-slate-400">{state.projects} projects</span></div><span className="text-xs font-extrabold text-[#08733f]">{state.verificationRate}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><motion.div className="h-full rounded-full bg-[#0b7a43]" initial={{ width: 0 }} animate={{ width: `${state.verificationRate}%` }} transition={{ duration: 0.65, delay: 0.08 + index * 0.035 }} /></div>
          </motion.div>)}
        </div> : <AnalyticsEmpty text="No state performance data available." />}
      </AnalyticsPanel>
    </div>

    <div className={isMeAdmin ? "grid gap-4 xl:grid-cols-2" : "grid gap-4"}>
      <AnalyticsPanel title="Contractor Performance" subtitle="Inspection workload, completed reviews and re-inspections" delay={0.24}>
        {analytics.contractorData.length ? <div className="h-[330px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.contractorData} layout="vertical" margin={{ top: 6, right: 18, left: 30, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#edf1ee" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dce8df", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="completed" name="Completed" fill="#0b7a43" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={700} />
              <Bar dataKey="reinspection" name="Re-Inspection" fill="#dc5c5c" radius={[0, 6, 6, 0]} isAnimationActive animationDuration={700} />
            </BarChart>
          </ResponsiveContainer>
        </div> : <AnalyticsEmpty text="No contractor inspection data available." />}
      </AnalyticsPanel>

      {isMeAdmin && <AnalyticsPanel title="Team Performance" subtitle="Assigned projects, completed inspections and re-inspections" delay={0.28}>
        {analytics.teamData.length ? <div className="h-[330px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.teamData} margin={{ top: 10, right: 18, left: -6, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#edf1ee" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dce8df", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="projects" name="Assigned projects" fill="#2563eb" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={720} />
              <Bar dataKey="completed" name="Completed" fill="#0b7a43" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={720} />
              <Bar dataKey="reinspection" name="Re-Inspection" fill="#dc5c5c" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={720} />
            </BarChart>
          </ResponsiveContainer>
        </div> : <AnalyticsEmpty text="Create M&E teams and assign projects to see team performance." />}
      </AnalyticsPanel>}
    </div>
  </div>;
}

function AnalyticsPanel({ title, subtitle, delay, children }: { title: string; subtitle: string; delay: number; children: ReactNode }) {
  return <motion.section
    initial={{ opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.38, delay }}
    whileHover={{ y: -2 }}
    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(23,59,42,0.06)] transition-shadow hover:shadow-[0_12px_34px_rgba(23,59,42,0.09)]"
  >
    <div className="flex items-center justify-between border-b border-[#edf2ee] px-5 py-4">
      <div><h3 className="text-sm font-extrabold tracking-tight text-[#173b2a]">{title}</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">{subtitle}</p></div>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-[#d7eadc] bg-[#f1f8f3] text-[#08733f]"><BarChart3 className="h-4 w-4" /></span>
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </motion.section>;
}

function AnalyticsEmpty({ text }: { text: string }) {
  return <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-[#fbfcfb] px-5 text-center text-xs text-slate-400">{text}</div>;
}
