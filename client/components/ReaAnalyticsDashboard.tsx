import { useMemo, useState, type ReactNode } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  BarChart3, Filter, Layers3, MapPinned, ShieldCheck, Sparkles, TrendingUp,
} from "lucide-react";
import type { Project } from "../lib/dashboard-data";

const colours=["#08733f","#2f80ed","#8b5cf6","#f59e0b","#ef6b62","#13a8a8"];
const monthOrder=["January","February","March","April","May","June","July","August","September","October","November","December"];

function Panel({title,subtitle,icon:Icon,children,className=""}:{title:string;subtitle:string;icon:any;children:ReactNode;className?:string}){
  return <article className={"analytics-reveal overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_10px_35px_rgba(15,54,35,0.06)] "+className}>
    <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-50 to-blue-50 text-[#08733f]"><Icon className="h-4.5 w-4.5"/></span>
      <div><h3 className="text-sm font-bold text-[#173b2a]">{title}</h3><p className="mt-1 text-[10px] text-slate-500">{subtitle}</p></div>
    </header>
    {children}
  </article>;
}

export default function ReaAnalyticsDashboard({projects}:{projects:Project[]}){
  const [programme,setProgramme]=useState("All");
  const [state,setState]=useState("All");
  const [component,setComponent]=useState("All");
  const programmes=useMemo(()=>["All",...new Set(projects.map(project=>project.programme))],[projects]);
  const states=useMemo(()=>["All",...new Set(projects.map(project=>project.state))],[projects]);
  const components=useMemo(()=>["All",...new Set(projects.map(project=>project.component))],[projects]);
  const visible=useMemo(()=>projects.filter(project=>
    (programme==="All"||project.programme===programme)&&
    (state==="All"||project.state===state)&&
    (component==="All"||project.component===component)
  ),[projects,programme,state,component]);

  const total=visible.length;
  const verified=visible.filter(project=>project.verified).length;
  const pending=total-verified;
  const rate=total?Math.round(verified/total*100):0;
  const capacity=visible.reduce((sum,project)=>sum+project.kw,0)/1000;
  const households=visible.reduce((sum,project)=>sum+project.households,0);

  const programmeData=useMemo(()=>[...new Set(visible.map(project=>project.programme))].map(name=>{
    const rows=visible.filter(project=>project.programme===name);
    const completed=rows.filter(project=>project.verified).length;
    return {name,projects:rows.length,capacity:Number((rows.reduce((sum,project)=>sum+project.kw,0)/1000).toFixed(1)),rate:rows.length?Math.round(completed/rows.length*100):0};
  }).sort((a,b)=>b.projects-a.projects),[visible]);

  const stateData=useMemo(()=>[...new Set(visible.map(project=>project.state))].map(name=>{
    const rows=visible.filter(project=>project.state===name);
    const completed=rows.filter(project=>project.verified).length;
    return {name,verified:completed,pending:rows.length-completed,total:rows.length,capacity:Number((rows.reduce((sum,project)=>sum+project.kw,0)/1000).toFixed(1))};
  }).sort((a,b)=>b.total-a.total).slice(0,10),[visible]);

  const componentData=useMemo(()=>[...new Set(visible.map(project=>project.component))].map(name=>({
    name,value:visible.filter(project=>project.component===name).length
  })).sort((a,b)=>b.value-a.value),[visible]);

  const trend=useMemo(()=>{
    const available=[...new Set(visible.map(project=>project.month))];
    const ordered=available.sort((left,right)=>{
      const li=monthOrder.findIndex(month=>left.toLowerCase().includes(month.toLowerCase()));
      const ri=monthOrder.findIndex(month=>right.toLowerCase().includes(month.toLowerCase()));
      return (li<0?99:li)-(ri<0?99:ri);
    });
    return ordered.map(month=>{
      const rows=visible.filter(project=>project.month===month);
      return {month:month.slice(0,3),submitted:rows.length,verified:rows.filter(project=>project.verified).length,pending:rows.filter(project=>!project.verified).length};
    });
  },[visible]);

  const strongest=programmeData[0];
  const leadingState=stateData[0];

  return <div className="space-y-4 pb-9 pt-4">
    <style>{`
      @keyframes analyticsReveal{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
      @keyframes analyticsGlow{0%,100%{opacity:.32;transform:scale(1)}50%{opacity:.48;transform:scale(1.08)}}
      .analytics-reveal{animation:analyticsReveal .65s cubic-bezier(.2,.7,.2,1) both}
      .analytics-reveal:nth-child(2){animation-delay:.08s}.analytics-reveal:nth-child(3){animation-delay:.16s}
      .analytics-glow{animation:analyticsGlow 7s ease-in-out infinite}
    `}</style>

    <section className="analytics-reveal relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#063f27] via-[#08733f] to-[#175f78] px-5 py-6 text-white shadow-[0_18px_45px_rgba(4,83,45,0.2)] sm:px-7">
      <div className="analytics-glow absolute -right-20 -top-28 h-64 w-64 rounded-full bg-cyan-300/25 blur-3xl"/>
      <div className="analytics-glow absolute -bottom-32 left-1/3 h-60 w-60 rounded-full bg-emerald-200/20 blur-3xl"/>
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-emerald-100"><Sparkles className="h-4 w-4"/><span className="text-[10px] font-bold uppercase tracking-[0.18em]">Portfolio intelligence</span></div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Programme Analytics</h2>
          <p className="mt-2 max-w-xl text-xs leading-5 text-emerald-50/75">Explore delivery momentum, verification performance, geographic concentration and programme impact across the selected REA portfolio.</p>
          <p className="mt-5 text-sm font-semibold text-white/95"><span className="text-2xl font-bold">{total.toLocaleString()}</span> projects · <span className="font-bold text-emerald-200">{rate}% verified</span> · {capacity.toFixed(1)} MW · {households.toLocaleString()} households</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {[[programme,setProgramme,programmes,"Programme"],[component,setComponent,components,"Component"],[state,setState,states,"State"]].map(([value,setValue,options,label]:any)=><label key={label} className="text-[9px] font-bold uppercase tracking-wider text-emerald-100/75"><span className="flex items-center gap-1"><Filter className="h-3 w-3"/>{label}</span><select value={value} onChange={event=>setValue(event.target.value)} className="mt-1.5 h-10 min-w-40 rounded-xl border border-white/15 bg-white/10 px-3 text-xs font-semibold normal-case text-white outline-none backdrop-blur focus:border-white/40">{options.map((option:string)=><option key={option} className="text-slate-800">{option}</option>)}</select></label>)}
        </div>
      </div>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.45fr_.8fr]">
      <Panel title="Verification Momentum" subtitle="Submitted, verified and pending reports over time" icon={TrendingUp}>
        <div className="h-[330px] p-4"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trend} margin={{top:10,right:18,left:-20,bottom:0}}>
          <defs><linearGradient id="verifiedArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#08733f" stopOpacity=".48"/><stop offset="100%" stopColor="#08733f" stopOpacity=".03"/></linearGradient><linearGradient id="submittedArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f80ed" stopOpacity=".35"/><stop offset="100%" stopColor="#2f80ed" stopOpacity=".02"/></linearGradient></defs>
          <CartesianGrid stroke="#e9efeb" strokeDasharray="4 4"/><XAxis dataKey="month" tick={{fontSize:10,fill:"#64748b"}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:9,fill:"#64748b"}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{borderRadius:12,borderColor:"#dbe7de",fontSize:11,boxShadow:"0 10px 25px rgba(15,54,35,.1)"}}/><Legend iconType="circle" wrapperStyle={{fontSize:10}}/>
          <Area type="monotone" dataKey="submitted" name="Submitted" stroke="#2f80ed" fill="url(#submittedArea)" strokeWidth={2} animationDuration={900}/><Area type="monotone" dataKey="verified" name="Verified" stroke="#08733f" fill="url(#verifiedArea)" strokeWidth={2.5} animationDuration={1300}/><Line type="monotone" dataKey="pending" name="Pending" stroke="#f59e0b" strokeWidth={2} dot={{r:3,fill:"#f59e0b"}} animationDuration={1500}/>
        </AreaChart></ResponsiveContainer></div>
      </Panel>

      <Panel title="Component Mix" subtitle="How the filtered portfolio is distributed" icon={Layers3}>
        <div className="relative h-[330px] p-3"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={componentData} dataKey="value" nameKey="name" innerRadius={70} outerRadius={108} paddingAngle={4} cornerRadius={6} animationDuration={1200}>{componentData.map((entry,index)=><Cell key={entry.name} fill={colours[index%colours.length]}/>)}</Pie><Tooltip contentStyle={{borderRadius:12,borderColor:"#dbe7de",fontSize:11}}/><Legend iconType="circle" wrapperStyle={{fontSize:10}}/></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-x-0 top-[124px] text-center"><p className="text-3xl font-bold text-[#173b2a]">{total}</p><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Projects</p></div></div>
      </Panel>
    </section>

    <section className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
      <Panel title="Programme Comparison" subtitle="Delivery volume, installed capacity and verification performance" icon={BarChart3}>
        <div className="h-[320px] p-4"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={programmeData} margin={{top:12,right:8,left:-18,bottom:0}}><CartesianGrid stroke="#edf1ee" strokeDasharray="4 4"/><XAxis dataKey="name" tick={{fontSize:10,fill:"#475569"}} axisLine={false} tickLine={false}/><YAxis yAxisId="volume" allowDecimals={false} tick={{fontSize:9,fill:"#64748b"}} axisLine={false} tickLine={false}/><YAxis yAxisId="rate" orientation="right" domain={[0,100]} tickFormatter={value=>value+"%"} tick={{fontSize:9,fill:"#64748b"}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{borderRadius:12,borderColor:"#dbe7de",fontSize:11}}/><Legend iconType="circle" wrapperStyle={{fontSize:10}}/><Bar yAxisId="volume" dataKey="projects" name="Projects" fill="#2f80ed" radius={[7,7,0,0]} animationDuration={900}/><Bar yAxisId="volume" dataKey="capacity" name="Capacity (MW)" fill="#8b5cf6" radius={[7,7,0,0]} animationDuration={1200}/><Line yAxisId="rate" type="monotone" dataKey="rate" name="Verification rate" stroke="#08733f" strokeWidth={3} dot={{r:4,fill:"#08733f",stroke:"#fff",strokeWidth:2}} animationDuration={1500}/></ComposedChart></ResponsiveContainer></div>
      </Panel>

      <Panel title="Leading States" subtitle="Verified and pending workload in the ten busiest states" icon={MapPinned}>
        <div className="h-[320px] p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={stateData} layout="vertical" margin={{top:0,right:16,left:10,bottom:0}}><CartesianGrid stroke="#edf1ee" strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false} tick={{fontSize:9}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" width={70} tick={{fontSize:10,fill:"#475569"}} axisLine={false} tickLine={false}/><Tooltip contentStyle={{borderRadius:12,borderColor:"#dbe7de",fontSize:11}}/><Legend iconType="circle" wrapperStyle={{fontSize:10}}/><Bar dataKey="verified" name="Verified" stackId="status" fill="#13a86b" radius={[0,0,0,0]} animationDuration={1000}/><Bar dataKey="pending" name="Pending" stackId="status" fill="#f5b642" radius={[0,7,7,0]} animationDuration={1350}/></BarChart></ResponsiveContainer></div>
      </Panel>
    </section>

    <section className="analytics-reveal overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_35px_rgba(15,54,35,0.06)]">
      <div className="grid lg:grid-cols-[.8fr_1.2fr]">
        <div className="bg-gradient-to-br from-[#eefaf2] to-[#eef7ff] p-6"><div className="flex items-center gap-2 text-[#08733f]"><ShieldCheck className="h-5 w-5"/><p className="text-[10px] font-bold uppercase tracking-[0.16em]">Management interpretation</p></div><h3 className="mt-3 text-xl font-bold leading-tight text-[#173b2a]">{rate>=70?"Verification momentum is strong.":rate>=50?"Delivery is progressing, with a visible verification backlog.":"Verification requires immediate management attention."}</h3><p className="mt-3 text-xs leading-5 text-slate-600">{pending.toLocaleString()} reports remain pending across the current scope. Prioritise the highest-volume states while protecting review quality.</p></div>
        <div className="grid gap-px bg-slate-100 sm:grid-cols-3">
          {[["Leading programme",strongest?strongest.name+" · "+strongest.projects+" projects":"No programme data","bg-white"],["Highest workload",leadingState?leadingState.name+" · "+leadingState.total+" projects":"No state data","bg-white"],["Portfolio impact",capacity.toFixed(1)+" MW · "+households.toLocaleString()+" households","bg-white"]].map(([label,value,tone])=><div key={label} className={tone+" p-6"}><p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-3 text-sm font-bold leading-5 text-[#173b2a]">{value}</p></div>)}
        </div>
      </div>
    </section>
  </div>;
}
