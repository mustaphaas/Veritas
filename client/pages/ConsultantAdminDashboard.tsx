import { useMemo, useState } from "react";
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
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileText,
  FolderKanban,
  Home,
  ListChecks,
  MapPin,
  ShieldCheck,
  UserCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import RoleDashboardShell from "../components/RoleDashboardShell";
import {
  projects,
  summarizePortfolio,
  type Project,
} from "../lib/dashboard-data";

const consultantPortfolio = projects.filter((_, index) => index % 4 === 0);
const fieldTeam = [
  { name: "Amina Yusuf", zone: "North West", completed: 18, assigned: 21 },
  { name: "Chinedu Okafor", zone: "South East", completed: 16, assigned: 20 },
  { name: "Fatima Bello", zone: "North East", completed: 14, assigned: 19 },
  { name: "Tunde Adebayo", zone: "South West", completed: 15, assigned: 22 },
];

const navigation = [
  { label: "Overview", icon: Home },
  { label: "Review Queue", icon: ClipboardCheck },
  { label: "Projects", icon: FolderKanban },
  { label: "Field Officers", icon: UsersRound },
  { label: "Verification", icon: ShieldCheck },
  { label: "Analytics", icon: BarChart3 },
  { label: "Reports", icon: FileText },
];

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

function ReviewStatus({ project }: { project: Project }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${project.status === "Pending" ? "border-[#f0d88d] bg-[#fff8e5] text-[#956300]" : "border-[#c8daef] bg-[#eef5fc] text-[#356ca5]"}`}
    >
      {project.status === "Pending" ? "Awaiting review" : "Submitted"}
    </span>
  );
}

export default function ConsultantAdminDashboard() {
  const [programmeFilter, setProgrammeFilter] = useState("All Programmes");
  const [stateFilter, setStateFilter] = useState("All States");
  const [monthFilter, setMonthFilter] = useState("All Months");
  const filteredPortfolio = useMemo(
    () =>
      consultantPortfolio.filter(
        (project) =>
          (programmeFilter === "All Programmes" ||
            project.programme === programmeFilter) &&
          (stateFilter === "All States" || project.state === stateFilter) &&
          (monthFilter === "All Months" || project.month === monthFilter),
      ),
    [programmeFilter, stateFilter, monthFilter],
  );
  const summary = summarizePortfolio(filteredPortfolio);
  const reviewQueue = filteredPortfolio.filter((project) => !project.verified);
  const programmeOptions = [
    "All Programmes",
    ...new Set(consultantPortfolio.map((project) => project.programme)),
  ];
  const stateOptions = [
    "All States",
    ...new Set(consultantPortfolio.map((project) => project.state)),
  ];
  const monthOptions = [
    "All Months",
    ...new Set(consultantPortfolio.map((project) => project.month)),
  ];
  const programmePerformance = [
    ...new Set(filteredPortfolio.map((project) => project.programme)),
  ].map((programme) => {
    const matching = filteredPortfolio.filter(
      (project) => project.programme === programme,
    );
    return {
      programme,
      projects: matching.length,
      verified: matching.filter((project) => project.verified).length,
    };
  });
  const trendData = [
    ...new Set(filteredPortfolio.map((project) => project.month)),
  ]
    .sort((left, right) => Date.parse(`1 ${left}`) - Date.parse(`1 ${right}`))
    .map((month) => {
      const matching = filteredPortfolio.filter(
        (project) => project.month === month,
      );
      const approved = matching.filter((project) => project.verified).length;
      return {
        month: month.slice(0, 3),
        submitted: matching.length,
        approved,
        approvalRate: matching.length
          ? Math.round((approved / matching.length) * 100)
          : 0,
      };
    });

  return (
    <RoleDashboardShell
      title="Consultant Admin Dashboard"
      subtitle="Coordinate field teams, review submissions and monitor programme assurance."
      roleName="Ibrahim Musa · Consultant Admin"
      initials="IM"
      navigation={navigation}
    >
      <section className="rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-3">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_205px]">
          {[
            [
              "Programme",
              programmeFilter,
              setProgrammeFilter,
              programmeOptions,
            ],
            ["State", stateFilter, setStateFilter, stateOptions],
            ["Month", monthFilter, setMonthFilter, monthOptions],
          ].map(([label, value, setter, options]) => (
            <label key={String(label)} className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                {String(label)}
              </span>
              <select
                value={String(value)}
                onChange={(event) =>
                  (setter as (value: string) => void)(event.target.value)
                }
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#173b2a] outline-none focus:border-[#08733f]"
              >
                {(options as string[]).map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
          ))}
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Field Officer
            </span>
            <select className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-[#173b2a] outline-none focus:border-[#08733f]">
              <option>All Field Officers</option>
              {fieldTeam.map((officer) => (
                <option key={officer.name}>{officer.name}</option>
              ))}
            </select>
          </label>
          <button className="mt-auto flex h-10 items-center justify-center gap-2 rounded-md bg-[#08733f] px-4 text-xs font-bold text-white hover:bg-[#065d32]">
            <ClipboardCheck className="h-4 w-4" /> Review queue (
            {reviewQueue.length})
          </button>
        </div>
      </section>

      <section className="mt-3 flex gap-3 overflow-x-auto pb-1">
        <MetricCard
          label="Active Projects"
          value={summary.projects}
          detail="Consultant-managed portfolio"
          icon={FolderKanban}
        />
        <MetricCard
          label="Field Officers"
          value={fieldTeam.length}
          detail="Across four operational zones"
          icon={UsersRound}
          tone="blue"
        />
        <MetricCard
          label="Reports Submitted"
          value={filteredPortfolio.length}
          detail="Current filtered period"
          icon={FileText}
        />
        <MetricCard
          label="Awaiting Review"
          value={reviewQueue.length}
          detail="Requires consultant action"
          icon={Clock3}
          tone="amber"
        />
        <MetricCard
          label="Approval Rate"
          value={`${summary.verificationRate}%`}
          detail={`${summary.verified} reports approved`}
          icon={CheckCircle2}
        />
      </section>

      <div className="mt-3 grid items-start gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(350px,1fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-[#173b2a]">
                Verification Review Queue
              </h2>
              <p className="mt-1 text-[10px] text-slate-500">
                Field reports awaiting consultant assessment
              </p>
            </div>
            <button className="text-[10px] font-bold text-[#08733f] hover:underline">
              View full queue
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Project</th>
                  <th className="px-3 py-2.5">Officer</th>
                  <th className="px-3 py-2.5">Submitted</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.slice(0, 7).map((project, index) => (
                  <tr key={project.name} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-[#173b2a]">
                        {project.name}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500">
                        <MapPin className="h-3 w-3" /> {project.state} ·{" "}
                        {project.programme}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {fieldTeam[index % fieldTeam.length].name}
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">
                      {index === 0 ? "12 mins ago" : `${index + 1} hours ago`}
                    </td>
                    <td className="px-3 py-3">
                      <ReviewStatus project={project} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="rounded-md border border-[#8bcba0] px-3 py-2 text-[10px] font-bold text-[#08733f] hover:bg-[#f0fbf3]">
                        Review report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-[#173b2a]">
              Field Team Performance
            </h2>
            <UserCheck className="h-4 w-4 text-[#08733f]" />
          </div>
          <div className="divide-y divide-slate-100 px-4">
            {fieldTeam.map((officer) => {
              const rate = Math.round(
                (officer.completed / officer.assigned) * 100,
              );
              return (
                <div key={officer.name} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[#173b2a]">
                        {officer.name}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        {officer.zone}
                      </p>
                    </div>
                    <strong className="text-xs text-[#08733f]">{rate}%</strong>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#119653]"
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[9px] text-slate-500">
                    {officer.completed} of {officer.assigned} assignments
                    completed
                  </p>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#173b2a]">
              Submission &amp; Approval Trend
            </h2>
            <span className="text-[10px] font-semibold text-slate-500">
              Current portfolio
            </span>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={trendData}
                margin={{ top: 8, right: 0, left: -26, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5ece7" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="reports"
                  allowDecimals={false}
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    borderColor: "#dbe7de",
                    fontSize: 11,
                  }}
                />
                <Bar
                  yAxisId="reports"
                  dataKey="submitted"
                  name="Submitted"
                  fill="#cbd5e1"
                  radius={[2, 2, 0, 0]}
                />
                <Bar
                  yAxisId="reports"
                  dataKey="approved"
                  name="Approved"
                  fill="#5bc18d"
                  radius={[2, 2, 0, 0]}
                />
                <Line
                  yAxisId="rate"
                  dataKey="approvalRate"
                  name="Approval rate"
                  type="monotone"
                  stroke="#08733f"
                  strokeWidth={2}
                  dot={{ r: 2.5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
            <h2 className="text-sm font-bold text-[#173b2a]">
              Programme Assurance
            </h2>
            <button className="text-[10px] font-bold text-[#08733f]">
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-100 px-4">
            {programmePerformance.map((row, index) => {
              const rate = row.projects
                ? Math.round((row.verified / row.projects) * 100)
                : 0;
              return (
                <div
                  key={row.programme}
                  className="grid grid-cols-[32px_1fr_auto] items-center gap-3 py-3"
                >
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-md ${index === 3 ? "bg-[#fff4d9] text-[#d18a00]" : "bg-[#eaf8ef] text-[#0c8a49]"}`}
                  >
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex justify-between gap-2 text-[10px]">
                      <strong className="text-[#173b2a]">
                        {row.programme}
                      </strong>
                      <span className="text-slate-500">
                        {row.projects} projects
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-[#08733f]"
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
    </RoleDashboardShell>
  );
}
