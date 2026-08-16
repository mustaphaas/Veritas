import { useMemo, useState } from "react";
import {
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderKanban,
  Home,
  MapPin,
  Plus,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Video,
  X,
  Zap,
} from "lucide-react";
import RoleDashboardShell from "../components/RoleDashboardShell";
import { useLocation, useNavigate } from "react-router-dom";
import { projects, type Project } from "../lib/dashboard-data";
import {
  fieldOfficers,
  getAssignmentDisplayStatus,
  useInspectionWorkflow,
  type InspectionAssignment,
} from "../lib/inspection-workflow";

const navigation = [
  { label: "Overview", icon: Home, href: "/consultant-admin" },
  {
    label: "Review Queue",
    icon: ClipboardCheck,
    href: "/consultant-admin/reviews",
  },
  { label: "Projects", icon: FolderKanban, href: "/consultant-admin/projects" },
  {
    label: "Field Officers",
    icon: UsersRound,
    href: "/consultant-admin/officers",
  },
  {
    label: "Verification",
    icon: ShieldCheck,
    href: "/consultant-admin/verification",
  },
  { label: "Analytics", icon: BarChart3, href: "/consultant-admin/analytics" },
  { label: "Reports", icon: FileText, href: "/consultant-admin/reports" },
];

const consultantViewPaths: Record<string, string> = {
  Overview: "/consultant-admin",
  "Review Queue": "/consultant-admin/reviews",
  Projects: "/consultant-admin/projects",
  "Field Officers": "/consultant-admin/officers",
  Verification: "/consultant-admin/verification",
  Analytics: "/consultant-admin/analytics",
  Reports: "/consultant-admin/reports",
  Settings: "/consultant-admin/settings",
  Notifications: "/consultant-admin/notifications",
};

const consultantPathViews: Record<string, string> = Object.fromEntries(
  Object.entries(consultantViewPaths).map(([view, path]) => [path, view]),
);
const inputClass =
  "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-[#173b2a] outline-none focus:border-[#08733f]";

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "green",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof FolderKanban;
  tone?: "green" | "amber" | "blue";
}) {
  const iconStyle =
    tone === "amber"
      ? "bg-[#fff2cc] text-[#d28b00]"
      : tone === "blue"
        ? "bg-[#eaf2fc] text-[#3974b6]"
        : "bg-[#e9f7ed] text-[#119653]";
  return (
    <article
      className={`min-h-[116px] min-w-[205px] flex-1 rounded-lg border p-4 ${tone === "amber" ? "border-[#f1dfaf] bg-[#fffaf0]" : "border-slate-200 bg-white"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconStyle}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[#263c31]">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none text-[#13281e]">
            {value}
          </p>
          <p className="mt-3 text-[10px] text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: InspectionAssignment["status"] }) {
  const displayStatus = getAssignmentDisplayStatus(status);
  const style =
    displayStatus === "Verified"
      ? "border-[#08733f] bg-[#08733f] text-white"
      : displayStatus === "Approved"
        ? "border-[#b9dfc5] bg-[#eaf8ef] text-[#08733f]"
        : displayStatus === "Draft"
          ? "border-[#c8daef] bg-[#eef5fc] text-[#356ca5]"
          : "border-[#f0d88d] bg-[#fff8e5] text-[#956300]";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${style}`}
    >
      {displayStatus}
    </span>
  );
}

function AssignProjectModal({ onClose }: { onClose: () => void }) {
  const { assignments, assignProject } = useInspectionWorkflow();
  const available = projects.filter(
    (project) => !assignments.some((item) => item.projectName === project.name),
  );
  const [projectName, setProjectName] = useState(available[0]?.name ?? "");
  const [officer, setOfficer] = useState(fieldOfficers[0].name);
  const defaultDue = new Date(Date.now() + 7 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [dueDate, setDueDate] = useState(defaultDue);
  const selectedProject = available.find(
    (project) => project.name === projectName,
  );
  const submit = () => {
    if (!selectedProject || !officer || !dueDate) return;
    assignProject(
      selectedProject,
      officer,
      new Date(`${dueDate}T17:00:00`).toISOString(),
    );
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5">
      <section className="w-full max-w-xl rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-xl sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#173b2a]">Assign project</h2>
            <p className="mt-1 text-xs text-slate-500">
              Send project details and location to a field officer.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-5 space-y-4">
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Project
            <select
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              className={inputClass}
            >
              {available.map((project) => (
                <option key={project.name}>{project.name}</option>
              ))}
            </select>
          </label>
          {selectedProject && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-[#f5faf6] p-3 text-[10px]">
              <span>
                <b>Programme:</b> {selectedProject.programme}
              </span>
              <span>
                <b>Component:</b> {selectedProject.component}
              </span>
              <span>
                <b>State:</b> {selectedProject.state}
              </span>
              <span>
                <b>Contractor:</b> {selectedProject.contractor}
              </span>
            </div>
          )}
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Field officer
            <select
              value={officer}
              onChange={(event) => setOfficer(event.target.value)}
              className={inputClass}
            >
              {fieldOfficers.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} · {item.zone}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Inspection due date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!selectedProject}
            className="flex items-center gap-2 rounded-md bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Assign project
          </button>
        </div>
      </section>
    </div>
  );
}

