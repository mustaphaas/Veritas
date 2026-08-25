import { useMemo, useState } from "react";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  Download,
  FileBarChart,
  FileCheck2,
  FileText,
  Map,
  MapPinned,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Project } from "../lib/dashboard-data";

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
    id: "inspection",
    title: "Individual Inspection Report",
    description:
      "Complete evidence, coordinates, technical findings and review decisions for a single field inspection.",
    icon: ClipboardCheck,
    tone: "emerald",
    includes: ["Inspection details", "Evidence register", "QA decisions"],
  },
  {
    id: "project",
    title: "Project Summary Report",
    description:
      "Executive summary of project scope, delivery, capacity, households reached and verification position.",
    icon: FileText,
    tone: "blue",
    includes: ["Project profile", "Delivery metrics", "Verification status"],
  },
  {
    id: "contractor",
    title: "Contractor Performance Report",
    description:
      "Compare contractor delivery volume, completion quality, verification rate and outstanding actions.",
    icon: Building2,
    tone: "violet",
    includes: ["Delivery ranking", "Quality signals", "Pending actions"],
  },
  {
    id: "state",
    title: "State Performance Report",
    description:
      "State-level programme delivery, installed capacity, impact and verification performance.",
    icon: Map,
    tone: "emerald",
    includes: ["State portfolio", "Capacity & impact", "Programme split"],
  },
  {
    id: "lga",
    title: "LGA Performance Report",
    description:
      "Detailed local-government delivery coverage, project progress and unresolved verification items.",
    icon: MapPinned,
    tone: "blue",
    includes: ["LGA coverage", "Project register", "Verification backlog"],
  },
  {
    id: "reinspection",
    title: "Re-inspection Report",
    description:
      "Track rejected submissions, reasons for return, corrective actions and repeat inspection outcomes.",
    icon: RefreshCw,
    tone: "amber",
    includes: ["Return reasons", "Corrective actions", "Resolution status"],
  },
  {
    id: "progress",
    title: "Project Progress Report",
    description:
      "Monitor planned versus delivered milestones, field activity, report submission and completion trend.",
    icon: BarChart3,
    tone: "rose",
    includes: ["Milestones", "Progress trend", "Delivery exceptions"],
  },
];

const toneClass = (tone: string) =>
  tone === "blue"
    ? "bg-blue-50 text-blue-700"
    : tone === "violet"
      ? "bg-violet-50 text-violet-700"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700"
        : tone === "rose"
          ? "bg-rose-50 text-rose-700"
          : "bg-emerald-50 text-emerald-700";

const sampleLgas: Record<string, string[]> = {
  Kaduna: ["Chikun", "Igabi", "Kajuru", "Zaria"],
  Kano: ["Tarauni", "Gwale", "Dala", "Kumbotso"],
  Lagos: ["Ikeja", "Epe", "Ikorodu", "Badagry"],
  Niger: ["Bosso", "Suleja", "Bida", "Kontagora"],
  FCT: ["Abaji", "Bwari", "Gwagwalada", "Kuje"],
  Bauchi: ["Bauchi", "Toro", "Dass", "Ningi"],
  Borno: ["Maiduguri", "Jere", "Bama", "Konduga"],
  Rivers: ["Port Harcourt", "Obio/Akpor", "Eleme", "Bonny"],
};

const reinspectionReasons = [
  "Incomplete evidence photographs",
  "Coordinate variance outside tolerance",
  "Metering evidence requires confirmation",
  "Technical checklist not fully completed",
];

const correctiveActions = [
  "Upload replacement geotagged evidence",
  "Repeat coordinate capture at project site",
  "Confirm meter serials and commissioning record",
  "Complete technical checklist and resubmit",
];

function verificationRate(total: number, verified: number) {
  return total ? `${Math.round((verified / total) * 100)}%` : "0%";
}

function lgaForProject(project: Project, index: number) {
  const options = sampleLgas[project.state] ?? [
    `${project.state} Central`,
    `${project.state} North`,
    `${project.state} South`,
  ];
  return options[index % options.length];
}

