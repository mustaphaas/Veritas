import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, BadgeCheck, CalendarClock, Download,
  ScrollText, Search, ShieldAlert, UserRound,
} from "lucide-react";
import { readAuditEvents, readReaStaff, type AuditEvent } from "../lib/rea-admin";

const systemEmail = "system@veritas.rea.gov.ng";

export default function ReaAuditTrail(){
  const [events,setEvents]=useState<AuditEvent[]>(readAuditEvents);
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("All activity");

  useEffect(()=>{
    const refresh=()=>setEvents(readAuditEvents());
    window.addEventListener("veritas-audit-updated",refresh);
    return()=>window.removeEventListener("veritas-audit-updated",refresh);
  },[]);

  const staffByName=useMemo(()=>new Map(readReaStaff().map(staff=>[staff.name.toLowerCase(),staff])),[events]);
  const rows=useMemo(()=>events.map(event=>{
    const staff=staffByName.get(event.actor.toLowerCase());
    return {...event,staffName:staff?.name||event.actor||"System process",email:staff?.email||systemEmail};
  }),[events,staffByName]);
  const visible=useMemo(()=>rows.filter(event=>
    `${event.staffName} ${event.email} ${event.action} ${event.target} ${event.details}`.toLowerCase().includes(query.toLowerCase())&&
    (category==="All activity"||event.category===category)
  ),[rows,query,category]);

  const exportCsv=()=>{
    const data=[["Timestamp","Staff name","Email address","Action","Target","Category","Details","Result"],...visible.map(event=>[event.timestamp,event.staffName,event.email,event.action,event.target,event.category,event.details,event.severity])];
    const csv=data.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\n");
    const link=document.createElement("a");
    link.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
    link.download="veritas-audit-trail.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const stats=[
    ["Recorded Events",events.length,ScrollText,"Complete activity history"],
    ["Staff Activity",new Set(rows.map(event=>event.email)).size,UserRound,"Unique staff accounts"],
    ["Successful",events.filter(event=>event.severity==="Success").length,BadgeCheck,"Completed actions"],
    ["Warnings",events.filter(event=>event.severity==="Warning"||event.severity==="Critical").length,ShieldAlert,"Actions requiring attention"],
  ] as const;

  return <div className="space-y-4 pb-8 pt-4">
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2"><Activity className="h-5 w-5 text-[#08733f]"/><h2 className="text-xl font-bold text-[#173b2a]">Audit Trail</h2></div>
        <p className="mt-1 text-xs text-slate-500">Review who performed each action, when it occurred and its result.</p>
      </div>
      <button onClick={exportCsv} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:border-[#9dceb0] hover:bg-emerald-50 hover:text-[#08733f]"><Download className="h-4 w-4"/>Export audit log</button>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(([label,value,Icon,detail],index)=><article key={label} className="group min-h-[112px] rounded-lg border border-slate-200 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9dceb0] hover:shadow-md">
        <div className="flex h-full flex-col items-center justify-center">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 group-hover:bg-[#08733f] group-hover:text-white ${index===2?"bg-emerald-50 text-emerald-700":index===3?"bg-amber-50 text-amber-700":"bg-blue-50 text-blue-700"}`}><Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110"/></div>
          <p className="mt-2 text-sm font-semibold text-[#263c31]">{label}</p>
          <p className="mt-1 text-[23px] font-bold leading-none tracking-tight text-[#13281e]">{value}</p>
          <p className="mt-2 text-[11px] text-slate-500">{detail}</p>
        </div>
      </article>)}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search staff name, email address or action" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#08733f]"/></div>
        <select value={category} onChange={event=>setCategory(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"><option>All activity</option>{["Authentication","User Management","Access Control","Claims","Verification","System"].map(value=><option key={value}>{value}</option>)}</select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] table-fixed text-left">
          <colgroup><col className="w-[14%]"/><col className="w-[17%]"/><col className="w-[20%]"/><col className="w-[25%]"/><col className="w-[13%]"/><col className="w-[11%]"/></colgroup>
          <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.1em] text-slate-500"><tr><th className="px-5 py-3.5">Date & time</th><th className="px-4 py-3.5">Staff name</th><th className="px-4 py-3.5">Email address</th><th className="px-4 py-3.5">Action</th><th className="px-4 py-3.5">Category</th><th className="px-4 py-3.5 text-center">Result</th></tr></thead>
          <tbody>{visible.map(event=><tr key={event.id} className="border-t border-slate-100 transition-colors hover:bg-[#f8fcf9]">
            <td className="px-5 py-4"><p className="text-[11px] font-semibold text-slate-600">{new Date(event.timestamp).toLocaleDateString("en-NG",{day:"2-digit",month:"short",year:"numeric"})}</p><p className="mt-1 text-[10px] text-slate-400">{new Date(event.timestamp).toLocaleTimeString("en-NG",{hour:"2-digit",minute:"2-digit"})}</p></td>
            <td className="px-4 py-4"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-[#08733f]"><UserRound className="h-4 w-4"/></span><p className="text-xs font-bold text-[#173b2a]">{event.staffName}</p></div></td>
            <td className="px-4 py-4 text-[11px] font-medium text-slate-600">{event.email}</td>
            <td className="px-4 py-4"><p className="text-xs font-bold text-slate-700">{event.action}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{event.target} · {event.details}</p></td>
            <td className="px-4 py-4"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold text-slate-600">{event.category}</span></td>
            <td className="px-4 py-4 text-center"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-bold ${event.severity==="Success"?"bg-emerald-50 text-emerald-700":event.severity==="Warning"||event.severity==="Critical"?"bg-amber-50 text-amber-700":"bg-blue-50 text-blue-700"}`}>{event.severity==="Warning"||event.severity==="Critical"?<AlertTriangle className="h-3 w-3"/>:<BadgeCheck className="h-3 w-3"/>}{event.severity}</span></td>
          </tr>)}</tbody>
        </table>
        {visible.length===0&&<div className="p-12 text-center"><CalendarClock className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-xs font-semibold text-slate-500">No audit events match the current filters.</p></div>}
      </div>
    </section>
  </div>;
}
