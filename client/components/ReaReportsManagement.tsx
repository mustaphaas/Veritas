import { useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  MapPinned,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  MapPinCheck,
} from "lucide-react";
import type { Project } from "../lib/dashboard-data";
import { useInspectionWorkflow, type InspectionAssignment } from "../lib/inspection-workflow";

type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  icon: any;
  tone: string;
  includes: string[];
};

type ReportColumn = { key: string; label: string };
type ReportRow = Record<string, string | number>;
type ReportData = { columns: ReportColumn[]; rows: ReportRow[] };

const definitions: ReportDefinition[] = [
  {
    id: "portfolio",
    title: "Portfolio & Delivery Summary",
    description: "Management view of REA projects, programmes, installed capacity, beneficiaries and verification position.",
    icon: FileBarChart,
    tone: "emerald",
    includes: ["Projects", "Capacity", "Beneficiaries", "Verification"],
  },
  {
    id: "inspection-register",
    title: "Inspection & Verification Register",
    description: "Official register of field inspections from assignment through Consultant QA and final REA verification.",
    icon: ClipboardCheck,
    tone: "blue",
    includes: ["Field officer", "Inspection status", "GPS", "Submission"],
  },
  {
    id: "verification",
    title: "Verification & QA Report",
    description: "Tracks Awaiting REA, Verified and Re-inspection records together with Consultant QA and REA decisions.",
    icon: ShieldCheck,
    tone: "violet",
    includes: ["Awaiting REA", "Verified", "Re-inspection", "QA decisions"],
  },
  {
    id: "reinspection",
    title: "Re-inspection & Corrective Action Report",
    description: "Records inspections returned for re-inspection, the reason for return and the current resolution position.",
    icon: RefreshCw,
    tone: "amber",
    includes: ["Return reason", "Project", "Officer", "Resolution"],
  },
  {
    id: "evidence",
    title: "GPS & Evidence Compliance Report",
    description: "Checks arrival geofence compliance and the inspection evidence captured against each project assignment.",
    icon: MapPinCheck,
    tone: "emerald",
    includes: ["GPS verification", "Geofence", "Evidence count", "Device"],
  },
  {
    id: "contractor",
    title: "Contractor Performance Report",
    description: "Compares contractor delivery, installed capacity, beneficiary impact and verification performance.",
    icon: Building2,
    tone: "blue",
    includes: ["Project volume", "Capacity", "Beneficiaries", "Verification rate"],
  },
  {
    id: "geographic",
    title: "State & LGA Delivery Report",
    description: "Shows project delivery and field verification coverage by State and, where inspection data exists, by LGA.",
    icon: MapPinned,
    tone: "violet",
    includes: ["State", "LGA", "Projects", "Inspection coverage"],
  },
  {
    id: "field-operations",
    title: "Field Operations Report",
    description: "Operational report on field officer assignments, drafts, submissions, approvals, verification and sync status.",
    icon: Smartphone,
    tone: "amber",
    includes: ["Assignments", "Officer workload", "Workflow status", "Sync status"],
  },
];

const toneClass = (tone: string) =>
  tone === "blue"
    ? "bg-blue-50 text-blue-700"
    : tone === "violet"
      ? "bg-violet-50 text-violet-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";

function verificationRate(total: number, verified: number) {
  return total ? `${Math.round((verified / total) * 100)}%` : "0%";
}

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function monthLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

function gpsStatus(item: InspectionAssignment) {
  if (!item.arrival) return "Not captured";
  return item.arrival.distance <= item.geofenceRadius ? "Verified" : "Outside geofence";
}