function buildReportData(reportId: string, projects: Project[]): ReportData {
  if (reportId === "inspection") {
    return {
      columns: [
        { key: "inspection", label: "Inspection ID" },
        { key: "project", label: "Project" },
        { key: "state", label: "State" },
        { key: "evidence", label: "Evidence" },
        { key: "coordinates", label: "Coordinates" },
        { key: "qa", label: "QA Decision" },
      ],
      rows: projects.slice(0, 20).map((project, index) => ({
        inspection: `INS-${String(index + 101).padStart(4, "0")}`,
        project: project.name,
        state: project.state,
        evidence: `${5 + (index % 5)} photos`,
        coordinates: `${(9.05 + (index % 8) * 0.37).toFixed(4)}, ${(7.48 + (index % 6) * 0.41).toFixed(4)}`,
        qa: project.verified ? "Approved" : "Pending QA",
      })),
    };
  }

  if (reportId === "contractor") {
    const grouped = new Map<
      string,
      { projects: number; verified: number; pending: number; kw: number }
    >();
    projects.forEach((project) => {
      const current = grouped.get(project.contractor) ?? {
        projects: 0,
        verified: 0,
        pending: 0,
        kw: 0,
      };
      current.projects += 1;
      current.verified += project.verified ? 1 : 0;
      current.pending += project.verified ? 0 : 1;
      current.kw += project.kw;
      grouped.set(project.contractor, current);
    });
    return {
      columns: [
        { key: "contractor", label: "Contractor" },
        { key: "projects", label: "Projects" },
        { key: "capacity", label: "Capacity" },
        { key: "verified", label: "Verified" },
        { key: "pending", label: "Pending" },
        { key: "rate", label: "Verification Rate" },
      ],
      rows: [...grouped.entries()]
        .map(([contractor, data]) => ({
          contractor,
          projects: data.projects,
          capacity: `${(data.kw / 1000).toFixed(2)} MW`,
          verified: data.verified,
          pending: data.pending,
          rate: verificationRate(data.projects, data.verified),
        }))
        .sort((a, b) => Number(b.projects) - Number(a.projects)),
    };
  }

  if (reportId === "state") {
    const grouped = new Map<
      string,
      { projects: number; verified: number; households: number; kw: number }
    >();
    projects.forEach((project) => {
      const current = grouped.get(project.state) ?? {
        projects: 0,
        verified: 0,
        households: 0,
        kw: 0,
      };
      current.projects += 1;
      current.verified += project.verified ? 1 : 0;
      current.households += project.households;
      current.kw += project.kw;
      grouped.set(project.state, current);
    });
    return {
      columns: [
        { key: "state", label: "State" },
        { key: "projects", label: "Projects" },
        { key: "capacity", label: "Capacity" },
        { key: "households", label: "Households" },
        { key: "verified", label: "Verified" },
        { key: "rate", label: "Verification Rate" },
      ],
      rows: [...grouped.entries()]
        .map(([state, data]) => ({
          state,
          projects: data.projects,
          capacity: `${(data.kw / 1000).toFixed(2)} MW`,
          households: data.households.toLocaleString(),
          verified: data.verified,
          rate: verificationRate(data.projects, data.verified),
        }))
        .sort((a, b) => Number(b.projects) - Number(a.projects)),
    };
  }

  if (reportId === "lga") {
    const grouped = new Map<
      string,
      { state: string; projects: number; verified: number; households: number }
    >();
    projects.forEach((project, index) => {
      const lga = lgaForProject(project, index);
      const key = `${project.state}-${lga}`;
      const current = grouped.get(key) ?? {
        state: project.state,
        projects: 0,
        verified: 0,
        households: 0,
      };
      current.projects += 1;
      current.verified += project.verified ? 1 : 0;
      current.households += project.households;
      grouped.set(key, current);
    });
    return {
      columns: [
        { key: "lga", label: "LGA" },
        { key: "state", label: "State" },
        { key: "projects", label: "Projects" },
        { key: "households", label: "Households" },
        { key: "backlog", label: "Verification Backlog" },
        { key: "rate", label: "Verification Rate" },
      ],
      rows: [...grouped.entries()]
        .map(([key, data]) => ({
          lga: key.slice(data.state.length + 1),
          state: data.state,
          projects: data.projects,
          households: data.households.toLocaleString(),
          backlog: data.projects - data.verified,
          rate: verificationRate(data.projects, data.verified),
        }))
        .sort((a, b) => Number(b.projects) - Number(a.projects))
        .slice(0, 30),
    };
  }

  if (reportId === "reinspection") {
    const candidates = projects.filter((project) => !project.verified);
    return {
      columns: [
        { key: "reference", label: "Reference" },
        { key: "project", label: "Project" },
        { key: "reason", label: "Reason for Return" },
        { key: "action", label: "Corrective Action" },
        { key: "status", label: "Resolution" },
      ],
      rows: candidates.slice(0, 24).map((project, index) => ({
        reference: `REI-${String(index + 31).padStart(4, "0")}`,
        project: project.name,
        reason: reinspectionReasons[index % reinspectionReasons.length],
        action: correctiveActions[index % correctiveActions.length],
        status: index % 3 === 0 ? "Re-inspection scheduled" : "Awaiting correction",
      })),
    };
  }

  if (reportId === "progress") {
    return {
      columns: [
        { key: "project", label: "Project" },
        { key: "programme", label: "Programme" },
        { key: "planned", label: "Planned" },
        { key: "delivered", label: "Delivered" },
        { key: "variance", label: "Variance" },
        { key: "status", label: "Report Status" },
      ],
      rows: projects.slice(0, 30).map((project, index) => {
        const planned = 72 + (index % 5) * 6;
        const delivered = project.verified
          ? Math.min(100, planned + 2)
          : Math.max(38, planned - (8 + (index % 4) * 3));
        return {
          project: project.name,
          programme: project.programme,
          planned: `${planned}%`,
          delivered: `${delivered}%`,
          variance: `${delivered - planned > 0 ? "+" : ""}${delivered - planned}%`,
          status: project.status,
        };
      }),
    };
  }

  return {
    columns: [
      { key: "project", label: "Project" },
      { key: "programme", label: "Programme" },
      { key: "state", label: "State" },
      { key: "component", label: "Component" },
      { key: "contractor", label: "Contractor" },
      { key: "capacity", label: "Capacity" },
      { key: "households", label: "Households" },
      { key: "verification", label: "Verification" },
    ],
    rows: projects.slice(0, 30).map((project) => ({
      project: project.name,
      programme: project.programme,
      state: project.state,
      component: project.component,
      contractor: project.contractor,
      capacity: `${project.kw.toLocaleString()} kW`,
      households: project.households.toLocaleString(),
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
  const [selected, setSelected] = useState<ReportDefinition>(definitions[0]);
  const [programme, setProgramme] = useState("All");
  const [state, setState] = useState("All");
  const [period, setPeriod] = useState("All periods");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");

  const programmes = useMemo(
    () => ["All", ...new Set(projects.map((project) => project.programme))],
    [projects],
  );
  const states = useMemo(
    () => ["All", ...new Set(projects.map((project) => project.state))],
    [projects],
  );
  const periods = useMemo(
    () => ["All periods", ...new Set(projects.map((project) => project.month))],
    [projects],
  );

  const matching = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return projects.filter(
      (project) =>
        (programme === "All" || project.programme === programme) &&
        (state === "All" || project.state === state) &&
        (period === "All periods" || project.month === period) &&
        (!normalizedQuery ||
          [project.name, project.contractor, project.component, project.state]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery)),
    );
  }, [projects, programme, state, period, query]);

  const reportData = useMemo(
    () => buildReportData(selected.id, matching),
    [selected.id, matching],
  );

  const totals = {
    records: matching.length,
    verified: matching.filter((project) => project.verified).length,
    pending: matching.filter((project) => !project.verified).length,
    reportTypes: definitions.length,
  };

  const selectReport = (report: ReportDefinition) => {
    setSelected(report);
    setNotice(`${report.title} loaded with sample data.`);
  };

  const exportCsv = () => {
    const rows = [
      reportData.columns.map((column) => column.label),
      ...reportData.rows.map((row) =>
        reportData.columns.map((column) => row[column.key] ?? ""),
      ),
    ];
    const csv = rows
      .map((row) =>
        row
          .map(
            (value) =>
              `"${String(value).replace(/"/g, '""')}"`,
          )
          .join(","),
      )
      .join("\n");
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    anchor.download = `${selected.id}-report-sample.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    setNotice(`${selected.title} data exported successfully.`);
  };

  const generate = () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setNotice("Print preview was blocked by the browser. Allow pop-ups and try again.");
      return;
    }
    popup.opener = null;
    const scope = `${programme === "All" ? "All programmes" : programme} · ${state === "All" ? "All states" : state} · ${period}`;
    const tableHead = reportData.columns
      .map((column) => `<th>${escapeHtml(column.label)}</th>`)
      .join("");
    const tableBody = reportData.rows
      .map(
        (row) =>
          `<tr>${reportData.columns
            .map((column) => `<td>${escapeHtml(row[column.key] ?? "")}</td>`)
            .join("")}</tr>`,
      )
      .join("");

    popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(selected.title)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:Arial,sans-serif;margin:0;padding:28px;color:#173b2a;background:#fff}
    .header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;border-bottom:3px solid #08733f;padding-bottom:16px;margin-bottom:18px}
    h1{font-size:22px;margin:0 0 6px}.brand{font-size:11px;font-weight:700;color:#08733f;text-transform:uppercase;letter-spacing:.12em}
    .meta{font-size:11px;color:#64748b;margin-top:5px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:18px 0}
    .card{border:1px solid #dfe7e2;border-radius:8px;padding:12px}.card b{display:block;font-size:18px;color:#173b2a}.card span{font-size:10px;color:#64748b}
    table{width:100%;border-collapse:collapse;font-size:10px}th{background:#eef8f1;color:#173b2a;text-align:left;padding:8px;border:1px solid #dfe7e2}td{padding:8px;border:1px solid #e5e7eb;vertical-align:top}
    .footer{margin-top:18px;font-size:9px;color:#64748b}.sample{color:#9a6500;font-weight:700}
    @media print{body{padding:12px}.no-print{display:none}}
  </style>
</head>
<body>
  <div class="header"><div><div class="brand">Rural Electrification Agency · Veritas</div><h1>${escapeHtml(selected.title)}</h1><div class="meta">${escapeHtml(scope)}</div></div><div class="sample">SAMPLE DATA</div></div>
  <div class="summary"><div class="card"><b>${matching.length}</b><span>Projects in scope</span></div><div class="card"><b>${totals.verified}</b><span>Verified</span></div><div class="card"><b>${reportData.rows.length}</b><span>Report rows</span></div></div>
  <table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody || '<tr><td colspan="10">No records match the current filters.</td></tr>'}</tbody></table>
  <div class="footer">Generated from Veritas sample data for dashboard demonstration.</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),150);</script>
</body>
</html>`);
    popup.document.close();
    setNotice(`${selected.title} print preview opened successfully.`);
  };

  return (
    <div className="space-y-4 pb-8 pt-4">
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileBarChart className="h-5 w-5 text-[#08733f]" />
            <h2 className="text-xl font-bold text-[#173b2a]">Reports Centre</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Generate consistent inspection, delivery and performance reports for REA decision-making.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700">
          <ShieldCheck className="h-4 w-4" />
          Demo mode · sample data
        </div>
      </section>

      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          {notice}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [FileBarChart, "Report Templates", totals.reportTypes, "Approved report formats"],
          [FileCheck2, "Report Records", totals.records.toLocaleString(), "Records in the current scope"],
          [ShieldCheck, "Ready to Issue", totals.verified.toLocaleString(), "Verified sample records available"],
          [RefreshCw, "Require Review", totals.pending.toLocaleString(), "Records not yet report-ready"],
        ].map(([Icon, label, value, detail]: any) => (
          <article
            key={label}
            className="group min-h-[112px] rounded-lg border border-slate-200 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9dceb0] hover:shadow-md"
          >
            <div className="flex h-full flex-col items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-[#08733f] transition-all duration-200 group-hover:bg-[#08733f] group-hover:text-white">
                <Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
              </div>
              <p className="mt-2 text-sm font-semibold text-[#263c31]">{label}</p>
              <p className="mt-1 text-[23px] font-bold leading-none tracking-tight text-[#13281e]">{value}</p>
              <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search project, contractor or component"
              className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs"
            />
          </label>
          <select
            value={programme}
            onChange={(event) => setProgramme(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
          >
            {programmes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={state}
            onChange={(event) => setState(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
          >
            {states.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
          >
            {periods.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_.75fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          {definitions.map((report, index) => {
            const Icon = report.icon;
            const active = selected.id === report.id;
            return (
              <button
                key={report.id}
                type="button"
                onClick={() => selectReport(report)}
                className={`group rounded-xl border p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  active
                    ? "border-[#08733f] bg-[#f3fbf5] ring-1 ring-[#08733f]/10"
                    : "border-slate-200 bg-white hover:border-[#9dceb0]"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:bg-[#08733f] group-hover:text-white ${toneClass(report.tone)}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Report {index + 1}</p>
                    <h3 className="mt-1 text-sm font-bold text-[#173b2a]">{report.title}</h3>
                    <p className="mt-2 text-[10px] leading-4 text-slate-500">{report.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {report.includes.map((item) => (
                        <span
                          key={item}
                          className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-semibold text-slate-500"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-[10px] font-bold text-[#08733f]">Open sample report →</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-[110px]">
          <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneClass(selected.tone)}`}>
            {(() => {
              const Icon = selected.icon;
              return <Icon className="h-6 w-6" />;
            })()}
          </div>
          <p className="mt-4 text-[9px] font-bold uppercase tracking-wider text-[#08733f]">Selected report</p>
          <h3 className="mt-1 text-lg font-bold text-[#173b2a]">{selected.title}</h3>
          <p className="mt-2 text-xs leading-5 text-slate-500">{selected.description}</p>
          <dl className="mt-5 divide-y divide-slate-100 text-xs">
            <div className="flex justify-between py-3">
              <dt className="text-slate-500">Programme</dt>
              <dd className="font-bold">{programme}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-slate-500">State</dt>
              <dd className="font-bold">{state}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-slate-500">Period</dt>
              <dd className="font-bold">{period}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-slate-500">Projects</dt>
              <dd className="font-bold">{matching.length}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-slate-500">Preview rows</dt>
              <dd className="font-bold">{reportData.rows.length}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={generate}
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#08733f] text-xs font-bold text-white hover:bg-[#065d32]"
          >
            <FileText className="h-4 w-4" />
            Generate PDF / Print
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Export report data
          </button>
        </aside>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#08733f]">Live preview</p>
            <h3 className="mt-1 text-sm font-bold text-[#173b2a]">{selected.title}</h3>
          </div>
          <span className="w-fit rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-bold text-amber-700">
            SAMPLE DATA · {reportData.rows.length} ROWS
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[10px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {reportData.columns.map((column) => (
                  <th key={column.key} className="whitespace-nowrap px-4 py-3 font-bold uppercase tracking-wider">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportData.rows.length ? (
                reportData.rows.slice(0, 12).map((row, rowIndex) => (
                  <tr key={`${selected.id}-${rowIndex}`} className="hover:bg-slate-50/70">
                    {reportData.columns.map((column) => (
                      <td key={column.key} className="max-w-[260px] px-4 py-3 text-slate-600">
                        {row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={reportData.columns.length} className="px-5 py-10 text-center text-xs text-slate-500">
                    No sample records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {reportData.rows.length > 12 && (
          <div className="border-t border-slate-100 px-5 py-3 text-[10px] text-slate-500">
            Showing the first 12 rows in the dashboard preview. Export or print to include all {reportData.rows.length} rows.
          </div>
        )}
      </section>
    </div>
  );
}
