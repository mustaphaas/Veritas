import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, CheckCircle2, Home, Layers3, MapPin, Sparkles, TrendingUp, Zap } from "lucide-react";
import type { Project } from "../lib/dashboard-data";

type Props = { projects?: Project[] };
type Period = "All" | "H1" | "H2";
const colors = ["#08733f", "#4f7cff", "#f59e0b", "#8b5cf6", "#06b6d4", "#ef6c8f"];
const months = ["January 2024","February 2024","March 2024","April 2024","May 2024","June 2024","July 2024","August 2024","September 2024","October 2024","November 2024","December 2024"];

export default function ReaAnalyticsDashboard({ projects = [] }: Props) {
  const [period, setPeriod] = useState<Period>("All");
  const [programme, setProgramme] = useState("All Programmes");
  const safeProjects = Array.isArray(projects) ? projects : [];
  const programmes = useMemo(() => ["All Programmes", ...Array.from(new Set(safeProjects.map(p => p.programme).filter(Boolean)))], [safeProjects]);
  const filtered = useMemo(() => {
    const allowed = period === "H1" ? months.slice(0, 6) : period === "H2" ? months.slice(6) : months;
    return safeProjects.filter(p => allowed.includes(p.month) && (programme === "All Programmes" || p.programme === programme));
  }, [safeProjects, period, programme]);
  const verified = filtered.filter(p => p.verified).length;
  const rate = filtered.length ? Math.round(verified / filtered.length * 100) : 0;
  const capacity = filtered.reduce((s,p) => s + (Number(p.kw) || 0), 0) / 1000;
  const households = filtered.reduce((s,p) => s + (Number(p.households) || 0), 0);
  const monthly = months.map(m => { const rows = filtered.filter(p => p.month === m); return { month:m.slice(0,3), projects:rows.length, verified:rows.filter(p => p.verified).length }; }).filter(x => x.projects > 0);
  const byProgramme = Array.from(new Set(filtered.map(p => p.programme))).map(name => ({ name, projects: filtered.filter(p => p.programme === name).length }));
  const byComponent = Array.from(new Set(filtered.map(p => p.component))).map(name => ({ name, value: filtered.filter(p => p.component === name).length }));
  const byState = Array.from(new Set(filtered.map(p => p.state))).map(state => ({ state, projects: filtered.filter(p => p.state === state).length })).sort((a,b)=>b.projects-a.projects).slice(0,8);
  const topState = byState[0]?.state || "—";
  const kpis = [
    ["Projects", filtered.length.toLocaleString(), "Active portfolio", Layers3, "from-emerald-50"],
    ["Installed Capacity", `${capacity.toFixed(1)} MW`, "Across selected projects", Zap, "from-blue-50"],
    ["Households Reached", households.toLocaleString(), "Recorded beneficiaries", Home, "from-amber-50"],
    ["Verified", `${rate}%`, `${verified} projects verified`, CheckCircle2, "from-violet-50"],
    ["Leading State", topState, "By project activity", MapPin, "from-cyan-50"],
  ] as const;

  return <div className="space-y-4 py-4">
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-100 via-blue-100 to-violet-100 text-violet-700"><Sparkles className="h-5 w-5"/></span><div><h2 className="text-xl font-bold text-[#173b2a]">National Delivery Analytics</h2><p className="mt-1 text-xs text-slate-500">Live portfolio intelligence across programmes, states and verification.</p></div></div>
      <div className="flex flex-wrap gap-2"><select value={programme} onChange={e=>setProgramme(e.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">{programmes.map(p=><option key={p}>{p}</option>)}</select><div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">{(["All","H1","H2"] as Period[]).map(p=><button key={p} onClick={()=>setPeriod(p)} className={`rounded-md px-3 py-2 text-[11px] font-bold transition ${period===p?"bg-white text-[#08733f] shadow-sm":"text-slate-500"}`}>{p==="All"?"Full year":p}</button>)}</div></div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{kpis.map(([label,value,detail,Icon,tone])=><article key={label} className={`group rounded-xl border border-slate-200 bg-gradient-to-br ${tone} to-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg`}><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-[#08733f] shadow-sm transition-transform group-hover:scale-110"><Icon className="h-5 w-5"/></div><p className="mt-4 text-[11px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-[#173b2a]">{value}</p><p className="mt-1 text-[10px] text-slate-500">{detail}</p></article>)}</section>
    <section className="grid gap-4 xl:grid-cols-[1.5fr_.8fr]">
      <article className="rounded-xl border border-slate-200 bg-gradient-to-b from-white to-blue-50/30 p-5 shadow-sm"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600"/><h3 className="text-sm font-bold text-[#173b2a]">Delivery Momentum</h3></div><p className="mt-1 text-[11px] text-slate-500">Projects and verified reports by month</p><div className="mt-4 h-[310px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={monthly}><defs><linearGradient id="analyticsProjects" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4f7cff" stopOpacity={.35}/><stop offset="100%" stopColor="#4f7cff" stopOpacity={.02}/></linearGradient></defs><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#edf0f5"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:10}}/><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{fontSize:10}}/><Tooltip/><Area type="monotone" dataKey="projects" stroke="#4f7cff" strokeWidth={3} fill="url(#analyticsProjects)" animationDuration={1100}/><Area type="monotone" dataKey="verified" stroke="#08733f" strokeWidth={2} fillOpacity={0} animationDuration={1400}/></AreaChart></ResponsiveContainer></div></article>
      <article className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-amber-50 p-5 shadow-sm"><h3 className="text-sm font-bold text-[#173b2a]">Verification Health</h3><p className="mt-1 text-[11px] text-slate-500">Current portfolio verification rate</p><div className="flex min-h-[220px] items-center justify-center"><div className="relative flex h-44 w-44 items-center justify-center rounded-full" style={{background:`conic-gradient(#f59e0b ${rate*3.6}deg,#f4ead7 0deg)`}}><div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white shadow-inner"><span className="text-4xl font-bold text-[#173b2a]">{rate}%</span><span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified</span></div></div></div><div className="grid grid-cols-2 gap-2"><div className="rounded-lg bg-emerald-50 p-3"><p className="text-[10px] text-slate-500">Verified</p><p className="text-lg font-bold text-emerald-700">{verified}</p></div><div className="rounded-lg bg-rose-50 p-3"><p className="text-[10px] text-slate-500">Outstanding</p><p className="text-lg font-bold text-rose-600">{filtered.length-verified}</p></div></div></article>
    </section>
    <section className="grid gap-4 xl:grid-cols-3"><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-600"/><h3 className="text-sm font-bold text-[#173b2a]">Programme Performance</h3></div><div className="mt-4 h-[280px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={byProgramme}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#edf0f5"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:10}}/><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="projects" fill="#8b5cf6" radius={[8,8,0,0]} animationDuration={1100}/></BarChart></ResponsiveContainer></div></article><article className="rounded-xl border border-slate-200 bg-gradient-to-br from-white to-violet-50/50 p-5 shadow-sm"><h3 className="text-sm font-bold text-[#173b2a]">Component Mix</h3><div className="h-[220px] w-full"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byComponent} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={4} animationDuration={1200}>{byComponent.map((x,i)=><Cell key={x.name} fill={colors[i%colors.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></div><div className="space-y-2">{byComponent.map((x,i)=><div key={x.name} className="flex items-center gap-2 text-[10px]"><span className="h-2.5 w-2.5 rounded-sm" style={{backgroundColor:colors[i%colors.length]}}/><span className="flex-1 truncate text-slate-600">{x.name}</span><strong>{x.value}</strong></div>)}</div></article></section>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-500"/><h3 className="text-sm font-bold text-[#173b2a]">Leading States</h3></div><div className="mt-4 h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={byState} layout="vertical"><XAxis type="number" hide/><YAxis type="category" dataKey="state" axisLine={false} tickLine={false} width={70} tick={{fontSize:10}}/><Tooltip/><Bar dataKey="projects" fill="#ef6c8f" radius={[0,8,8,0]} animationDuration={1200}/></BarChart></ResponsiveContainer></div></section>
  </div>;
}
