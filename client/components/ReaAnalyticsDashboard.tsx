import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, BarChart3, CheckCircle2, Download, Filter, Gauge, Home,
  Layers3, MapPin, RefreshCcw, ShieldAlert, Sparkles, TrendingUp, Zap,
} from "lucide-react";
import type { Project } from "../lib/dashboard-data";

type Props = { projects?: Project[] };
type Period = "All" | "H1" | "H2";
type Metric = "projects" | "capacity" | "households";
const months = ["January 2024","February 2024","March 2024","April 2024","May 2024","June 2024","July 2024","August 2024","September 2024","October 2024","November 2024","December 2024"];
const palette = ["#10b981","#3b82f6","#f59e0b","#8b5cf6","#06b6d4","#f43f5e"];
const cardMotion = { hidden:{opacity:0,y:18}, show:{opacity:1,y:0} };
const selectClass = "h-10 min-w-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10";

function ChartTooltip({ active, payload, label }:{active?:boolean;payload?:Array<{name:string;value:number;color:string}>;label?:string}) {
  if (!active || !payload?.length) return null;
  return <div className="rounded-xl border border-slate-200/80 bg-white/95 p-3 shadow-2xl backdrop-blur-xl"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>{payload.map((item)=><div key={item.name} className="flex min-w-36 items-center justify-between gap-5 py-1 text-xs"><span className="flex items-center gap-2 text-slate-600"><i className="h-2 w-2 rounded-full" style={{backgroundColor:item.color}}/>{item.name}</span><strong className="text-slate-800">{Number(item.value).toLocaleString()}</strong></div>)}</div>;
}
function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-xs text-slate-400">No project data matches these filters.</div>;
}
function exportCsv(rows:Project[]) {
  const keys:Array<keyof Project>=["name","state","programme","component","contractor","month","status","kw","households","verified"];
  const escape=(value:unknown)=>'"'+String(value??"").replace(/"/g,'""')+'"';
  const csv=[keys.join(","),...rows.map((row)=>keys.map((key)=>escape(row[key])).join(","))].join("\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const anchor=document.createElement("a"); anchor.href=url; anchor.download="veritas-analytics.csv"; anchor.click(); URL.revokeObjectURL(url);
}

export default function ReaAnalyticsDashboard({ projects=[] }:Props) {
  const safe=Array.isArray(projects)?projects:[];
  const [period,setPeriod]=useState<Period>("All");
  const [programme,setProgramme]=useState("All Programmes");
  const [component,setComponent]=useState("All Components");
  const [state,setState]=useState("All States");
  const [metric,setMetric]=useState<Metric>("projects");
  const options=useMemo(()=>({
    programmes:["All Programmes",...Array.from(new Set(safe.map((p)=>p.programme))).sort()],
    components:["All Components",...Array.from(new Set(safe.map((p)=>p.component))).sort()],
    states:["All States",...Array.from(new Set(safe.map((p)=>p.state))).sort()],
  }),[safe]);
  const filtered=useMemo(()=>{
    const allowed=period==="H1"?months.slice(0,6):period==="H2"?months.slice(6):months;
    return safe.filter((p)=>allowed.includes(p.month)&&(programme==="All Programmes"||p.programme===programme)&&(component==="All Components"||p.component===component)&&(state==="All States"||p.state===state));
  },[safe,period,programme,component,state]);
  const reset=()=>{setPeriod("All");setProgramme("All Programmes");setComponent("All Components");setState("All States");};
  const verified=filtered.filter((p)=>p.verified).length;
  const outstanding=filtered.length-verified;
  const rate=filtered.length?Math.round(verified/filtered.length*100):0;
  const capacity=filtered.reduce((sum,p)=>sum+(Number(p.kw)||0),0)/1000;
  const households=filtered.reduce((sum,p)=>sum+(Number(p.households)||0),0);
  const activeStates=new Set(filtered.map((p)=>p.state)).size;
  const monthly=months.map((month)=>{
    const rows=filtered.filter((p)=>p.month===month);
    return {month:month.slice(0,3),projects:rows.length,verified:rows.filter((p)=>p.verified).length,pending:rows.filter((p)=>!p.verified).length,capacity:Number((rows.reduce((s,p)=>s+p.kw,0)/1000).toFixed(1)),households:rows.reduce((s,p)=>s+p.households,0)};
  });
  const byProgramme=Array.from(new Set(filtered.map((p)=>p.programme))).map((name)=>{
    const rows=filtered.filter((p)=>p.programme===name); const done=rows.filter((p)=>p.verified).length;
    return {name,projects:rows.length,verified:done,rate:rows.length?Math.round(done/rows.length*100):0,capacity:Number((rows.reduce((s,p)=>s+p.kw,0)/1000).toFixed(1)),households:rows.reduce((s,p)=>s+p.households,0)};
  }).sort((a,b)=>b.projects-a.projects);
  const byComponent=Array.from(new Set(filtered.map((p)=>p.component))).map((name)=>({name,value:filtered.filter((p)=>p.component===name).length}));
  const byState=Array.from(new Set(filtered.map((p)=>p.state))).map((name)=>{
    const rows=filtered.filter((p)=>p.state===name); const done=rows.filter((p)=>p.verified).length;
    return {state:name,projects:rows.length,capacity:Number((rows.reduce((s,p)=>s+p.kw,0)/1000).toFixed(1)),households:rows.reduce((s,p)=>s+p.households,0),rate:rows.length?Math.round(done/rows.length*100):0};
  }).sort((a,b)=>b[metric]-a[metric]).slice(0,10);
  const statusData=[
    {name:"Verified",value:verified,color:"#10b981"},
    {name:"Outstanding",value:outstanding,color:"#f59e0b"},
  ];
  const riskStates=byState.filter((item)=>item.rate<60).length;
  const topState=byState[0]?.state||"—";
  const kpis=[
    {label:"Projects",value:filtered.length.toLocaleString(),detail:activeStates+" states represented",icon:Layers3,gradient:"from-emerald-500 to-teal-600",glow:"shadow-emerald-500/20"},
    {label:"Installed Capacity",value:capacity.toFixed(1)+" MW",detail:"Renewable capacity tracked",icon:Zap,gradient:"from-blue-500 to-indigo-600",glow:"shadow-blue-500/20"},
    {label:"Households Reached",value:households.toLocaleString(),detail:"Recorded beneficiaries",icon:Home,gradient:"from-amber-400 to-orange-600",glow:"shadow-amber-500/20"},
    {label:"Verification Rate",value:rate+"%",detail:verified+" verified · "+outstanding+" pending",icon:CheckCircle2,gradient:"from-violet-500 to-fuchsia-600",glow:"shadow-violet-500/20"},
    {label:"Leading State",value:topState,detail:"Highest "+metric+" activity",icon:MapPin,gradient:"from-rose-500 to-pink-600",glow:"shadow-rose-500/20"},
  ];

  return <div className="relative space-y-4 overflow-hidden py-4">
    <motion.section initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm lg:p-6">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-blue-100/60 blur-3xl"/>
      <div className="pointer-events-none absolute bottom-[-90px] left-[32%] h-56 w-56 rounded-full bg-violet-100/50 blur-3xl"/>
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[9px] font-bold uppercase tracking-[.22em] text-violet-700"><Sparkles className="h-3 w-3"/>Live intelligence</div><h2 className="text-2xl font-black tracking-tight text-[#173b2a] sm:text-3xl">National Delivery Analytics</h2><p className="mt-2 max-w-xl text-xs leading-5 text-slate-500">Explore programme delivery, verification performance and geographic impact across Nigeria.</p></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><select aria-label="Programme" value={programme} onChange={(e)=>setProgramme(e.target.value)} className={selectClass}>{options.programmes.map((p)=><option key={p}>{p}</option>)}</select><select aria-label="Component" value={component} onChange={(e)=>setComponent(e.target.value)} className={selectClass}>{options.components.map((p)=><option key={p}>{p}</option>)}</select><select aria-label="State" value={state} onChange={(e)=>setState(e.target.value)} className={selectClass}>{options.states.map((p)=><option key={p}>{p}</option>)}</select><button onClick={()=>exportCsv(filtered)} disabled={!filtered.length} className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#08733f] px-4 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#066333] disabled:opacity-50"><Download className="h-4 w-4"/>Export data</button></div>
      </div>
      <div className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4"><Filter className="mr-1 h-4 w-4 text-slate-400"/>{(["All","H1","H2"] as Period[]).map((p)=><button key={p} onClick={()=>setPeriod(p)} className={"rounded-lg px-3 py-2 text-[10px] font-bold transition "+(period===p?"bg-[#08733f] text-white shadow-sm":"bg-slate-100 text-slate-500 hover:bg-slate-200")}>{p==="All"?"Full year":p}</button>)}<button onClick={reset} className="ml-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 transition hover:border-[#8bcba0] hover:text-[#08733f]"><RefreshCcw className="h-3.5 w-3.5"/>Reset filters</button></div>
    </motion.section>

    <motion.section initial="hidden" animate="show" transition={{staggerChildren:.08}} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {kpis.map(({label,value,detail,icon:Icon,gradient,glow})=><motion.article variants={cardMotion} whileHover={{y:-6,scale:1.01}} key={label} className={"group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-lg "+glow}><div className={"absolute inset-x-0 top-0 h-1 bg-gradient-to-r "+gradient}/><div className={"flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg "+gradient}><Icon className="h-5 w-5"/></div><p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p><motion.p key={value} initial={{opacity:0,scale:.92}} animate={{opacity:1,scale:1}} className="mt-1 truncate text-2xl font-black tracking-tight text-[#12382a]">{value}</motion.p><p className="mt-1 text-[10px] text-slate-500">{detail}</p><div className={"absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition group-hover:opacity-20 "+gradient}/></motion.article>)}
    </motion.section>

    <section className="grid gap-4 xl:grid-cols-[1.55fr_.75fr]">
      <motion.article initial={{opacity:0,x:-20}} animate={{opacity:1,x:0}} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-blue-600"/><h3 className="text-sm font-black text-[#173b2a]">Delivery Momentum</h3></div><p className="mt-1 text-[10px] text-slate-500">Projects, verifications and outstanding work by month</p></div><div className="flex gap-3 text-[9px] font-bold text-slate-500"><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-blue-500"/>Projects</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500"/>Verified</span><span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-400"/>Pending</span></div></div>
        <div className="mt-5 h-[330px]">{filtered.length?<ResponsiveContainer width="100%" height="100%"><ComposedChart data={monthly}><defs><linearGradient id="deliveryArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity=".35"/><stop offset="100%" stopColor="#3b82f6" stopOpacity=".02"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="4 5"/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize:10,fill:"#64748b"}}/><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{fontSize:10,fill:"#94a3b8"}}/><Tooltip content={<ChartTooltip/>}/><Area type="monotone" dataKey="projects" name="Projects" stroke="#3b82f6" strokeWidth={3} fill="url(#deliveryArea)" animationDuration={1200}/><Bar dataKey="pending" name="Pending" fill="#fbbf24" radius={[5,5,0,0]} maxBarSize={18} animationDuration={900}/><Line type="monotone" dataKey="verified" name="Verified" stroke="#10b981" strokeWidth={3} dot={{r:3,fill:"#fff",strokeWidth:2}} animationDuration={1500}/></ComposedChart></ResponsiveContainer>:<EmptyChart/>}</div>
      </motion.article>
      <motion.article initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#17143e] via-[#27205f] to-[#452b74] p-5 text-white shadow-xl shadow-violet-500/15"><div className="absolute right-[-50px] top-[-50px] h-40 w-40 rounded-full bg-fuchsia-400/20 blur-3xl"/><div className="relative"><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-violet-200"/><h3 className="text-sm font-black">Verification Health</h3></div><p className="mt-1 text-[10px] text-white/50">Overall assurance completion</p><div className="relative mx-auto mt-6 flex h-48 w-48 items-center justify-center rounded-full p-[14px]" style={{background:"conic-gradient(#34d399 "+rate*3.6+"deg,rgba(255,255,255,.1) 0deg)"}}><div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-[#211b51] shadow-inner"><motion.span key={rate} initial={{opacity:0,scale:.75}} animate={{opacity:1,scale:1}} className="text-5xl font-black">{rate}%</motion.span><span className="mt-1 text-[9px] font-bold uppercase tracking-[.2em] text-violet-200/60">verified</span></div></div><div className="mt-6 grid grid-cols-2 gap-2"><div className="rounded-xl border border-emerald-300/10 bg-emerald-300/10 p-3"><p className="text-[9px] text-white/50">Verified</p><p className="mt-1 text-xl font-black text-emerald-300">{verified}</p></div><div className="rounded-xl border border-amber-300/10 bg-amber-300/10 p-3"><p className="text-[9px] text-white/50">Outstanding</p><p className="mt-1 text-xl font-black text-amber-300">{outstanding}</p></div></div></div></motion.article>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
      <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-lg"><div className="flex items-center justify-between"><div><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-violet-600"/><h3 className="text-sm font-black text-[#173b2a]">Programme Performance</h3></div><p className="mt-1 text-[10px] text-slate-500">Portfolio volume and verified delivery</p></div><span className="rounded-full bg-violet-50 px-3 py-1 text-[9px] font-bold text-violet-700">{byProgramme.length} programmes</span></div><div className="mt-4 h-[290px]">{byProgramme.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={byProgramme}><CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="4 5"/><XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize:10}}/><YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{fontSize:10}}/><Tooltip content={<ChartTooltip/>}/><Bar dataKey="projects" name="Projects" fill="#8b5cf6" radius={[7,7,0,0]} animationDuration={1000}/><Bar dataKey="verified" name="Verified" fill="#10b981" radius={[7,7,0,0]} animationDuration={1400}/></BarChart></ResponsiveContainer>:<EmptyChart/>}</div></article>
      <article className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-cyan-50 p-5 shadow-lg"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-600"/><h3 className="text-sm font-black text-[#173b2a]">Technology Mix</h3></div><p className="mt-1 text-[10px] text-slate-500">Distribution across project components</p><div className="h-[205px]">{byComponent.length?<ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byComponent} dataKey="value" nameKey="name" innerRadius={55} outerRadius={82} paddingAngle={4} cornerRadius={7} animationDuration={1400}>{byComponent.map((item,index)=><Cell key={item.name} fill={palette[index%palette.length]}/>)}</Pie><Tooltip content={<ChartTooltip/>}/></PieChart></ResponsiveContainer>:<EmptyChart/>}</div><div className="space-y-2">{byComponent.map((item,index)=><div key={item.name} className="flex items-center gap-2 text-[10px]"><i className="h-2.5 w-2.5 rounded-md" style={{backgroundColor:palette[index%palette.length]}}/><span className="flex-1 truncate text-slate-600">{item.name}</span><strong className="text-slate-800">{item.value}</strong></div>)}</div></article>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.4fr_.6fr]">
      <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-lg"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-rose-500"/><h3 className="text-sm font-black text-[#173b2a]">Geographic Leaders</h3></div><p className="mt-1 text-[10px] text-slate-500">Top states by selected impact measure</p></div><div className="flex rounded-xl bg-slate-100 p-1">{(["projects","capacity","households"] as Metric[]).map((item)=><button key={item} onClick={()=>setMetric(item)} className={"rounded-lg px-3 py-2 text-[9px] font-bold capitalize transition "+(metric===item?"bg-white text-rose-600 shadow-sm":"text-slate-500")}>{item}</button>)}</div></div><div className="mt-4 h-[330px]">{byState.length?<ResponsiveContainer width="100%" height="100%"><BarChart data={byState} layout="vertical" margin={{left:4}}><defs><linearGradient id="stateBars" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#fb7185"/><stop offset="100%" stopColor="#8b5cf6"/></linearGradient></defs><XAxis type="number" hide/><YAxis type="category" dataKey="state" axisLine={false} tickLine={false} width={70} tick={{fontSize:10,fill:"#475569"}}/><Tooltip content={<ChartTooltip/>}/><Bar dataKey={metric} name={metric[0].toUpperCase()+metric.slice(1)} fill="url(#stateBars)" radius={[0,8,8,0]} animationDuration={1200}/></BarChart></ResponsiveContainer>:<EmptyChart/>}</div></article>
      <article className="rounded-2xl border border-slate-200/80 bg-[#fffaf0] p-5 shadow-lg"><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-amber-600"/><h3 className="text-sm font-black text-[#173b2a]">Management Signals</h3></div><p className="mt-1 text-[10px] text-slate-500">What needs leadership attention</p><div className="mt-5 space-y-3"><div className="rounded-xl border border-amber-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-500">Outstanding verification</span><strong className="text-lg text-amber-600">{outstanding}</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100"><motion.div initial={{width:0}} animate={{width:(filtered.length?outstanding/filtered.length*100:0)+"%"}} className="h-full rounded-full bg-amber-500"/></div></div><div className="rounded-xl border border-rose-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-500">Low-verification leaders</span><strong className="text-lg text-rose-600">{riskStates}</strong></div><p className="mt-1 text-[9px] text-slate-400">Among the ten highest-activity states</p></div><div className="rounded-xl border border-emerald-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-500">Active state coverage</span><strong className="text-lg text-emerald-600">{activeStates}/37</strong></div><p className="mt-1 text-[9px] text-slate-400">{Math.round(activeStates/37*100)}% national footprint</p></div></div></article>
    </section>
  </div>;
}
