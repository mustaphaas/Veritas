import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Gauge,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { projects, type Project } from "../lib/dashboard-data";

type ProgrammeSummary = {
  name: string;
  projects: number;
  verified: number;
  kw: number;
  households: number;
};

type StatusSummary = {
  name: string;
  value: number;
};

const slideLabels = [
  "National Snapshot",
  "Programme Performance",
  "Verification Pipeline",
  "Management Attention",
  "Delivery Trend",
  "Impact Summary",
];

const monthOrder = [
  "January 2024",
  "February 2024",
  "March 2024",
  "April 2024",
  "May 2024",
  "June 2024",
  "July 2024",
  "August 2024",
  "September 2024",
  "October 2024",
  "November 2024",
  "December 2024",
];

function formatMw(kw: number) {
  const mw = kw / 1000;
  return `${mw.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MW`;
}

function compact(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toLocaleString();
}

function groupProjects(items: Project[], key: "programme" | "state" | "component" | "contractor") {
  const grouped = new Map<string, Project[]>();
  items.forEach((project) => {
    const name = project[key];
    const list = grouped.get(name) ?? [];
    list.push(project);
    grouped.set(name, list);
  });
  return grouped;
}

function ExecutiveDashboard({ onClose, onOpenOverview }: { onClose: () => void; onOpenOverview: () => void }) {
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  const portfolio = useMemo(() => {
    const verified = projects.filter((project) => project.verified).length;
    const kw = projects.reduce((sum, project) => sum + project.kw, 0);
    const households = projects.reduce((sum, project) => sum + project.households, 0);
    return {
      projects: projects.length,
      verified,
      pending: projects.length - verified,
      kw,
      households,
      verificationRate: projects.length ? Math.round((verified / projects.length) * 100) : 0,
      states: new Set(projects.map((project) => project.state)).size,
    };
  }, []);

  const programmeData = useMemo<ProgrammeSummary[]>(() => {
    return Array.from(groupProjects(projects, "programme").entries())
      .map(([name, list]) => ({
        name,
        projects: list.length,
        verified: list.filter((project) => project.verified).length,
        kw: list.reduce((sum, project) => sum + project.kw, 0),
        households: list.reduce((sum, project) => sum + project.households, 0),
      }))
      .sort((a, b) => b.projects - a.projects);
  }, []);

  const stateData = useMemo(() => {
    return Array.from(groupProjects(projects, "state").entries())
      .map(([name, list]) => ({
        name,
        projects: list.length,
        verified: list.filter((project) => project.verified).length,
      }))
      .sort((a, b) => b.projects - a.projects)
      .slice(0, 8);
  }, []);

  const statusData = useMemo<StatusSummary[]>(() => {
    const labels = ["Verified", "Submitted", "Pending", "In progress"];
    return labels.map((name) => ({
      name,
      value: projects.filter((project) => project.status === name).length,
    }));
  }, []);

  const attentionProjects = useMemo(() => {
    return projects
      .filter((project) => !project.verified)
      .sort((a, b) => b.kw - a.kw || b.households - a.households)
      .slice(0, 6);
  }, []);

  const attentionSignals = useMemo(() => {
    const pending = projects.filter((project) => project.status === "Pending");
    const submitted = projects.filter((project) => project.status === "Submitted");
    const progress = projects.filter((project) => project.status === "In progress");
    const statePending = Array.from(groupProjects(projects.filter((project) => !project.verified), "state").entries())
      .map(([name, list]) => ({ name, count: list.length }))
      .sort((a, b) => b.count - a.count)[0];
    const contractorPending = Array.from(groupProjects(projects.filter((project) => !project.verified), "contractor").entries())
      .map(([name, list]) => ({ name, count: list.length }))
      .sort((a, b) => b.count - a.count)[0];
    return {
      pending: pending.length,
      submitted: submitted.length,
      progress: progress.length,
      statePending,
      contractorPending,
    };
  }, []);

  const trendData = useMemo(() => {
    return monthOrder.map((month) => {
      const monthProjects = projects.filter((project) => project.month === month);
      return {
        month: month.split(" ")[0].slice(0, 3),
        projects: monthProjects.length,
        verified: monthProjects.filter((project) => project.verified).length,
        awaiting: monthProjects.filter((project) => !project.verified).length,
      };
    });
  }, []);

  const componentData = useMemo(() => {
    return Array.from(groupProjects(projects, "component").entries())
      .map(([name, list]) => ({
        name,
        projects: list.length,
        kw: list.reduce((sum, project) => sum + project.kw, 0),
        households: list.reduce((sum, project) => sum + project.households, 0),
      }))
      .sort((a, b) => b.projects - a.projects);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setSlide((current) => (current + 1) % slideLabels.length);
    }, 10000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const selectSlide = (index: number) => {
    setPaused(true);
    setSlide((index + slideLabels.length) % slideLabels.length);
  };

  const verificationAngle = Math.max(0, Math.min(100, portfolio.verificationRate)) * 3.6;

  return (
    <div className="fixed bottom-0 left-0 right-0 top-[94px] z-[58] overflow-y-auto bg-[#f3f6f4] lg:left-[190px]">
      <style>{`
        @keyframes mdExecutiveProgress { from { width: 0%; } to { width: 100%; } }
        @keyframes mdExecutiveEnter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .md-executive-enter { animation: mdExecutiveEnter 520ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .md-executive-enter { animation: none; }
        }
      `}</style>

      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex min-h-[66px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-[#128149]">
              <Sparkles className="h-3.5 w-3.5" /> Veritas Executive View
            </div>
            <div className="mt-1 flex min-w-0 items-center gap-2">
              <h1 className="truncate text-lg font-black tracking-tight text-[#173b2a] sm:text-xl">MD Command Centre</h1>
              <span className="hidden rounded-full border border-[#cce3d4] bg-[#f0f8f3] px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-[0.1em] text-[#128149] sm:inline">Live portfolio briefing</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenOverview}
              className="hidden items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[9px] font-extrabold text-slate-600 transition hover:border-[#acd1b8] hover:text-[#128149] sm:flex"
            >
              Open operational dashboard <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close executive view"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="h-[2px] bg-slate-100">
          {!paused && (
            <div
              key={slide}
              className="h-full bg-[#128149]"
              style={{ animation: "mdExecutiveProgress 10s linear forwards" }}
            />
          )}
        </div>
      </div>

      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <section key={slide} className="md-executive-enter min-h-[500px]">
          {slide === 0 && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#128149]">National Snapshot</p>
                  <h2 className="mt-1 text-2xl font-black tracking-tight text-[#173b2a] sm:text-3xl">REA portfolio at a glance</h2>
                  <p className="mt-1 text-xs text-slate-500">A concise national view of delivery, impact and verification.</p>
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[9px] font-bold text-slate-500">Screen 1 of 6</div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ["Projects", portfolio.projects.toLocaleString(), "National portfolio"],
                  ["Installed Capacity", formatMw(portfolio.kw), "Across all programmes"],
                  ["Households", compact(portfolio.households), "Reached by projects"],
                  ["Verified", `${portfolio.verificationRate}%`, `${portfolio.verified} projects`],
                  ["Needs Attention", portfolio.pending.toLocaleString(), "Awaiting verification"],
                ].map(([label, value, detail], index) => (
                  <div key={label} className={`rounded-xl border bg-white p-4 ${index === 4 ? "border-amber-200" : "border-slate-200"}`}>
                    <p className="text-[9px] font-extrabold uppercase tracking-[0.11em] text-slate-500">{label}</p>
                    <p className={`mt-2 text-2xl font-black tracking-tight ${index === 4 ? "text-amber-700" : "text-[#173b2a]"}`}>{value}</p>
                    <p className="mt-1 text-[9px] text-slate-400">{detail}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-[0.85fr_1.45fr]">
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Verification confidence</p>
                      <p className="mt-1 text-sm font-extrabold text-[#173b2a]">National verification rate</p>
                    </div>
                    <ShieldCheck className="h-5 w-5 text-[#128149]" />
                  </div>
                  <div className="mt-6 flex items-center justify-center">
                    <div
                      className="flex h-48 w-48 items-center justify-center rounded-full"
                      style={{ background: `conic-gradient(#128149 0deg ${verificationAngle}deg, #e7ede9 ${verificationAngle}deg 360deg)` }}
                    >
                      <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full bg-white">
                        <strong className="text-4xl font-black text-[#173b2a]">{portfolio.verificationRate}%</strong>
                        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">Verified</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Highest activity</p>
                      <p className="mt-1 text-sm font-extrabold text-[#173b2a]">Top states by project volume</p>
                    </div>
                    <BarChart3 className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="mt-5 space-y-3">
                    {stateData.map((state, index) => {
                      const maximum = stateData[0]?.projects || 1;
                      const width = Math.max(8, (state.projects / maximum) * 100);
                      return (
                        <div key={state.name} className="grid grid-cols-[92px_1fr_52px] items-center gap-3">
                          <span className="truncate text-[10px] font-bold text-slate-600">{index + 1}. {state.name}</span>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-[#128149] transition-all duration-700" style={{ width: `${width}%` }} />
                          </div>
                          <span className="text-right text-[9px] font-extrabold text-[#173b2a]">{state.projects} proj.</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {slide === 1 && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#128149]">Programme Performance</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#173b2a] sm:text-3xl">Which programmes are delivering?</h2>
                <p className="mt-1 text-xs text-slate-500">Project volume, installed capacity, households and verification in one view.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {programmeData.map((programme) => {
                  const rate = programme.projects ? Math.round((programme.verified / programme.projects) * 100) : 0;
                  return (
                    <div key={programme.name} className="rounded-xl border border-slate-200 bg-white p-5">
                      <div className="flex items-center justify-between">
                        <span className="rounded-md bg-[#f0f8f3] px-2 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#128149]">{programme.name}</span>
                        <span className="text-[9px] font-bold text-slate-400">{rate}% verified</span>
                      </div>
                      <p className="mt-4 text-3xl font-black text-[#173b2a]">{programme.projects}</p>
                      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">Projects</p>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-[#128149] transition-all duration-700" style={{ width: `${rate}%` }} />
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                        <div><p className="text-sm font-black text-[#173b2a]">{formatMw(programme.kw)}</p><p className="text-[8px] text-slate-400">Capacity</p></div>
                        <div><p className="text-sm font-black text-[#173b2a]">{compact(programme.households)}</p><p className="text-[8px] text-slate-400">Households</p></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="h-[310px] rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Programme comparison</p><p className="mt-1 text-sm font-extrabold text-[#173b2a]">Projects vs verified projects</p></div>
                  <TrendingUp className="h-5 w-5 text-[#128149]" />
                </div>
                <ResponsiveContainer width="100%" height="82%">
                  <BarChart data={programmeData} barGap={6}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9eeeb" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dbe4de", fontSize: 11 }} />
                    <Bar dataKey="projects" name="Projects" fill="#94a3b8" radius={[5, 5, 0, 0]} />
                    <Bar dataKey="verified" name="Verified" fill="#128149" radius={[5, 5, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {slide === 2 && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#128149]">Verification Pipeline</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#173b2a] sm:text-3xl">Where is work sitting right now?</h2>
                <p className="mt-1 text-xs text-slate-500">A simple management view of field and verification progress.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                {statusData.map((status, index) => {
                  const share = portfolio.projects ? Math.round((status.value / portfolio.projects) * 100) : 0;
                  const icon = index === 0 ? CheckCircle2 : index === 1 ? ShieldCheck : index === 2 ? AlertTriangle : Gauge;
                  const Icon = icon;
                  return (
                    <div key={status.name} className={`rounded-xl border bg-white p-5 ${index === 2 ? "border-amber-200" : "border-slate-200"}`}>
                      <div className="flex items-center justify-between">
                        <Icon className={`h-5 w-5 ${index === 2 ? "text-amber-600" : index === 0 ? "text-[#128149]" : "text-slate-400"}`} />
                        <span className="text-[9px] font-bold text-slate-400">{share}% of portfolio</span>
                      </div>
                      <p className="mt-5 text-4xl font-black text-[#173b2a]">{status.value}</p>
                      <p className="mt-1 text-[10px] font-extrabold text-slate-600">{status.name}</p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">End-to-end verification</p><p className="mt-1 text-sm font-extrabold text-[#173b2a]">Portfolio progression</p></div>
                  <span className="rounded-full bg-[#edf8f0] px-3 py-1 text-[9px] font-black text-[#128149]">{portfolio.verificationRate}% complete</span>
                </div>
                <div className="mt-7 grid gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] md:items-center">
                  {[
                    ["Field activity", statusData.find((item) => item.name === "In progress")?.value ?? 0],
                    ["Submitted", statusData.find((item) => item.name === "Submitted")?.value ?? 0],
                    ["Pending REA", statusData.find((item) => item.name === "Pending")?.value ?? 0],
                    ["Verified", portfolio.verified],
                  ].map(([label, value], index) => (
                    <div key={label} className="contents">
                      <div className={`rounded-lg border p-4 text-center ${index === 3 ? "border-[#b9dcc4] bg-[#f0f8f3]" : "border-slate-200 bg-slate-50"}`}>
                        <p className="text-2xl font-black text-[#173b2a]">{value}</p>
                        <p className="mt-1 text-[9px] font-extrabold uppercase tracking-[0.08em] text-slate-500">{label}</p>
                      </div>
                      {index < 3 && <ArrowRight className="mx-auto hidden h-4 w-4 text-slate-300 md:block" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {slide === 3 && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Management Attention</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#173b2a] sm:text-3xl">What deserves attention today?</h2>
                <p className="mt-1 text-xs text-slate-500">Only the strongest current signals are surfaced here.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-amber-700">Pending verification</p><p className="mt-2 text-3xl font-black text-[#173b2a]">{attentionSignals.pending}</p><p className="mt-1 text-[9px] text-slate-500">Awaiting REA action</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Submitted</p><p className="mt-2 text-3xl font-black text-[#173b2a]">{attentionSignals.submitted}</p><p className="mt-1 text-[9px] text-slate-500">Ready for review</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">In progress</p><p className="mt-2 text-3xl font-black text-[#173b2a]">{attentionSignals.progress}</p><p className="mt-1 text-[9px] text-slate-500">Still in field workflow</p></div>
              </div>

              <div className="grid gap-4 xl:grid-cols-[1.45fr_0.8fr]">
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-5 py-4"><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Highest-capacity projects not yet verified</p></div>
                  <div className="divide-y divide-slate-100">
                    {attentionProjects.map((project) => (
                      <div key={`${project.state}-${project.name}`} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[1fr_90px_90px_90px] sm:items-center">
                        <div className="min-w-0"><p className="truncate text-[11px] font-extrabold text-[#173b2a]">{project.name}</p><p className="mt-0.5 text-[9px] text-slate-400">{project.state} · {project.programme}</p></div>
                        <span className="text-[9px] font-bold text-slate-600">{formatMw(project.kw)}</span>
                        <span className="text-[9px] font-bold text-slate-600">{compact(project.households)} HH</span>
                        <span className={`w-fit rounded-full px-2 py-1 text-[8px] font-extrabold ${project.status === "Pending" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{project.status}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Highest unverified concentration</p><p className="mt-3 text-xl font-black text-[#173b2a]">{attentionSignals.statePending?.name ?? "—"}</p><p className="mt-1 text-[10px] text-slate-500">{attentionSignals.statePending?.count ?? 0} projects awaiting verification</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">Contractor with most open items</p><p className="mt-3 text-lg font-black text-[#173b2a]">{attentionSignals.contractorPending?.name ?? "—"}</p><p className="mt-1 text-[10px] text-slate-500">{attentionSignals.contractorPending?.count ?? 0} unverified projects</p></div>
                </div>
              </div>
            </div>
          )}

          {slide === 4 && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#128149]">Delivery Trend</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#173b2a] sm:text-3xl">Is performance moving in the right direction?</h2>
                <p className="mt-1 text-xs text-slate-500">Monthly project activity, verification and items still awaiting completion.</p>
              </div>

              <div className="h-[430px] rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">2024 portfolio activity</p><p className="mt-1 text-sm font-extrabold text-[#173b2a]">Projects and verification movement</p></div>
                  <div className="flex items-center gap-4 text-[9px] font-bold text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-slate-400" />Projects</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[#128149]" />Verified</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" />Awaiting</span></div>
                </div>
                <ResponsiveContainer width="100%" height="88%">
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="mdVerified" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#128149" stopOpacity={0.24}/><stop offset="95%" stopColor="#128149" stopOpacity={0}/></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9eeeb" />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 10, borderColor: "#dbe4de", fontSize: 11 }} />
                    <Area type="monotone" dataKey="projects" name="Projects" stroke="#94a3b8" fill="transparent" strokeWidth={2} />
                    <Area type="monotone" dataKey="verified" name="Verified" stroke="#128149" fill="url(#mdVerified)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="awaiting" name="Awaiting" stroke="#d97706" fill="transparent" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {slide === 5 && (
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#128149]">Impact Summary</p>
                <h2 className="mt-1 text-2xl font-black tracking-tight text-[#173b2a] sm:text-3xl">What has the portfolio delivered?</h2>
                <p className="mt-1 text-xs text-slate-500">A final executive summary before the briefing cycles back to the national snapshot.</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_1.35fr]">
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    [Zap, "Installed capacity", formatMw(portfolio.kw), "Across the national portfolio"],
                    [UsersRound, "Households reached", compact(portfolio.households), "Estimated project reach"],
                    [ShieldCheck, "Verified projects", portfolio.verified.toLocaleString(), `${portfolio.verificationRate}% of portfolio`],
                    [Gauge, "States covered", portfolio.states.toLocaleString(), "36 states + FCT where represented"],
                  ].map(([Icon, label, value, detail]) => {
                    const ExecutiveIcon = Icon as typeof Zap;
                    return (
                      <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-5">
                        <ExecutiveIcon className="h-5 w-5 text-[#128149]" />
                        <p className="mt-5 text-3xl font-black tracking-tight text-[#173b2a]">{String(value)}</p>
                        <p className="mt-1 text-[10px] font-extrabold text-slate-600">{String(label)}</p>
                        <p className="mt-1 text-[9px] text-slate-400">{String(detail)}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">Delivery mix</p><p className="mt-1 text-sm font-extrabold text-[#173b2a]">Projects by component</p></div><Zap className="h-5 w-5 text-slate-400" /></div>
                  <div className="mt-6 space-y-5">
                    {componentData.map((component) => {
                      const maximum = componentData[0]?.projects || 1;
                      const width = Math.max(8, (component.projects / maximum) * 100);
                      return (
                        <div key={component.name}>
                          <div className="flex items-end justify-between gap-3"><div><p className="text-[11px] font-extrabold text-[#173b2a]">{component.name}</p><p className="mt-0.5 text-[9px] text-slate-400">{formatMw(component.kw)} · {compact(component.households)} households</p></div><span className="text-sm font-black text-[#173b2a]">{component.projects}</span></div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#128149] transition-all duration-700" style={{ width: `${width}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[#c9dfd0] bg-[#eef7f1] p-5">
                <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#128149]" /><div><p className="text-sm font-black text-[#173b2a]">Executive takeaway</p><p className="mt-1 text-[11px] leading-5 text-slate-600">The portfolio is delivering national-scale capacity and household reach, while {portfolio.pending.toLocaleString()} projects still require verification attention. Use the operational dashboard when a management signal needs investigation.</p></div></div>
              </div>
            </div>
          )}
        </section>

        <footer className="mt-6 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => selectSlide(slide - 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#b5d4bf] hover:text-[#128149]" aria-label="Previous executive screen"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setPaused((value) => !value)} className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-[9px] font-extrabold text-slate-600 transition hover:border-[#b5d4bf] hover:text-[#128149]">{paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}{paused ? "Resume" : "Pause"}</button>
            <button type="button" onClick={() => selectSlide(slide + 1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-[#b5d4bf] hover:text-[#128149]" aria-label="Next executive screen"><ChevronRight className="h-4 w-4" /></button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {slideLabels.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => selectSlide(index)}
                className={`h-2.5 rounded-full transition-all ${slide === index ? "w-8 bg-[#128149]" : "w-2.5 bg-slate-300 hover:bg-slate-400"}`}
                aria-label={`Show ${label}`}
                title={label}
              />
            ))}
          </div>

          <div className="text-center sm:text-right">
            <p className="text-[9px] font-extrabold text-[#173b2a]">{slideLabels[slide]}</p>
            <p className="mt-0.5 text-[8px] text-slate-400">Auto-advance every 10 seconds</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function ReaExecutiveDashboardHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const sync = () => {
      document.querySelectorAll("nav").forEach((nav) => {
        let button = nav.querySelector<HTMLButtonElement>('[data-veritas-executive-view="true"]');
        const projectMap = nav.querySelector<HTMLButtonElement>('[data-veritas-project-map="true"]');
        const overview = Array.from(nav.querySelectorAll<HTMLButtonElement>("button")).find(
          (candidate) => candidate.textContent?.trim() === "Overview",
        );
        const anchor = projectMap ?? overview;
        if (!anchor) return;

        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.dataset.veritasExecutiveView = "true";
          button.className = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900";
          const mark = document.createElement("span");
          mark.className = "flex h-[18px] w-[18px] items-center justify-center text-[11px] font-black text-current";
          mark.textContent = "◆";
          const label = document.createElement("span");
          label.textContent = "Executive View";
          button.append(mark, label);
          button.addEventListener("click", () => setOpen(true));
        }

        if (anchor.nextElementSibling !== button) {
          anchor.insertAdjacentElement("afterend", button);
        }
      });
    };

    const closeWhenNavChanges = (event: MouseEvent) => {
      const button = (event.target as HTMLElement).closest("nav button") as HTMLElement | null;
      if (button && button.dataset.veritasExecutiveView !== "true") setOpen(false);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", closeWhenNavChanges, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", closeWhenNavChanges, true);
      document.querySelectorAll('[data-veritas-executive-view="true"]').forEach((button) => button.remove());
    };
  }, []);

  const openOverview = () => {
    const overview = Array.from(document.querySelectorAll<HTMLButtonElement>("nav button")).find(
      (button) => button.textContent?.trim() === "Overview",
    );
    overview?.click();
    setOpen(false);
  };

  if (!open) return null;
  return <ExecutiveDashboard onClose={() => setOpen(false)} onOpenOverview={openOverview} />;
}
