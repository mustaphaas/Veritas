import { useMemo, useState } from "react";
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
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Gauge,
  Home,
  Layers3,
  MapPin,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { Project } from "../lib/dashboard-data";

type Props = { projects: Project[] };
type Period = "All" | "H1" | "H2";

const palette = ["#08733f", "#2f9c61", "#65bd82", "#9bd2aa"];
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

function compact(value: number) {
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export default function ReaAnalyticsDashboard({ projects }: Props) {
  const [period, setPeriod] = useState<Period>("All");
  const [programme, setProgramme] = useState("All Programmes");

  const programmes = useMemo(
    () => ["All Programmes", ...Array.from(new Set(projects.map((item) => item.programme)))],
    [projects],
  );

  const filtered = useMemo(() => {
    const allowedMonths =
      period === "H1"
        ? monthOrder.slice(0, 6)
        : period === "H2"
          ? monthOrder.slice(6)
          : monthOrder;
    return projects.filter(
      (item) =>
        allowedMonths.includes(item.month) &&
        (programme === "All Programmes" || item.programme === programme),
    );
  }, [period, programme, projects]);

  const totals = useMemo(() => {
    const verified = filtered.filter((item) => item.verified).length;
    const kw = filtered.reduce((sum, item) => sum + item.kw, 0);
    const households = filtered.reduce((sum, item) => sum + item.households, 0);
    return {
      projects: filtered.length,
      verified,
      rate: filtered.length ? Math.round((verified / filtered.length) * 100) : 0,
      capacity: kw / 1000,
      households,
    };
  }, [filtered]);

  const monthly = useMemo(
    () =>
      monthOrder
        .map((month) => {
          const rows = filtered.filter((item) => item.month === month);
          const verified = rows.filter((item) => item.verified).length;
          return {
            month: month.slice(0, 3),
            projects: rows.length,
            verified,
            pending: rows.length - verified,
            capacity: Number((rows.reduce((sum, item) => sum + item.kw, 0) / 1000).toFixed(1)),
            rate: rows.length ? Math.round((verified / rows.length) * 100) : 0,
          };
        })
        .filter((row) => row.projects > 0),
    [filtered],
  );

  const programmeData = useMemo(
    () =>
      Array.from(new Set(filtered.map((item) => item.programme)))
        .map((name) => {
          const rows = filtered.filter((item) => item.programme === name);
          const verified = rows.filter((item) => item.verified).length;
          return {
            name,
            projects: rows.length,
            capacity: Number((rows.reduce((sum, item) => sum + item.kw, 0) / 1000).toFixed(1)),
            rate: rows.length ? Math.round((verified / rows.length) * 100) : 0,
          };
        })
        .sort((a, b) => b.projects - a.projects),
    [filtered],
  );

  const componentData = useMemo(
    () =>
      Array.from(new Set(filtered.map((item) => item.component)))
        .map((name) => ({
          name,
          value: filtered.filter((item) => item.component === name).length,
        }))
        .sort((a, b) => b.value - a.value),
    [filtered],
  );

  const stateData = useMemo(
    () =>
      Array.from(new Set(filtered.map((item) => item.state)))
        .map((state) => {
          const rows = filtered.filter((item) => item.state === state);
          const verified = rows.filter((item) => item.verified).length;
          return {
            state,
            projects: rows.length,
            households: rows.reduce((sum, item) => sum + item.households, 0),
            rate: rows.length ? Math.round((verified / rows.length) * 100) : 0,
          };
        })
        .sort((a, b) => b.projects - a.projects)
        .slice(0, 8),
    [filtered],
  );

  const bestState = stateData.slice().sort((a, b) => b.rate - a.rate)[0];
  const avgCapacity = totals.projects ? totals.capacity / totals.projects : 0;

  return (
    <div className="space-y-4 pb-8 pt-4">
      <section className="relative overflow-hidden rounded-2xl border border-[#cfe7d6] bg-[linear-gradient(135deg,#0b5f36_0%,#08733f_45%,#0a8650_100%)] p-5 text-white shadow-[0_18px_50px_rgba(7,92,51,0.18)] sm:p-6">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute bottom-0 right-[18%] h-32 w-32 rounded-full bg-[#9fe0b4]/20 blur-xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> Intelligence workspace
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">National Delivery Analytics</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-emerald-50/90">
              Live portfolio intelligence across programmes, states, capacity, households and verification performance.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={programme} onChange={(event) => setProgramme(event.target.value)} className="h-10 rounded-lg border border-white/20 bg-white/10 px-3 text-xs font-semibold text-white outline-none backdrop-blur [&>option]:text-slate-900">
              {programmes.map((item) => <option key={item}>{item}</option>)}
            </select>
            <div className="flex rounded-lg border border-white/20 bg-white/10 p-1 backdrop-blur">
              {(["All", "H1", "H2"] as Period[]).map((item) => (
                <button key={item} type="button" onClick={() => setPeriod(item)} className={`rounded-md px-3 py-2 text-[11px] font-bold transition-all duration-300 ${period === item ? "bg-white text-[#08733f] shadow-sm" : "text-white hover:bg-white/10"}`}>
                  {item === "All" ? "Full year" : item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Projects", value: totals.projects.toLocaleString(), detail: "Active portfolio", icon: Layers3 },
          { label: "Installed Capacity", value: `${totals.capacity.toFixed(1)} MW`, detail: `${avgCapacity.toFixed(2)} MW average`, icon: Zap },
          { label: "Households Reached", value: compact(totals.households), detail: totals.households.toLocaleString(), icon: Home },
          { label: "Verified", value: totals.verified.toLocaleString(), detail: `${totals.rate}% verification rate`, icon: CheckCircle2 },
          { label: "Top Performing State", value: bestState?.state ?? "—", detail: bestState ? `${bestState.rate}% verified` : "No matching data", icon: MapPin },
        ].map(({ label, value, detail, icon: Icon }, index) => (
          <article key={label} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#b8dfc5] hover:shadow-[0_12px_28px_rgba(8,115,63,0.10)]">
            <div className="absolute right-0 top-0 h-20 w-20 translate-x-7 -translate-y-7 rounded-full bg-[#edf9f0] transition-transform duration-500 group-hover:scale-125" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#eaf8ef] text-[#08733f]"><Icon className="h-4.5 w-4.5" /></div>
              {index < 4 && <ArrowUpRight className="h-4 w-4 text-[#65a77d] transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
            </div>
            <p className="relative mt-4 text-[11px] font-semibold text-slate-500">{label}</p>
            <p className="relative mt-1 text-xl font-bold tracking-tight text-[#173b2a]">{value}</p>
            <p className="relative mt-1 text-[10px] text-slate-500">{detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.55fr_.85fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-[#08733f]" /><h3 className="text-sm font-bold text-[#173b2a]">Delivery Momentum</h3></div><p className="mt-1 text-[11px] text-slate-500">Monthly projects, verified reports and capacity</p></div>
            <span className="rounded-full bg-[#edf9f0] px-2.5 py-1 text-[10px] font-bold text-[#08733f]">Live portfolio</span>
          </div>
          <div className="mt-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthly} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="projectArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#08733f" stopOpacity={0.32} /><stop offset="100%" stopColor="#08733f" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="#e8efe9" vertical={false} />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} allowDecimals={false} />
                <Tooltip cursor={{ stroke: "#a7d5b6", strokeDasharray: "4 4" }} contentStyle={{ borderRadius: 12, borderColor: "#dbe8df", boxShadow: "0 10px 30px rgba(15,23,42,.08)", fontSize: 11 }} />
                <Area type="monotone" dataKey="projects" name="Projects" stroke="#08733f" strokeWidth={2.6} fill="url(#projectArea)" animationDuration={1100} />
                <Line type="monotone" dataKey="verified" name="Verified" stroke="#56b77a" strokeWidth={2.2} dot={{ r: 3, fill: "#56b77a" }} animationDuration={1400} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-[#08733f]" /><h3 className="text-sm font-bold text-[#173b2a]">Verification Health</h3></div>
          <p className="mt-1 text-[11px] text-slate-500">Share of reports fully verified</p>
          <div className="relative mt-2 h-[230px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="72%" outerRadius="100%" data={[{ name: "Verified", value: totals.rate, fill: "#08733f" }]} startAngle={220} endAngle={-40}>
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar background={{ fill: "#edf3ef" }} dataKey="value" cornerRadius={12} animationDuration={1300} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="text-center"><p className="text-4xl font-bold tracking-tight text-[#173b2a]">{totals.rate}%</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Verified</p></div></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#edf9f0] p-3"><p className="text-[10px] font-semibold text-slate-500">Verified</p><p className="mt-1 text-lg font-bold text-[#08733f]">{totals.verified}</p></div>
            <div className="rounded-lg bg-[#fff8e8] p-3"><p className="text-[10px] font-semibold text-slate-500">Outstanding</p><p className="mt-1 text-lg font-bold text-[#b77900]">{totals.projects - totals.verified}</p></div>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)] xl:col-span-2">
          <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#08733f]" /><h3 className="text-sm font-bold text-[#173b2a]">Programme Performance</h3></div>
          <p className="mt-1 text-[11px] text-slate-500">Portfolio volume with verification overlay</p>
          <div className="mt-4 h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={programmeData} margin={{ top: 5, right: 5, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#e8efe9" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis yAxisId="count" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis yAxisId="rate" orientation="right" domain={[0, 100]} hide />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8df", fontSize: 11 }} />
                <Bar yAxisId="count" dataKey="projects" name="Projects" fill="#08733f" radius={[7, 7, 0, 0]} animationDuration={950} />
                <Line yAxisId="rate" type="monotone" dataKey="rate" name="Verification %" stroke="#e4a11b" strokeWidth={2.2} dot={{ r: 3, fill: "#e4a11b" }} animationDuration={1300} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2"><Layers3 className="h-4 w-4 text-[#08733f]" /><h3 className="text-sm font-bold text-[#173b2a]">Component Mix</h3></div>
          <p className="mt-1 text-[11px] text-slate-500">Distribution across delivery components</p>
          <div className="mt-3 h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={componentData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={3} animationDuration={1200}>
                  {componentData.map((entry, index) => <Cell key={entry.name} fill={palette[index % palette.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8df", fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2">{componentData.map((entry, index) => <div key={entry.name} className="flex items-center gap-2 text-[10px]"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: palette[index % palette.length] }} /><span className="min-w-0 flex-1 truncate text-slate-600">{entry.name}</span><strong className="text-[#173b2a]">{entry.value}</strong></div>)}</div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-[#08733f]" /><h3 className="text-sm font-bold text-[#173b2a]">Leading States</h3></div>
          <p className="mt-1 text-[11px] text-slate-500">Top states by project activity</p>
          <div className="mt-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stateData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#eef2ef" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="state" axisLine={false} tickLine={false} width={62} tick={{ fontSize: 10, fill: "#475569" }} />
                <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#dbe8df", fontSize: 11 }} />
                <Bar dataKey="projects" name="Projects" fill="#08733f" radius={[0, 7, 7, 0]} animationDuration={1100} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="overflow-hidden rounded-xl border border-[#cfe7d6] bg-[linear-gradient(145deg,#f9fdf9,#edf9f1)] p-5 shadow-[0_4px_16px_rgba(15,23,42,0.04)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#08733f] text-white shadow-[0_8px_18px_rgba(8,115,63,.2)]"><Activity className="h-5 w-5" /></div>
          <h3 className="mt-5 text-lg font-bold tracking-tight text-[#173b2a]">Performance Signal</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">{totals.rate >= 70 ? "Verification performance is strong across the selected portfolio." : totals.rate >= 50 ? "Verification is progressing, with a meaningful outstanding review queue." : "Verification backlog is elevated and should be prioritised for management attention."}</p>
          <div className="mt-5 rounded-xl border border-white bg-white/80 p-4 backdrop-blur"><div className="flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Current rate</p><p className="mt-1 text-3xl font-bold text-[#08733f]">{totals.rate}%</p></div><TrendingUp className="h-8 w-8 text-[#8fc8a1]" /></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#08733f] transition-all duration-1000" style={{ width: `${totals.rate}%` }} /></div></div>
          <p className="mt-4 text-[10px] leading-5 text-slate-500">Figures update instantly when you change the programme or period controls above.</p>
        </article>
      </section>
    </div>
  );
}