function ReviewModal({
  assignment,
  onClose,
}: {
  assignment: InspectionAssignment;
  onClose: () => void;
}) {
  const { reviewReport } = useInspectionWorkflow();
  const [note, setNote] = useState(assignment.report?.reviewNote ?? "");
  const report = assignment.report;
  const reviewable = assignment.status === "Submitted";
  const decide = (decision: "Approved" | "Re-inspection") => {
    if (decision === "Re-inspection" && !note.trim()) return;
    reviewReport(assignment.id, decision, note);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5">
      <section className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-[#f7f9f7] shadow-2xl sm:rounded-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-[#173b2a]">
                Quality assurance review
              </h2>
              <StatusPill status={assignment.status} />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {assignment.id} · {assignment.projectName} · {assignment.officer}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        {report ? (
          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Location", `${report.community}, ${report.state}`],
                [
                  "GPS",
                  `${report.latitude.toFixed(5)}, ${report.longitude.toFixed(5)}`,
                ],
                ["Capacity", report.capacity],
                ["Beneficiaries", report.beneficiaries],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    {label}
                  </p>
                  <p className="mt-1.5 text-xs font-semibold text-[#173b2a]">
                    {value || "Not provided"}
                  </p>
                </div>
              ))}
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-xs font-bold text-[#173b2a]">
                  Inspection findings
                </h3>
                <dl className="mt-3 space-y-3 text-xs">
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-slate-500">
                      Equipment
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {report.equipmentInstalled}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-slate-500">
                      Observations
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {report.observations}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-slate-500">
                      Defects
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {report.defects || "None reported"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[9px] font-bold uppercase text-slate-500">
                      Recommendations
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {report.recommendations}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="text-xs font-bold text-[#173b2a]">
                  Evidence & integrity checks
                </h3>
                <div className="mt-3 space-y-2">
                  {[
                    ["GPS inside geofence", Boolean(assignment.arrival)],
                    [
                      `${report.evidence.length} tagged evidence file(s)`,
                      report.evidence.length > 0,
                    ],
                    ["Community signature", Boolean(report.communitySignature)],
                    [
                      "Contractor signature",
                      Boolean(report.contractorSignature),
                    ],
                    ["Device & time audit trail", assignment.audit.length > 0],
                  ].map(([label, ok]) => (
                    <div
                      key={String(label)}
                      className="flex items-center justify-between rounded-md bg-slate-50 p-2.5 text-[10px] font-semibold text-slate-600"
                    >
                      <span>{String(label)}</span>
                      {ok ? (
                        <CheckCircle2 className="h-4 w-4 text-[#08733f]" />
                      ) : (
                        <X className="h-4 w-4 text-red-600" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-[#173b2a]">
                    Photo &amp; video evidence
                  </h3>
                  <p className="mt-1 text-[9px] text-slate-500">
                    Original field capture with automatic inspection stamps
                  </p>
                </div>
                <span className="rounded-full bg-[#edf8f0] px-2.5 py-1 text-[9px] font-bold text-[#08733f]">
                  {report.evidence.length} files
                </span>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {report.evidence.map((item) => (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950"
                  >
                    <div className="relative h-48">
                      {item.previewUrl && item.type === "photo" ? (
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="h-full w-full object-cover"
                        />
                      ) : item.previewUrl && item.type === "video" ? (
                        <video
                          src={item.previewUrl}
                          controls
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center bg-slate-800 text-slate-300">
                          {item.type === "photo" ? (
                            <Camera className="h-8 w-8" />
                          ) : (
                            <Video className="h-8 w-8" />
                          )}
                          <span className="mt-2 text-[10px]">
                            Captured {item.type}
                          </span>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 p-2 text-[8px] leading-4 text-white backdrop-blur-sm">
                        <p className="font-bold">{item.projectId}</p>
                        <p>
                          GPS {item.latitude.toFixed(6)},{" "}
                          {item.longitude.toFixed(6)}
                        </p>
                        <p>
                          {new Date(item.capturedAt).toLocaleString()} ·{" "}
                          {item.inspector} · {item.deviceType} ({item.deviceId})
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white px-3 py-2 text-[9px]">
                      <span className="max-w-[75%] truncate font-semibold text-[#173b2a]">
                        {item.name}
                      </span>
                      <span className="uppercase text-slate-400">
                        {item.type}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-xs font-bold text-[#173b2a]">Audit trail</h3>
              <div className="mt-3 space-y-2">
                {assignment.audit.map((event) => (
                  <div
                    key={event.id}
                    className="grid gap-1 text-[10px] sm:grid-cols-[135px_1fr_auto]"
                  >
                    <span className="text-slate-400">
                      {new Date(event.at).toLocaleString()}
                    </span>
                    <span className="font-semibold text-slate-700">
                      {event.action}
                    </span>
                    <span className="text-slate-400">
                      {event.actor} · {event.deviceType} · {event.deviceId}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              QA note
              <textarea
                value={note}
                readOnly={!reviewable}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add approval note or describe what must be corrected…"
                className="mt-1.5 min-h-24 w-full rounded-md border border-slate-200 bg-white p-3 text-xs font-normal normal-case text-[#173b2a] outline-none focus:border-[#08733f]"
              />
            </label>
            {reviewable && (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  onClick={() => decide("Re-inspection")}
                  disabled={!note.trim()}
                  className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 disabled:opacity-40"
                >
                  Return for re-inspection
                </button>
                <button
                  onClick={() => decide("Approved")}
                  className="flex items-center gap-2 rounded-md bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white"
                >
                  <CheckCircle2 className="h-4 w-4" /> Approve report
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">
            No report data has been submitted for this assignment.
          </div>
        )}
      </section>
    </div>
  );
}

function ConsultantWorkspace({
  view,
  assignments,
  onAssign,
  onReview,
  onMap,
}: {
  view: string;
  assignments: InspectionAssignment[];
  onAssign: () => void;
  onReview: (assignment: InspectionAssignment) => void;
  onMap: (assignment: InspectionAssignment) => void;
}) {
  if (view === "Field Officers") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-[#173b2a]">Field Officers</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            Live workload and inspection outcomes
          </p>
        </div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
          {fieldOfficers.map((officer) => {
            const rows = assignments.filter(
              (item) => item.officer === officer.name,
            );
            const approved = rows.filter((item) =>
              ["Approved", "Verified"].includes(item.status),
            ).length;
            return (
              <article key={officer.name} className="bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-[#173b2a]">
                      {officer.name}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {officer.zone} · {officer.device}
                    </p>
                  </div>
                  <span className="rounded-full bg-[#edf8f0] px-2 py-1 text-[9px] font-bold text-[#08733f]">
                    Active
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-slate-50 p-2">
                    <b className="block text-lg text-[#173b2a]">
                      {rows.length}
                    </b>
                    <span className="text-[8px] text-slate-500">Assigned</span>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <b className="block text-lg text-[#08733f]">{approved}</b>
                    <span className="text-[8px] text-slate-500">Approved</span>
                  </div>
                  <div className="rounded-md bg-slate-50 p-2">
                    <b className="block text-lg text-amber-600">
                      {
                        rows.filter((item) => item.status === "Re-inspection")
                          .length
                      }
                    </b>
                    <span className="text-[8px] text-slate-500">
                      Re-inspect
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    );
  }
  if (view === "Analytics") {
    const byContractor = [
      ...new Set(assignments.map((item) => item.contractor)),
    ].map((contractor) => {
      const rows = assignments.filter((item) => item.contractor === contractor);
      return {
        contractor,
        total: rows.length,
        approved: rows.filter((item) =>
          ["Approved", "Verified"].includes(item.status),
        ).length,
        submitted: rows.filter((item) => item.status === "Submitted").length,
      };
    });
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-[#173b2a]">
          Inspection Analytics
        </h2>
        <div className="mt-5 space-y-4">
          {byContractor.map((row) => {
            const rate = row.total
              ? Math.round((row.approved / row.total) * 100)
              : 0;
            return (
              <div key={row.contractor}>
                <div className="flex justify-between text-xs">
                  <strong>{row.contractor}</strong>
                  <span className="text-slate-500">
                    {row.approved} approved · {row.submitted} awaiting QA ·{" "}
                    {rate}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[#119653]"
                    style={{ width: `${rate}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }
  if (view === "Settings") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-[#173b2a]">
          Consultant Workspace Settings
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["QA approval rule", "Submitted reports only"],
            ["Re-inspection rule", "Reason and fresh GPS required"],
            ["Evidence policy", "GPS and time stamp required"],
            ["Assignment authority", "Consultant Admin"],
            ["REA visibility", "Approved reports only"],
            ["Audit logging", "Enabled for all actions"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-slate-100 bg-[#f7faf8] p-4"
            >
              <p className="text-[9px] font-bold uppercase text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-xs font-bold text-[#173b2a]">{value}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }
  const rows =
    view === "Review Queue"
      ? assignments.filter((item) => item.status === "Submitted")
      : view === "Verification"
        ? assignments.filter((item) =>
            ["Submitted", "Approved", "Verified", "Re-inspection"].includes(
              item.status,
            ),
          )
        : view === "Reports"
          ? assignments.filter(
              (item) =>
                item.report &&
                ["Submitted", "Approved", "Verified"].includes(item.status),
            )
          : view === "Notifications"
            ? assignments.filter((item) =>
                ["Submitted", "Re-inspection"].includes(item.status),
              )
            : assignments;
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-[#173b2a]">{view}</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            Workflow actions are restricted by the current inspection status.
          </p>
        </div>
        {view === "Projects" && (
          <button
            onClick={onAssign}
            className="flex items-center gap-2 rounded-md bg-[#08733f] px-4 py-2.5 text-[10px] font-bold text-white"
          >
            <Plus className="h-4 w-4" /> Assign project
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((item) => (
          <div
            key={item.id}
            className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <p className="text-xs font-bold text-[#173b2a]">
                {item.projectName}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {item.id} · {item.officer} · {item.community}, {item.state}
              </p>
              {item.status === "Re-inspection" && (
                <p className="mt-1 text-[10px] font-semibold text-red-700">
                  Returned: {item.report?.reviewNote}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={item.status} />
              {item.report ? (
                <button
                  onClick={() => onReview(item)}
                  className="rounded-md border border-[#8bcba0] px-3 py-2 text-[10px] font-bold text-[#08733f]"
                >
                  {item.status === "Submitted"
                    ? "Review report"
                    : "View report"}
                </button>
              ) : (
                <button
                  onClick={() => onMap(item)}
                  className="rounded-md border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"
                >
                  View location
                </button>
              )}
            </div>
          </div>
        ))}
        {!rows.length && (
          <p className="p-8 text-center text-xs text-slate-500">
            No records in this workspace.
          </p>
        )}
      </div>
    </section>
  );
}

export default function ConsultantAdminDashboard() {
  const { assignments } = useInspectionWorkflow();
  const [programmeFilter, setProgrammeFilter] = useState("All Programmes");
  const [stateFilter, setStateFilter] = useState("All States");
  const [officerFilter, setOfficerFilter] = useState("All Field Officers");
  const [assignOpen, setAssignOpen] = useState(false);
  const [reviewing, setReviewing] = useState<InspectionAssignment | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const activeView = consultantPathViews[location.pathname] ?? "Overview";
  const [mapAssignment, setMapAssignment] =
    useState<InspectionAssignment | null>(assignments[0] ?? null);
  const filtered = useMemo(
    () =>
      assignments.filter(
        (item) =>
          (programmeFilter === "All Programmes" ||
            item.programme === programmeFilter) &&
          (stateFilter === "All States" || item.state === stateFilter) &&
          (officerFilter === "All Field Officers" ||
            item.officer === officerFilter),
      ),
    [assignments, programmeFilter, stateFilter, officerFilter],
  );
  const reviewQueue = filtered.filter((item) => item.status === "Submitted");
  const approved = filtered.filter((item) =>
    ["Approved", "Verified"].includes(item.status),
  ).length;
  const pending = filtered.filter(
    (item) => !["Approved", "Submitted", "Verified"].includes(item.status),
  ).length;
  const approvalRate = filtered.length
    ? Math.round((approved / filtered.length) * 100)
    : 0;
  const contractors = [...new Set(filtered.map((item) => item.contractor))]
    .map((name) => {
      const rows = filtered.filter((item) => item.contractor === name);
      return {
        name,
        projects: rows.length,
        approved: rows.filter((item) =>
          ["Approved", "Verified"].includes(item.status),
        ).length,
      };
    })
    .sort((a, b) => b.projects - a.projects)
    .slice(0, 4);
  const team = fieldOfficers.map((officer) => {
    const rows = assignments.filter((item) => item.officer === officer.name);
    return {
      ...officer,
      assigned: rows.length,
      completed: rows.filter((item) =>
        ["Approved", "Verified"].includes(item.status),
      ).length,
      active: rows.filter(
        (item) => !["Approved", "Submitted", "Verified"].includes(item.status),
      ).length,
    };
  });
  const mapTarget =
    (mapAssignment &&
      assignments.find((item) => item.id === mapAssignment.id)) ||
    filtered[0];
  const mapUrl = mapTarget
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapTarget.longitude - 0.045}%2C${mapTarget.latitude - 0.035}%2C${mapTarget.longitude + 0.045}%2C${mapTarget.latitude + 0.035}&layer=mapnik&marker=${mapTarget.latitude}%2C${mapTarget.longitude}`
    : "";
  return (
    <RoleDashboardShell
      title="Consultant Admin Dashboard"
      subtitle="Assign field work, review inspection evidence and monitor programme assurance."
      roleName="Ibrahim Musa · Consultant Admin"
      initials="IM"
      navigation={navigation}
      activeNavigation={activeView}
      onNavigationChange={(label) =>
        navigate(consultantViewPaths[label] ?? "/consultant-admin")
      }
    >
      {activeView !== "Overview" && (
        <ConsultantWorkspace
          view={activeView}
          assignments={filtered}
          onAssign={() => setAssignOpen(true)}
          onReview={setReviewing}
          onMap={(assignment) => {
            setMapAssignment(assignment);
            navigate("/consultant-admin");
          }}
        />
      )}
      <div className={activeView === "Overview" ? "" : "hidden"}>
        <section className="rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_205px]">
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Programme
              <select
                value={programmeFilter}
                onChange={(event) => setProgrammeFilter(event.target.value)}
                className={inputClass}
              >
                <option>All Programmes</option>
                {[...new Set(assignments.map((item) => item.programme))].map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              State
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                className={inputClass}
              >
                <option>All States</option>
                {[...new Set(assignments.map((item) => item.state))].map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
              </select>
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Field officer
              <select
                value={officerFilter}
                onChange={(event) => setOfficerFilter(event.target.value)}
                className={inputClass}
              >
                <option>All Field Officers</option>
                {fieldOfficers.map((item) => (
                  <option key={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => setAssignOpen(true)}
              className="mt-auto flex h-10 items-center justify-center gap-2 rounded-md bg-[#08733f] px-4 text-xs font-bold text-white"
            >
              <Plus className="h-4 w-4" /> Assign project
            </button>
          </div>
        </section>
        <section className="mt-3 flex gap-3 overflow-x-auto pb-1">
          <MetricCard
            label="Assigned Projects"
            value={filtered.length}
            detail="Consultant-managed portfolio"
            icon={FolderKanban}
          />
          <MetricCard
            label="Field Officers"
            value={fieldOfficers.length}
            detail="Across operational zones"
            icon={UsersRound}
            tone="blue"
          />
          <MetricCard
            label="Awaiting QA Review"
            value={reviewQueue.length}
            detail="Submitted field reports"
            icon={Clock3}
            tone="amber"
          />
          <MetricCard
            label="Approved Reports"
            value={approved}
            detail="Ready for REA access"
            icon={CheckCircle2}
          />
          <MetricCard
            label="Approval Rate"
            value={`${approvalRate}%`}
            detail={`${pending} field activities in progress`}
            icon={ShieldCheck}
          />
        </section>
        <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,1fr)]">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <div>
                <h2 className="text-sm font-bold text-[#173b2a]">
                  Interactive Project Map
                </h2>
                <p className="mt-1 text-[10px] text-slate-500">
                  Select an assignment to inspect its field location
                </p>
              </div>
              {mapTarget && <StatusPill status={mapTarget.status} />}
            </div>
            {mapTarget ? (
              <div className="grid lg:grid-cols-[1fr_230px]">
                <iframe
                  title="Consultant project map"
                  src={mapUrl}
                  className="h-[350px] w-full bg-slate-100"
                  loading="lazy"
                />
                <div className="max-h-[350px] overflow-y-auto border-l border-slate-100 p-3">
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    Filtered assignments
                  </p>
                  {filtered.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setMapAssignment(item)}
                      className={`mb-2 w-full rounded-md border p-2.5 text-left ${mapTarget.id === item.id ? "border-[#8bcba0] bg-[#eff9f2]" : "border-slate-100 hover:bg-slate-50"}`}
                    >
                      <p className="truncate text-[10px] font-bold text-[#173b2a]">
                        {item.projectName}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[9px] text-slate-500">
                        <MapPin className="h-3 w-3" /> {item.community},{" "}
                        {item.state}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-10 text-center text-sm text-slate-500">
                No assigned projects match these filters.
              </div>
            )}
          </section>
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <div>
                <h2 className="text-sm font-bold text-[#173b2a]">
                  QA Review Queue
                </h2>
                <p className="mt-1 text-[10px] text-slate-500">
                  Approve or return submitted inspections
                </p>
              </div>
              <span className="rounded-full bg-[#fff4d9] px-2.5 py-1 text-[10px] font-bold text-[#a66b00]">
                {reviewQueue.length} pending
              </span>
            </div>
            {reviewQueue.length ? (
              <div className="divide-y divide-slate-100">
                {reviewQueue.map((assignment) => (
                  <div key={assignment.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-[#173b2a]">
                          {assignment.projectName}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {assignment.officer} · {assignment.state}
                        </p>
                      </div>
                      <button
                        onClick={() => setReviewing(assignment)}
                        className="shrink-0 rounded-md border border-[#8bcba0] px-3 py-2 text-[10px] font-bold text-[#08733f]"
                      >
                        Review report
                      </button>
                    </div>
                    <div className="mt-3 flex gap-3 text-[9px] text-slate-500">
                      <span>
                        {assignment.report?.evidence.length ?? 0} evidence files
                      </span>
                      <span>
                        GPS {assignment.arrival ? "verified" : "missing"}
                      </span>
                      <span>{assignment.syncStatus}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-[#119653]" />
                <p className="mt-2 text-xs font-bold text-[#173b2a]">
                  Review queue is clear
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  New field submissions will appear here.
                </p>
              </div>
            )}
          </section>
        </div>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <h2 className="text-sm font-bold text-[#173b2a]">
                Field Officer Activity
              </h2>
              <UserCheck className="h-4 w-4 text-[#08733f]" />
            </div>
            <div className="grid gap-px bg-slate-100 sm:grid-cols-2">
              {team.map((officer) => {
                const rate = officer.assigned
                  ? Math.round((officer.completed / officer.assigned) * 100)
                  : 0;
                return (
                  <div key={officer.name} className="bg-white p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-[#173b2a]">
                          {officer.name}
                        </p>
                        <p className="mt-1 text-[9px] text-slate-500">
                          {officer.zone} · {officer.device}
                        </p>
                      </div>
                      <strong className="text-sm text-[#08733f]">
                        {rate}%
                      </strong>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full bg-[#119653]"
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[9px] text-slate-500">
                      {officer.assigned} assigned · {officer.completed} approved
                      · {officer.active} active
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <h2 className="text-sm font-bold text-[#173b2a]">
                Contractor Performance
              </h2>
              <span className="text-[10px] font-bold text-[#08733f]">
                Live from inspections
              </span>
            </div>
            <div className="divide-y divide-slate-100 px-4">
              {contractors.map((contractor, index) => {
                const rate = contractor.projects
                  ? Math.round(
                      (contractor.approved / contractor.projects) * 100,
                    )
                  : 0;
                return (
                  <div
                    key={contractor.name}
                    className="grid grid-cols-[34px_1fr_auto] items-center gap-3 py-3"
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-md ${index === 3 ? "bg-[#fff4d9] text-[#d18a00]" : "bg-[#eaf8ef] text-[#0c8a49]"}`}
                    >
                      <Zap className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px]">
                        <strong>{contractor.name}</strong>
                        <span className="text-slate-500">
                          {contractor.projects} projects
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full bg-[#08733f]"
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-[#08733f]">
                      {rate}%
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
      {assignOpen && (
        <AssignProjectModal onClose={() => setAssignOpen(false)} />
      )}
      {reviewing && (
        <ReviewModal
          assignment={
            assignments.find((item) => item.id === reviewing.id) ?? reviewing
          }
          onClose={() => setReviewing(null)}
        />
      )}
    </RoleDashboardShell>
  );
}
