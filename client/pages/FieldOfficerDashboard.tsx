import { useMemo, useState } from "react";
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileEdit,
  FileText,
  FolderKanban,
  Home,
  ListChecks,
  MapPin,
  Navigation,
  RefreshCw,
  Route,
  Signal,
  UploadCloud,
  UserRound,
  WifiOff,
  Zap,
} from "lucide-react";
import RoleDashboardShell from "../components/RoleDashboardShell";
import { projects, type Project } from "../lib/dashboard-data";

const fieldAssignments = Array.from(
  { length: 18 },
  (_, index) => projects[(index * 23 + 7) % projects.length],
);

const navigation = [
  { label: "Overview", icon: Home },
  { label: "My Assignments", icon: FolderKanban },
  { label: "Inspections", icon: ClipboardCheck },
  { label: "Draft Reports", icon: FileEdit },
  { label: "Sync Queue", icon: RefreshCw },
  { label: "Profile", icon: UserRound },
];

const scheduleTimes = ["8:30 AM", "10:45 AM", "1:15 PM", "3:30 PM"];

function StatusPill({ project }: { project: Project }) {
  const style = project.verified
    ? "border-[#b9dfc5] bg-[#eaf8ef] text-[#08733f]"
    : project.status === "Pending"
      ? "border-[#f0d88d] bg-[#fff8e5] text-[#956300]"
      : "border-[#c8daef] bg-[#eef5fc] text-[#356ca5]";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${style}`}
    >
      {project.verified ? "Completed" : project.status}
    </span>
  );
}

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
  const colors =
    tone === "amber"
      ? "border-[#f1dfaf] bg-[#fffaf0] text-[#d28b00]"
      : tone === "blue"
        ? "border-[#d8e5f6] bg-[#f4f8fd] text-[#3b73ba]"
        : "border-slate-200 bg-white text-[#119653]";
  return (
    <article
      className={`min-h-[116px] min-w-[205px] flex-1 rounded-lg border p-4 ${colors}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-current/10">
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

export default function FieldOfficerDashboard() {
  const [stateFilter, setStateFilter] = useState("All Assigned States");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const completed = fieldAssignments.filter(
    (project) => project.verified,
  ).length;
  const pending = fieldAssignments.length - completed;
  const drafts = fieldAssignments.filter(
    (project) => project.status === "Submitted",
  ).length;
  const stateOptions = [
    "All Assigned States",
    ...new Set(fieldAssignments.map((project) => project.state)),
  ];
  const filteredAssignments = useMemo(
    () =>
      fieldAssignments.filter(
        (project) =>
          (stateFilter === "All Assigned States" ||
            project.state === stateFilter) &&
          (statusFilter === "All Statuses" ||
            (statusFilter === "Completed"
              ? project.verified
              : !project.verified)),
      ),
    [stateFilter, statusFilter],
  );
  const completionRate = Math.round(
    (completed / fieldAssignments.length) * 100,
  );

  return (
    <RoleDashboardShell
      title="Field Officer Dashboard"
      subtitle="Manage assigned site visits, inspections and field reports."
      roleName="Amina Yusuf · Field Officer"
      initials="AY"
      navigation={navigation}
    >
      <section className="rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-3">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_205px]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Assigned State
            </span>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#173b2a] outline-none focus:border-[#08733f]"
            >
              {stateOptions.map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Assignment Status
            </span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#173b2a] outline-none focus:border-[#08733f]"
            >
              <option>All Statuses</option>
              <option>Completed</option>
              <option>Outstanding</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Schedule
            </span>
            <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#173b2a] outline-none focus:border-[#08733f]">
              <option>This Week</option>
              <option>Next Week</option>
              <option>This Month</option>
            </select>
          </label>
          <button className="mt-auto flex h-10 items-center justify-center gap-2 rounded-md bg-[#08733f] px-4 text-xs font-bold text-white hover:bg-[#065d32]">
            <Navigation className="h-4 w-4" /> Open field route
          </button>
        </div>
      </section>

      <section className="mt-3 flex gap-3 overflow-x-auto pb-1">
        <MetricCard
          label="Assigned Projects"
          value={fieldAssignments.length}
          detail="Across your current territory"
          icon={FolderKanban}
        />
        <MetricCard
          label="Inspections Due"
          value={pending}
          detail="Visits requiring action"
          icon={Clock3}
          tone="amber"
        />
        <MetricCard
          label="Completed"
          value={completed}
          detail="Inspection reports submitted"
          icon={CheckCircle2}
        />
        <MetricCard
          label="Draft Reports"
          value={drafts}
          detail="Saved on this device"
          icon={FileEdit}
          tone="blue"
        />
        <MetricCard
          label="Sync Pending"
          value={2}
          detail="Uploads waiting for network"
          icon={WifiOff}
          tone="amber"
        />
      </section>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(330px,1fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-[#173b2a]">
                Today&apos;s Field Schedule
              </h2>
              <p className="mt-1 text-[10px] text-slate-500">
                Optimised sequence for assigned site visits
              </p>
            </div>
            <span className="rounded-full bg-[#edf8f0] px-2.5 py-1 text-[10px] font-bold text-[#08733f]">
              {Math.min(4, filteredAssignments.length)} visits
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {filteredAssignments.slice(0, 4).map((project, index) => (
              <div
                key={project.name}
                className="grid gap-3 px-4 py-3 sm:grid-cols-[70px_1fr_auto] sm:items-center"
              >
                <div>
                  <p className="text-xs font-bold text-[#173b2a]">
                    {scheduleTimes[index]}
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Visit {index + 1}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#173b2a]">
                    {project.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                    <MapPin className="h-3 w-3 text-[#08733f]" />{" "}
                    {project.state} · {project.component}
                  </p>
                </div>
                <button className="rounded-md border border-[#8bcba0] px-3 py-2 text-[10px] font-bold text-[#08733f] hover:bg-[#f0fbf3]">
                  Start inspection
                </button>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#173b2a]">
              Assignment Progress
            </h2>
            <Signal className="h-4 w-4 text-[#119653]" />
          </div>
          <div className="mt-5 flex items-center gap-5">
            <div
              className="relative h-28 w-28 shrink-0 rounded-full"
              style={{
                background: `conic-gradient(#119653 0 ${completionRate}%, #e7efe9 ${completionRate}% 100%)`,
              }}
            >
              <div className="absolute inset-[15px] flex flex-col items-center justify-center rounded-full bg-white">
                <strong className="text-2xl text-[#173b2a]">
                  {completionRate}%
                </strong>
                <span className="text-[9px] text-slate-500">complete</span>
              </div>
            </div>
            <dl className="min-w-0 flex-1 space-y-3 text-xs">
              <div className="flex justify-between">
                <dt className="text-slate-500">Completed</dt>
                <dd className="font-bold text-[#08733f]">{completed}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Outstanding</dt>
                <dd className="font-bold text-[#c88400]">{pending}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Due this week</dt>
                <dd className="font-bold text-[#173b2a]">6</dd>
              </div>
            </dl>
          </div>
          <div className="mt-5 rounded-md border border-[#f0dca0] bg-[#fff9e9] p-3">
            <p className="text-[10px] font-bold text-[#855d0c]">
              Next deadline
            </p>
            <p className="mt-1 text-xs font-semibold text-[#173b2a]">
              Kaduna Rural Energy Access · Tomorrow, 4:00 PM
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(360px,1fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-[#173b2a]">My Assignments</h2>
            <button className="text-[10px] font-bold text-[#08733f] hover:underline">
              View all assignments
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Programme</th>
                  <th className="px-3 py-2.5">Visit window</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.slice(0, 8).map((project, index) => (
                  <tr key={project.name} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-[#173b2a]">
                        {project.name}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {project.state}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {project.programme}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {index < 3 ? "Today" : `${index + 1} days`}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusPill project={project} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-bold text-[#173b2a]">Field Tools</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {[
              [ClipboardCheck, "New Inspection", "#edf8f0", "#08733f"],
              [Camera, "Capture Evidence", "#eef5fc", "#3974b6"],
              [FileText, "Create Report", "#f5f2fd", "#6b63b5"],
              [UploadCloud, "Sync Data", "#fff7e5", "#c88400"],
            ].map(([Icon, label, background, color]) => (
              <button
                key={String(label)}
                className="flex min-h-[92px] flex-col items-center justify-center rounded-lg border border-slate-100 p-3 text-center"
                style={{ backgroundColor: String(background) }}
              >
                <Icon className="h-6 w-6" style={{ color: String(color) }} />
                <span className="mt-2 text-[10px] font-bold text-[#173b2a]">
                  {String(label)}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-md bg-[#f4faf6] p-3">
            <RefreshCw className="h-5 w-5 text-[#08733f]" />
            <div>
              <p className="text-xs font-semibold text-[#173b2a]">
                Last sync: 6 minutes ago
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                2 evidence files waiting
              </p>
            </div>
          </div>
        </section>
      </div>
    </RoleDashboardShell>
  );
}
