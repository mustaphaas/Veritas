import { useMemo, useState } from "react";
import {
  ArrowLeft, Building2, CheckCircle2, Clock3, Edit3, Mail, MapPin,
  Phone, Plus, RefreshCw, Search, ShieldOff, UserRound, UsersRound, X,
} from "lucide-react";
import {
  appendConsultantActivity, consultantMetrics, defaultConsultants, readConsultantActivity,
  readConsultants, writeConsultants, type ConsultantRecord, type ConsultantStatus,
} from "../lib/consultants";
import { appendAuditEvent } from "../lib/rea-admin";

const nigeriaStates = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];
const regions = ["North West","North East","North Central","South West","South East","South South"];
const statuses: ConsultantStatus[] = ["Active","Inactive","Pending Activation"];
const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10";
type ConsultantForm = Omit<ConsultantRecord, "id">;
const emptyForm = (): ConsultantForm => ({ firmName:"", adminName:"", adminEmail:"", adminPhone:"", regions:[], states:[], status:"Pending Activation", engagementRef:"", scopeNote:"", engagementStart:"", engagementEnd:"", temporaryPassword:"Consult" + Math.random().toString(36).slice(-6) + "!" });

function statusClass(status: ConsultantStatus) {
  if (status === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Inactive") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}
function safeAccounts() {
  try {
    const records = readConsultants();
    if (!Array.isArray(records) || !records.length) return defaultConsultants.map((record)=>({...record,regions:[...record.regions],states:[...record.states]}));
    return records.map((record,index)=>({
      ...defaultConsultants[index % defaultConsultants.length],
      ...record,
      id:record?.id||"con-recovered-"+index,
      firmName:record?.firmName||"Unnamed Consultant",
      adminName:record?.adminName||"Consultant Admin",
      adminEmail:record?.adminEmail||"",
      adminPhone:record?.adminPhone||"",
      regions:Array.isArray(record?.regions)?record.regions:[],
      states:Array.isArray(record?.states)?record.states:[],
      status:statuses.includes(record?.status)?record.status:"Pending Activation",
      engagementRef:record?.engagementRef||"Not recorded",
      temporaryPassword:record?.temporaryPassword||"Consult2026!",
    }));
  } catch {
    return defaultConsultants.map((record)=>({...record,regions:[...record.regions],states:[...record.states]}));
  }
}
function ConsultantModal({ title, description, value, records, editingId, onClose, onSave }: {
  title:string; description:string; value:ConsultantForm; records:ConsultantRecord[];
  editingId?:string; onClose:()=>void; onSave:(value:ConsultantForm)=>void;
}) {
  const [form, setForm] = useState(value);
  const [error, setError] = useState("");
  const submit = () => {
    const required = [form.firmName, form.adminName, form.adminEmail, form.adminPhone, form.engagementRef];
    if (required.some((item) => !item.trim())) return setError("Complete all required contact and engagement fields.");
    if (!/^\S+@\S+\.\S+$/.test(form.adminEmail)) return setError("Enter a valid Consultant Admin email address.");
    if (!form.regions.length || !form.states.length) return setError("Assign at least one region and one state.");
    if (form.engagementStart && form.engagementEnd && form.engagementEnd < form.engagementStart) return setError("Engagement end date cannot be earlier than its start date.");
    const duplicate = records.some((record) => record.id !== editingId && record.adminEmail.toLowerCase() === form.adminEmail.trim().toLowerCase());
    if (duplicate) return setError("A consultant already uses this admin email address.");
    onSave({ ...form, firmName:form.firmName.trim(), adminName:form.adminName.trim(), adminEmail:form.adminEmail.trim().toLowerCase(), adminPhone:form.adminPhone.trim(), engagementRef:form.engagementRef.trim() });
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5">
    <section role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl">
      <div className="flex items-start justify-between"><div><h3 className="text-lg font-bold text-[#173b2a]">{title}</h3><p className="mt-1 text-xs text-slate-500">{description}</p></div><button type="button" aria-label="Close" onClick={onClose}><X className="h-5 w-5 text-slate-500"/></button></div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-[10px] font-bold uppercase text-slate-500">Organization / firm name *<input className={inputClass} value={form.firmName} onChange={(e)=>setForm({...form,firmName:e.target.value})}/></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">Consultant Admin name *<input className={inputClass} value={form.adminName} onChange={(e)=>setForm({...form,adminName:e.target.value})}/></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">Admin email *<input type="email" className={inputClass} value={form.adminEmail} onChange={(e)=>setForm({...form,adminEmail:e.target.value})}/></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">Phone *<input className={inputClass} value={form.adminPhone} onChange={(e)=>setForm({...form,adminPhone:e.target.value})}/></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">Engagement reference *<input className={inputClass} value={form.engagementRef} onChange={(e)=>setForm({...form,engagementRef:e.target.value})}/></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">Status<select className={inputClass} value={form.status} onChange={(e)=>setForm({...form,status:e.target.value as ConsultantStatus})}>{statuses.map((s)=><option key={s}>{s}</option>)}</select></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">Engagement start<input type="date" className={inputClass} value={form.engagementStart} onChange={(e)=>setForm({...form,engagementStart:e.target.value})}/></label>
        <label className="text-[10px] font-bold uppercase text-slate-500">Engagement end<input type="date" className={inputClass} value={form.engagementEnd} onChange={(e)=>setForm({...form,engagementEnd:e.target.value})}/></label>
        <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase text-slate-500">Assigned regions *</p><div className="mt-2 flex flex-wrap gap-2">{regions.map((region)=><button key={region} type="button" onClick={()=>setForm({...form,regions:form.regions.includes(region)?form.regions.filter((r)=>r!==region):[...form.regions,region]})} className={"rounded-full border px-3 py-1.5 text-[10px] font-bold " + (form.regions.includes(region)?"border-[#08733f] bg-emerald-50 text-[#08733f]":"border-slate-200 text-slate-500")}>{region}</button>)}</div></div>
        <div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase text-slate-500">Assigned states *</p><div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-slate-200 p-2">{nigeriaStates.map((state)=><label key={state} className="mr-3 inline-flex items-center gap-1.5 py-1 text-[10px] text-slate-600"><input type="checkbox" checked={form.states.includes(state)} onChange={()=>setForm({...form,states:form.states.includes(state)?form.states.filter((s)=>s!==state):[...form.states,state]})}/>{state}</label>)}</div></div>
        <label className="text-[10px] font-bold uppercase text-slate-500 sm:col-span-2">Scope note<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-[#08733f]" value={form.scopeNote} onChange={(e)=>setForm({...form,scopeNote:e.target.value})}/></label>
      </div>
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button type="button" onClick={submit} className="rounded-lg bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white">{editingId?"Save changes":"Create Consultant"}</button></div>
    </section>
  </div>;
}

export default function ReaConsultantsManagement() {
  const [records,setRecords] = useState<ConsultantRecord[]>(safeAccounts);
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [query,setQuery] = useState("");
  const [statusFilter,setStatusFilter] = useState("All");
  const [modal,setModal] = useState<{mode:"create"|"edit"|"coverage"; record?:ConsultantRecord}|null>(null);
  const [notice,setNotice] = useState("");
  const selected = useMemo(()=>records.find((r)=>r.id===selectedId)??null,[records,selectedId]);
  const filtered = useMemo(()=>records.filter((r)=>{
    const q=query.trim().toLowerCase();
    const matches=!q || ((r.firmName||"")+" "+(r.adminName||"")+" "+(r.adminEmail||"")+" "+(Array.isArray(r.regions)?r.regions:[]).join(" ")+" "+(Array.isArray(r.states)?r.states:[]).join(" ")).toLowerCase().includes(q);
    return matches && (statusFilter==="All" || r.status===statusFilter);
  }),[records,query,statusFilter]);
  const save=(next:ConsultantRecord[])=>{ setRecords(next); writeConsultants(next); };
  const log=(record:ConsultantRecord,action:string,details:string,tone:"success"|"info"|"warning"="info")=>{
    appendConsultantActivity({consultantId:record.id,action,details,actor:"REA Administrator",tone});
    appendAuditEvent({actor:"REA Administrator",action,category:"User Management",target:record.firmName,details,severity:tone==="success"?"Success":tone==="warning"?"Warning":"Info"});
    setNotice(details);
  };
  const changeStatus=(record:ConsultantRecord,status:ConsultantStatus)=>{
    if(record.status===status)return;
    const updated={...record,status}; save(records.map((r)=>r.id===record.id?updated:r));
    log(updated,"Status changed to "+status,record.firmName+" is now "+status,status==="Active"?"success":"warning");
  };
  const saveModal=(form:ConsultantForm)=>{
    if(modal?.record){
      const updated:{id:string}&ConsultantForm={...form,id:modal.record.id};
      save(records.map((r)=>r.id===updated.id?updated:r));
      log(updated,modal.mode==="coverage"?"Coverage reassigned":"Consultant updated",modal.mode==="coverage"?"Coverage updated to "+updated.states.join(", "):updated.firmName+" profile updated","success");
      setModal(null); return;
    }
    const record:ConsultantRecord={...form,id:"con-"+Date.now()};
    save([record,...records]); log(record,"Consultant created",record.firmName+" registered with "+record.adminEmail,"success"); setModal(null);
  };
  const modalValue=modal?.record?{...modal.record}:emptyForm();

  if(selected){
    const metrics=consultantMetrics(selected);
    const activity=readConsultantActivity().filter((a)=>a.consultantId===selected.id);
    const officers=Array.from({length:metrics.officerCount},(_,i)=>({id:selected.id+"-off-"+i,name:["Amina Yusuf","Ibrahim Musa","Grace Okeke","Samuel Adeyemi","Fatima Garba"][i%5],email:"field.officer"+(i+1)+"@"+selected.firmName.toLowerCase().replace(/[^a-z0-9]/g,"")+".ng",status:i%5===4?"Suspended":"Active"}));
    return <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={()=>setSelectedId(null)} className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#08733f]"><ArrowLeft className="h-4 w-4"/>All consultants</button><div className="flex gap-2"><button onClick={()=>setModal({mode:"coverage",record:selected})} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600"><MapPin className="h-3.5 w-3.5"/>Reassign coverage</button><button onClick={()=>setModal({mode:"edit",record:selected})} className="flex items-center gap-2 rounded-lg bg-[#08733f] px-3 py-2 text-[10px] font-bold text-white"><Edit3 className="h-3.5 w-3.5"/>Edit profile</button></div></div>
      {notice&&<p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{notice}</p>}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="flex gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 text-[#08733f]"><Building2 className="h-7 w-7"/></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-[#173b2a]">{selected.firmName}</h2><span className={"rounded-full border px-2.5 py-1 text-[10px] font-bold "+statusClass(selected.status)}>{selected.status}</span></div><p className="mt-1 text-xs text-slate-500">{selected.engagementRef} · {selected.regions.join(", ")||"No region assigned"}</p><div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-600"><span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5"/>{selected.adminName}</span><span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5"/>{selected.adminEmail}</span><span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5"/>{selected.adminPhone||"—"}</span></div></div></div><select value={selected.status} onChange={(e)=>changeStatus(selected,e.target.value as ConsultantStatus)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700">{statuses.map((s)=><option key={s}>{s}</option>)}</select></div></section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Field Officers",metrics.officerCount,UsersRound,"bg-blue-50 text-blue-600"],["Assigned Projects",metrics.assignedProjects.length,Building2,"bg-violet-50 text-violet-600"],["Approval Rate",metrics.approvalRate+"%",CheckCircle2,"bg-emerald-50 text-emerald-600"],["Avg. Review",metrics.averageTurnaroundHours+"h",Clock3,"bg-amber-50 text-amber-600"],["Re-inspection",metrics.reinspectionRate+"%",RefreshCw,"bg-rose-50 text-rose-600"]].map(([label,value,Icon,tone]:any)=><article key={label} className="group min-h-[112px] rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#9dceb0] hover:shadow-md"><div className="flex h-full flex-col items-center justify-center"><div className={"flex h-10 w-10 items-center justify-center rounded-lg transition-all group-hover:bg-[#08733f] group-hover:text-white "+tone}><Icon className="h-5 w-5 transition-transform group-hover:scale-110"/></div><p className="mt-2 text-sm font-semibold text-[#263c31]">{label}</p><p className="mt-1 text-[23px] font-bold leading-none text-[#173b2a]">{value}</p></div></article>)}</section>
      <section className="grid gap-4 xl:grid-cols-2"><article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Profile & coverage</h3><p className="mt-3 text-xs leading-6 text-slate-600">{selected.scopeNote||"No scope note recorded."}</p><div className="mt-4 flex flex-wrap gap-2">{selected.states.map((s)=><span key={s} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{s}</span>)}</div><p className="mt-4 text-[10px] text-slate-500">Engagement: {selected.engagementStart||"—"} → {selected.engagementEnd||"Open"}</p></article><article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">QA performance signal</h3><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{width:metrics.approvalRate+"%"}}/></div><p className="mt-4 text-xs leading-5 text-slate-600">{metrics.averageTurnaroundHours<12?"Review turnaround is unusually fast. Consider sampling approvals for QA consistency.":metrics.reinspectionRate>15?"Re-inspection rate is elevated and may need a quality review.":"Review behaviour is within the expected operating range."}</p></article></section>
      <section className="grid gap-4 xl:grid-cols-2"><article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Field Officers under this consultant</h3><div className="mt-3 divide-y divide-slate-100">{officers.map((o)=><div key={o.id} className="flex items-center justify-between py-3"><div><p className="text-xs font-bold text-slate-700">{o.name}</p><p className="mt-1 text-[10px] text-slate-500">{o.email}</p></div><span className={"text-[10px] font-bold "+(o.status==="Active"?"text-emerald-700":"text-rose-600")}>{o.status}</span></div>)}</div></article><article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Assigned Projects</h3><div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto">{metrics.assignedProjects.slice(0,12).map((p)=><div key={p.name} className="py-3"><div className="flex justify-between gap-3"><p className="text-xs font-bold text-slate-700">{p.name}</p><span className="text-[10px] text-slate-500">{p.state}</span></div><p className="mt-1 text-[10px] text-slate-500">{p.programme} · {p.component}</p></div>)}</div></article></section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Consultant activity & audit log</h3><div className="mt-3 divide-y divide-slate-100">{activity.length?activity.map((a)=><div key={a.id} className="flex gap-3 py-3"><span className={"mt-1 h-2.5 w-2.5 rounded-full "+(a.tone==="success"?"bg-emerald-500":a.tone==="warning"?"bg-amber-500":"bg-blue-500")}/><div className="flex-1"><div className="flex justify-between gap-4"><p className="text-xs font-bold text-slate-700">{a.action}</p><time className="text-[9px] text-slate-400">{new Date(a.timestamp).toLocaleString()}</time></div><p className="mt-1 text-[10px] text-slate-500">{a.details} · {a.actor}</p></div></div>):<p className="py-8 text-center text-xs text-slate-400">No activity recorded yet.</p>}</div></section>
      {modal&&<ConsultantModal title={modal.mode==="coverage"?"Reassign consultant coverage":"Edit Consultant"} description={modal.mode==="coverage"?"Update the regions and states this consultant can access.":"Update firm, administrator, engagement and access details."} value={modalValue} records={records} editingId={modal.record?.id} onClose={()=>setModal(null)} onSave={saveModal}/>}
    </div>;
  }

  return <div className="space-y-4 py-4">
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-[#173b2a]">Consultants</h2><p className="mt-1 text-xs text-slate-500">Manage consultant firms, coverage, access and delivery performance.</p></div><button onClick={()=>setModal({mode:"create"})} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 text-xs font-bold text-white"><Plus className="h-4 w-4"/>Create Consultant</button></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["Total Consultants",records.length,Building2,"bg-emerald-50 text-emerald-700"],["Active",records.filter((r)=>r.status==="Active").length,CheckCircle2,"bg-blue-50 text-blue-700"],["Pending Activation",records.filter((r)=>r.status==="Pending Activation").length,Clock3,"bg-amber-50 text-amber-700"],["Suspended",records.filter((r)=>r.status==="Inactive").length,ShieldOff,"bg-rose-50 text-rose-700"]].map(([label,value,Icon,tone]:any)=><article key={label} className="group min-h-[112px] rounded-lg border border-slate-200 bg-white p-4 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9dceb0] hover:shadow-md"><div className="flex h-full flex-col items-center justify-center"><div className={"flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200 group-hover:bg-[#08733f] group-hover:text-white "+tone}><Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110"/></div><p className="mt-2 text-sm font-semibold text-[#263c31]">{label}</p><p className="mt-1 text-[23px] font-bold leading-none tracking-tight text-[#13281e]">{value}</p><p className="mt-2 text-[11px] text-slate-500">Current consultant portfolio</p></div></article>)}
    </section>
    {notice&&<p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{notice}</p>}
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center"><div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(e)=>setQuery(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#08733f]" placeholder="Search consultants, admins, regions or states"/></div><select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600"><option>All</option>{statuses.map((s)=><option key={s}>{s}</option>)}</select><span className="ml-auto text-[10px] font-semibold text-slate-500">{filtered.length} consultants</span></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[940px] table-fixed text-left"><colgroup><col className="w-[31%]"/><col className="w-[10%]"/><col className="w-[15%]"/><col className="w-[18%]"/><col className="w-[14%]"/><col className="w-[12%]"/></colgroup><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3.5">Consultant / Firm</th><th className="px-3 py-3.5 text-center">Projects</th><th className="px-3 py-3.5 text-center">Reports Reviewed</th><th className="px-3 py-3.5 text-center">Approval / Turnaround</th><th className="px-3 py-3.5 text-center">Status</th><th className="px-3 py-3.5 text-center">Actions</th></tr></thead><tbody>{filtered.map((r)=>{const m=consultantMetrics(r);return <tr key={r.id} className="border-t border-slate-100 transition-colors hover:bg-[#f8fcf9]"><td className="px-5 py-4"><p className="text-sm font-bold text-[#173b2a]">{r.firmName}</p><p className="mt-1 text-[11px] text-slate-500">{r.adminName} · {r.adminEmail}</p></td><td className="px-3 py-4 text-center text-sm font-bold text-[#173b2a]">{m.assignedProjects.length}</td><td className="px-3 py-4 text-center text-sm font-bold text-[#173b2a]">{m.reviewed}</td><td className="px-3 py-4 text-center"><p className="text-sm font-bold text-[#173b2a]">{m.approvalRate}%</p><p className="mt-1 text-[11px] text-slate-500">{m.averageTurnaroundHours}h avg.</p></td><td className="px-3 py-4 text-center"><span className={"rounded-full border px-2.5 py-1 text-[10px] font-bold "+statusClass(r.status)}>{r.status}</span></td><td className="px-3 py-4"><div className="flex items-center justify-center gap-1.5"><button onClick={()=>setSelectedId(r.id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-[#08733f] transition-colors hover:bg-[#08733f] hover:text-white">View</button><button title="Edit consultant" onClick={()=>setModal({mode:"edit",record:r})} className="rounded-lg border border-slate-200 p-2 text-slate-500"><Edit3 className="h-3.5 w-3.5"/></button><button title="Reassign coverage" onClick={()=>setModal({mode:"coverage",record:r})} className="rounded-lg border border-slate-200 p-2 text-slate-500"><MapPin className="h-3.5 w-3.5"/></button><button title={r.status==="Inactive"?"Activate":"Deactivate"} onClick={()=>changeStatus(r,r.status==="Inactive"?"Active":"Inactive")} className={"rounded-lg border p-2 "+(r.status==="Inactive"?"border-emerald-200 text-emerald-600":"border-rose-200 text-rose-600")}><ShieldOff className="h-3.5 w-3.5"/></button></div></td></tr>})}</tbody></table>{!filtered.length&&<div className="p-10 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-300"/><p className="mt-3 text-xs font-semibold text-slate-500">No consultants match these filters.</p><div className="mt-4 flex justify-center gap-2"><button onClick={()=>{setQuery("");setStatusFilter("All")}} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-slate-600">Clear filters</button><button onClick={()=>{const seeded=defaultConsultants.map((record)=>({...record,regions:[...record.regions],states:[...record.states]}));save(seeded);setQuery("");setStatusFilter("All");setNotice("Sample consultant records restored.")}} className="rounded-lg bg-[#08733f] px-3 py-2 text-[10px] font-bold text-white">Restore consultant records</button></div></div>}</div>
    </section>
    {modal&&<ConsultantModal title={modal.mode==="create"?"Create Consultant":modal.mode==="coverage"?"Reassign consultant coverage":"Edit Consultant"} description={modal.mode==="create"?"Register a consultant and create email-based Consultant Admin access.":modal.mode==="coverage"?"Update the regions and states this consultant can access.":"Update firm, administrator, engagement and access details."} value={modalValue} records={records} editingId={modal.record?.id} onClose={()=>setModal(null)} onSave={saveModal}/>}
  </div>;
}