function buildReportData(reportId: string, projects: Project[], assignments: InspectionAssignment[]): ReportData {
  if (reportId === "inspection-register") {
    return {
      columns: [
        { key: "project", label: "Project" },
        { key: "officer", label: "Field Officer" },
        { key: "location", label: "Location" },
        { key: "component", label: "Component" },
        { key: "status", label: "Workflow Status" },
        { key: "gps", label: "GPS" },
        { key: "submitted", label: "Submitted" },
      ],
      rows: assignments.map((item) => ({
        project: `${item.id} · ${item.projectName}`,
        officer: item.officer,
        location: `${item.community}, ${item.lga}, ${item.state}`,
        component: item.component,
        status: item.status,
        gps: gpsStatus(item),
        submitted: formatDate(item.report?.submittedAt),
      })),
    };
  }

  if (reportId === "verification") {
    const records = assignments.filter((item) => ["Approved", "Verified", "Re-inspection"].includes(item.status));
    return {
      columns: [
        { key: "project", label: "Project" },
        { key: "programme", label: "Programme" },
        { key: "location", label: "Location" },
        { key: "consultantQa", label: "Consultant QA" },
        { key: "rea", label: "REA Position" },
        { key: "note", label: "Decision / Note" },
      ],
      rows: records.map((item) => ({
        project: `${item.id} · ${item.projectName}`,
        programme: item.programme,
        location: `${item.lga}, ${item.state}`,
        consultantQa: item.status === "Approved" || item.status === "Verified" || item.status === "Re-inspection" ? "Approved" : "Pending",
        rea: item.status === "Approved" ? "Awaiting REA" : item.status,
        note: item.report?.reviewNote || "—",
      })),
    };
  }

  if (reportId === "reinspection") {
    const records = assignments.filter((item) => item.status === "Re-inspection");
    return {
      columns: [
        { key: "project", label: "Project" },
        { key: "officer", label: "Field Officer" },
        { key: "location", label: "Location" },
        { key: "reason", label: "Reason for Re-inspection" },
        { key: "evidence", label: "Evidence" },
        { key: "status", label: "Current Status" },
      ],
      rows: records.map((item) => ({
        project: `${item.id} · ${item.projectName}`,
        officer: item.officer,
        location: `${item.community}, ${item.lga}, ${item.state}`,
        reason: item.report?.reviewNote || "Re-inspection requested",
        evidence: `${item.report?.evidence?.length || 0} file(s)`,
        status: item.status,
      })),
    };
  }

  if (reportId === "evidence") {
    return {
      columns: [
        { key: "project", label: "Project" },
        { key: "officer", label: "Field Officer" },
        { key: "gps", label: "GPS Verification" },
        { key: "distance", label: "Distance" },
        { key: "radius", label: "Geofence" },
        { key: "evidence", label: "Evidence" },
        { key: "device", label: "Device" },
      ],
      rows: assignments.filter((item) => item.report || item.arrival).map((item) => ({
        project: `${item.id} · ${item.projectName}`,
        officer: item.officer,
        gps: gpsStatus(item),
        distance: item.arrival ? `${Math.round(item.arrival.distance)} m` : "—",
        radius: `${item.geofenceRadius} m`,
        evidence: `${item.report?.evidence?.length || 0} file(s)`,
        device: item.report?.deviceType || "—",
      })),
    };
  }

  if (reportId === "contractor") {
    const grouped = new Map<string, { projects: number; verified: number; kw: number; households: number }>();
    projects.forEach((project) => {
      const current = grouped.get(project.contractor) || { projects: 0, verified: 0, kw: 0, households: 0 };
      current.projects += 1;
      current.verified += project.verified ? 1 : 0;
      current.kw += project.kw;
      current.households += project.households;
      grouped.set(project.contractor, current);
    });
    return {
      columns: [
        { key: "contractor", label: "Contractor" },
        { key: "projects", label: "Projects" },
        { key: "capacity", label: "Installed Capacity" },
        { key: "beneficiaries", label: "Beneficiaries" },
        { key: "verified", label: "Verified" },
        { key: "rate", label: "Verification Rate" },
      ],
      rows: [...grouped.entries()].map(([contractor, data]) => ({
        contractor,
        projects: data.projects,
        capacity: `${(data.kw / 1000).toFixed(2)} MW`,
        beneficiaries: data.households.toLocaleString(),
        verified: data.verified,
        rate: verificationRate(data.projects, data.verified),
      })).sort((a, b) => Number(b.projects) - Number(a.projects)),
    };
  }

  if (reportId === "geographic") {
    const grouped = new Map<string, { projects: number; kw: number; households: number; verified: number; inspections: number; lgas: Set<string> }>();
    projects.forEach((project) => {
      const current = grouped.get(project.state) || { projects: 0, kw: 0, households: 0, verified: 0, inspections: 0, lgas: new Set<string>() };
      current.projects += 1;
      current.kw += project.kw;
      current.households += project.households;
      current.verified += project.verified ? 1 : 0;
      grouped.set(project.state, current);
    });
    assignments.forEach((item) => {
      const current = grouped.get(item.state) || { projects: 0, kw: 0, households: 0, verified: 0, inspections: 0, lgas: new Set<string>() };
      current.inspections += 1;
      if (item.lga) current.lgas.add(item.lga);
      grouped.set(item.state, current);
    });
    return {
      columns: [
        { key: "state", label: "State" },
        { key: "projects", label: "Projects" },
        { key: "lgas", label: "LGAs Inspected" },
        { key: "capacity", label: "Capacity" },
        { key: "beneficiaries", label: "Beneficiaries" },
        { key: "inspections", label: "Field Inspections" },
        { key: "verified", label: "Verified Projects" },
      ],
      rows: [...grouped.entries()].map(([state, data]) => ({
        state,
        projects: data.projects,
        lgas: data.lgas.size,
        capacity: `${(data.kw / 1000).toFixed(2)} MW`,
        beneficiaries: data.households.toLocaleString(),
        inspections: data.inspections,
        verified: data.verified,
      })).sort((a, b) => Number(b.projects) - Number(a.projects)),
    };
  }

  if (reportId === "field-operations") {
    return {
      columns: [
        { key: "officer", label: "Field Officer" },
        { key: "project", label: "Assignment" },
        { key: "location", label: "Location" },
        { key: "status", label: "Workflow Status" },
        { key: "sync", label: "Sync Status" },
        { key: "arrival", label: "Arrival" },
        { key: "submitted", label: "Submitted" },
      ],
      rows: assignments.map((item) => ({
        officer: item.officer,
        project: `${item.id} · ${item.projectName}`,
        location: `${item.lga}, ${item.state}`,
        status: item.status,
        sync: item.syncStatus || "—",
        arrival: formatDate(item.arrival?.at),
        submitted: formatDate(item.report?.submittedAt),
      })),
    };
  }

  return {
    columns: [
      { key: "project", label: "Project" },
      { key: "programme", label: "Programme" },
      { key: "state", label: "State" },
      { key: "component", label: "Component" },
      { key: "contractor", label: "Contractor" },
      { key: "capacity", label: "Installed Capacity" },
      { key: "beneficiaries", label: "Beneficiaries" },
      { key: "verification", label: "Verification" },
    ],
    rows: projects.map((project) => ({
      project: project.name,
      programme: project.programme,
      state: project.state,
      component: project.component,
      contractor: project.contractor,
      capacity: `${project.kw.toLocaleString()} kW`,
      beneficiaries: project.households.toLocaleString(),
      verification: project.verified ? "Verified" : project.status,
    })),
  };
}

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default function ReaReportsManagement({ projects }: { projects: Project[] }) {
  const { assignments } = useInspectionWorkflow();
  const [selected, setSelected] = useState<ReportDefinition>(definitions[0]);
  const [programme, setProgramme] = useState("All");
  const [state, setState] = useState("All");
  const [period, setPeriod] = useState("All periods");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  const programmes = useMemo(() => ["All", ...new Set([...projects.map((p) => p.programme), ...assignments.map((a) => a.programme)])], [projects, assignments]);
  const states = useMemo(() => ["All", ...new Set([...projects.map((p) => p.state), ...assignments.map((a) => a.state)])], [projects, assignments]);
  const periods = useMemo(() => ["All periods", ...new Set([...projects.map((p) => p.month), ...assignments.map((a) => monthLabel(a.report?.inspectedAt)).filter(Boolean)])], [projects, assignments]);

  const matchingProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) =>
      (programme === "All" || project.programme === programme) &&
      (state === "All" || project.state === state) &&
      (period === "All periods" || project.month === period) &&
      (!q || [project.name, project.contractor, project.component, project.state].join(" ").toLowerCase().includes(q)),
    );
  }, [projects, programme, state, period, query]);

  const matchingAssignments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((item) =>
      (programme === "All" || item.programme === programme) &&
      (state === "All" || item.state === state) &&
      (period === "All periods" || monthLabel(item.report?.inspectedAt) === period) &&
      (!q || [item.id, item.projectName, item.contractor, item.component, item.state, item.lga, item.community, item.officer].join(" ").toLowerCase().includes(q)),
    );
  }, [assignments, programme, state, period, query]);

  const reportData = useMemo(() => buildReportData(selected.id, matchingProjects, matchingAssignments), [selected.id, matchingProjects, matchingAssignments]);
  const verified = matchingAssignments.filter((item) => item.status === "Verified").length;
  const awaiting = matchingAssignments.filter((item) => item.status === "Approved").length;
  const reinspections = matchingAssignments.filter((item) => item.status === "Re-inspection").length;

  const selectReport = (report: ReportDefinition) => {
    setSelected(report);
    setNotice(`${report.title} loaded from the current Veritas project and inspection records.`);
  };

  const exportCsv = () => {
    const rows = [reportData.columns.map((column) => column.label), ...reportData.rows.map((row) => reportData.columns.map((column) => row[column.key] ?? ""))];
    const csv = rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = `${selected.id}-report.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setNotice(`${selected.title} exported successfully.`);
  };

  const generate = () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice("Print preview was blocked by the browser. Allow pop-ups and try again.");
      return;
    }
    popup.opener = null;
    const scope = `${programme === "All" ? "All programmes" : programme} · ${state === "All" ? "All states" : state} · ${period}`;
    const tableHead = reportData.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
    const tableBody = reportData.rows.map((row) => `<tr>${reportData.columns.map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`).join("")}</tr>`).join("");
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(selected.title)}</title><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;padding:28px;color:#173b2a;background:#fff}.header{display:flex;align-items:center;gap:16px;border-bottom:3px solid #08733f;padding-bottom:16px;margin-bottom:18px}.header img{width:60px;height:60px;object-fit:contain}h1{font-size:22px;margin:0 0 6px}.brand{font-size:11px;font-weight:700;color:#08733f;text-transform:uppercase;letter-spacing:.12em}.meta{font-size:11px;color:#64748b;margin-top:5px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}.card{border:1px solid #dfe7e2;border-radius:8px;padding:12px}.card b{display:block;font-size:18px}.card span{font-size:10px;color:#64748b}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#eef8f1;text-align:left;padding:8px;border:1px solid #dfe7e2}td{padding:8px;border:1px solid #e5e7eb;vertical-align:top}.footer{margin-top:18px;font-size:9px;color:#64748b}@media print{body{padding:12px}}</style></head><body><div class="header"><img src="${window.location.origin}/rea-brand-mark.svg"/><div><div class="brand">Rural Electrification Agency · Veritas</div><h1>${escapeHtml(selected.title)}</h1><div class="meta">${escapeHtml(scope)}</div></div></div><div class="summary"><div class="card"><b>${matchingProjects.length}</b><span>Projects in scope</span></div><div class="card"><b>${matchingAssignments.length}</b><span>Inspection records</span></div><div class="card"><b>${reportData.rows.length}</b><span>Report rows</span></div></div><table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody || '<tr><td colspan="10">No records match the current filters.</td></tr>'}</tbody></table><div class="footer">Generated from current Veritas project monitoring and inspection workflow records.</div><script>window.onload=()=>setTimeout(()=>window.print(),150);</script></body></html>`);
    popup.document.close();
    setNotice(`${selected.title} print preview opened successfully.`);
  };

  return (
    <div className="space-y-4 pb-8 pt-4">
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2"><FileBarChart className="h-5 w-5 text-[#08733f]"/><h2 className="text-xl font-bold text-[#173b2a]">Reports Centre</h2></div><p className="mt-1 text-xs text-slate-500">Operational, verification and management reports generated from Veritas project and field-inspection records.</p></div>
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700"><ShieldCheck className="h-4 w-4"/>Project & inspection reporting</div>
      </section>

      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{notice}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [FileBarChart, "Report Types", definitions.length, "Reports aligned to Veritas scope"],
          [ClipboardCheck, "Inspection Records", matchingAssignments.length, "Field workflow records in scope"],
          [ShieldCheck, "Verified", verified, "REA verified inspection reports"],
          [RefreshCw, "Awaiting / Re-inspection", awaiting + reinspections, `${awaiting} awaiting REA · ${reinspections} re-inspection`],
        ].map(([Icon, label, value, detail]: any) => <article key={label} className="group min-h-[112px] rounded-lg border border-slate-200 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9dceb0] hover:shadow-md"><div className="flex h-full flex-col items-center justify-center"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-[#08733f] transition group-hover:bg-[#08733f] group-hover:text-white"><Icon className="h-5 w-5"/></div><p className="mt-2 text-sm font-semibold text-[#263c31]">{label}</p><p className="mt-1 text-[23px] font-bold leading-none text-[#13281e]">{value}</p><p className="mt-2 text-[11px] text-slate-500">{detail}</p></div></article>)}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><label className="relative xl:col-span-2"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search project, contractor, officer, component or LGA" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs"/></label><select value={programme} onChange={(e)=>setProgramme(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">{programmes.map((item)=><option key={item}>{item}</option>)}</select><select value={state} onChange={(e)=>setState(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">{states.map((item)=><option key={item}>{item}</option>)}</select><select value={period} onChange={(e)=>setPeriod(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600">{periods.map((item)=><option key={item}>{item}</option>)}</select></div></section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_.75fr]">
        <div className="grid gap-3 sm:grid-cols-2">{definitions.map((report,index)=>{const Icon=report.icon;const active=selected.id===report.id;return <button key={report.id} type="button" onClick={()=>selectReport(report)} className={`group rounded-xl border p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${active?"border-[#08733f] bg-[#f3fbf5] ring-1 ring-[#08733f]/10":"border-slate-200 bg-white hover:border-[#9dceb0]"}`}><div className="flex items-start gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:bg-[#08733f] group-hover:text-white ${toneClass(report.tone)}`}><Icon className="h-5 w-5"/></span><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Report {index+1}</p><h3 className="mt-1 text-sm font-bold text-[#173b2a]">{report.title}</h3><p className="mt-2 text-[10px] leading-4 text-slate-500">{report.description}</p><div className="mt-3 flex flex-wrap gap-1.5">{report.includes.map((item)=><span key={item} className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-semibold text-slate-500">{item}</span>)}</div><p className="mt-3 text-[10px] font-bold text-[#08733f]">Open report →</p></div></div></button>})}</div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-[110px]"><div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass(selected.tone)}`}>{(()=>{const Icon=selected.icon;return <Icon className="h-6 w-6"/>})()}</div><p className="mt-4 text-[9px] font-bold uppercase tracking-wider text-[#08733f]">Selected report</p><h3 className="mt-1 text-lg font-bold text-[#173b2a]">{selected.title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{selected.description}</p><dl className="mt-5 divide-y divide-slate-100 text-xs"><div className="flex justify-between py-3"><dt className="text-slate-500">Programme</dt><dd className="font-bold">{programme}</dd></div><div className="flex justify-between py-3"><dt className="text-slate-500">State</dt><dd className="font-bold">{state}</dd></div><div className="flex justify-between py-3"><dt className="text-slate-500">Period</dt><dd className="font-bold">{period}</dd></div><div className="flex justify-between py-3"><dt className="text-slate-500">Projects</dt><dd className="font-bold">{matchingProjects.length}</dd></div><div className="flex justify-between py-3"><dt className="text-slate-500">Inspection records</dt><dd className="font-bold">{matchingAssignments.length}</dd></div></dl><button type="button" onClick={generate} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#08733f] text-xs font-bold text-white hover:bg-[#065d32]"><FileText className="h-4 w-4"/>Generate PDF / Print</button><button type="button" onClick={exportCsv} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-4 w-4"/>Export report data</button></aside>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#08733f]">Report preview</p><h3 className="mt-1 text-sm font-bold text-[#173b2a]">{selected.title}</h3></div><span className="w-fit rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold text-emerald-700">{reportData.rows.length} RECORDS</span></div><div className="overflow-x-auto"><table className="min-w-full text-left text-[10px]"><thead className="bg-slate-50 text-slate-500"><tr>{reportData.columns.map((column)=><th key={column.key} className="whitespace-nowrap px-4 py-3 font-bold uppercase tracking-wider">{column.label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{reportData.rows.length?reportData.rows.slice(0,12).map((row,rowIndex)=><tr key={`${selected.id}-${rowIndex}`} className="hover:bg-slate-50/70">{reportData.columns.map((column)=><td key={column.key} className="max-w-[280px] px-4 py-3 text-slate-600">{row[column.key]}</td>)}</tr>):<tr><td colSpan={reportData.columns.length} className="px-5 py-10 text-center text-xs text-slate-500">No records match the current filters.</td></tr>}</tbody></table></div>{reportData.rows.length>12&&<div className="border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500">Showing the first 12 rows. Export or print to include all {reportData.rows.length} records.</div>}</section>
    </div>
  );
}
