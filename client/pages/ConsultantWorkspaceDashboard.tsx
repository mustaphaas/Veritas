import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Building2, CheckCircle2, ClipboardCheck, FileText, FolderKanban, Home, LogOut, Plus, ShieldCheck, UserPlus, UsersRound, X } from "lucide-react";
import { projects } from "../lib/dashboard-data";
import { useAuth } from "../lib/auth";
import { readConsultants } from "../lib/consultants";
import { getAssignmentConsultant, getOfficerConsultant, setAssignmentConsultant, setOfficerConsultant } from "../lib/consultant-tenancy";
import { getAssignmentDisplayStatus, useInspectionWorkflow, type InspectionAssignment } from "../lib/inspection-workflow";

const routes = [
  ["Overview", Home, "/consultant-admin"],
  ["Projects", FolderKanban, "/consultant-admin/projects"],
  ["Field Officers", UsersRound, "/consultant-admin/officers"],
  ["Verification", ShieldCheck, "/consultant-admin/verification"],
  ["Reports", FileText, "/consultant-admin/reports"],
] as const;
const input="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-emerald-600";

function Pill({status}:{status:InspectionAssignment["status"]}){
  const label=getAssignmentDisplayStatus(status);
  const cls=label==="Verified"?"bg-emerald-100 text-emerald-700":label==="Approved"?"bg-blue-100 text-blue-700":label==="Draft"?"bg-amber-100 text-amber-700":"bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cls}`}>{label}</span>;
}

export default function ConsultantWorkspaceDashboard(){
  const {session,logout}=useAuth();
  const navigate=useNavigate();
  const location=useLocation();
  const workflow=useInspectionWorkflow();
  const consultant=readConsultants().find(c=>c.id===session?.consultantId||c.adminEmail.toLowerCase()===session?.email.toLowerCase());
  const consultantId=consultant?.id||session?.consultantId||"con-001";
  const defaultConsultant=consultantId==="con-001";
  const ownedOfficers=useMemo(()=>workflow.fieldOfficers.filter(o=>{
    const owner=getOfficerConsultant(o.email);
    return owner===consultantId||(!owner&&defaultConsultant);
  }),[workflow.fieldOfficers,consultantId,defaultConsultant]);
  const officerNames=new Set(ownedOfficers.map(o=>o.name));
  const ownedAssignments=useMemo(()=>workflow.assignments.filter(a=>{
    const owner=getAssignmentConsultant(a.id);
    return owner===consultantId||(!owner&&officerNames.has(a.officer));
  }),[workflow.assignments,consultantId,ownedOfficers.length]);
  const coveredProjects=useMemo(()=>projects.filter(p=>!consultant||consultant.states.includes(p.state)),[consultant]);
  const view=location.pathname.endsWith("/projects")?"Projects":location.pathname.endsWith("/officers")?"Field Officers":location.pathname.endsWith("/verification")?"Verification":location.pathname.endsWith("/reports")?"Reports":"Overview";
  const [modal,setModal]=useState<"officer"|"assign"|null>(null);
  const [notice,setNotice]=useState("");
  const submitted=ownedAssignments.filter(a=>a.status==="Submitted");
  const approved=ownedAssignments.filter(a=>a.status==="Approved");
  const verified=ownedAssignments.filter(a=>a.status==="Verified");

  return <div className="min-h-screen bg-[#f5f8f6] text-slate-800">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#08733f] text-white"><Building2 className="h-5 w-5"/></div><div><h1 className="font-bold text-[#173b2a]">{consultant?.firmName||"Consultant Administration"}</h1><p className="text-[11px] text-slate-500">{consultant?.adminName||session?.name} · Consultant Admin</p></div></div>
        <button onClick={logout} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4"/>Sign out</button>
      </div>
    </header>
    <div className="mx-auto flex max-w-[1500px] gap-5 px-5 py-5">
      <aside className="hidden w-56 shrink-0 lg:block"><nav className="sticky top-24 space-y-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{routes.map(([label,Icon,path])=><button key={label} onClick={()=>navigate(path)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-xs font-bold ${view===label?"bg-emerald-50 text-[#08733f]":"text-slate-500 hover:bg-slate-50"}`}><Icon className="h-4 w-4"/>{label}</button>)}</nav></aside>
      <main className="min-w-0 flex-1 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#08733f]">Consultant Workspace</p><h2 className="mt-1 text-2xl font-bold text-[#173b2a]">{view}</h2><p className="mt-1 text-sm text-slate-500">{consultant?.states.join(", ")||"Assigned REA coverage"}</p></div><div className="flex gap-2"><button onClick={()=>setModal("officer")} className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-[#08733f]"><UserPlus className="h-4 w-4"/>Create Field Officer</button><button onClick={()=>setModal("assign")} className="flex items-center gap-2 rounded-lg bg-[#08733f] px-3 py-2 text-xs font-bold text-white"><Plus className="h-4 w-4"/>Assign Job</button></div></div>
        {notice&&<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div>}
        {view==="Overview"&&<>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Covered Projects",coveredProjects.length,FolderKanban],["Field Officers",ownedOfficers.length,UsersRound],["Pending QA",submitted.length,ClipboardCheck],["REA Verified",verified.length,CheckCircle2]].map(([label,value,Icon]:any)=><article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#08733f]"><Icon className="h-5 w-5"/></div><p className="mt-4 text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold text-[#173b2a]">{value}</p></article>)}</section>
          <Table assignments={ownedAssignments.slice(0,8)}/>
        </>}
        {view==="Projects"&&<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h3 className="font-bold text-[#173b2a]">Projects available to this consultant</h3><p className="text-xs text-slate-500">Only projects within the states assigned by REA are shown.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Project</th><th className="p-3">Programme</th><th className="p-3">Component</th><th className="p-3">State</th><th className="p-3">Contractor</th></tr></thead><tbody>{coveredProjects.map(p=><tr key={p.name} className="border-t border-slate-100"><td className="p-3 font-semibold text-[#173b2a]">{p.name}</td><td className="p-3">{p.programme}</td><td className="p-3">{p.component}</td><td className="p-3">{p.state}</td><td className="p-3">{p.contractor}</td></tr>)}</tbody></table></div></section>}
        {view==="Field Officers"&&<section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ownedOfficers.map(o=><article key={o.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 font-bold text-[#08733f]">{o.name.split(" ").map(x=>x[0]).slice(0,2).join("")}</div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${o.status==="Active"?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700"}`}>{o.status}</span></div><h3 className="mt-4 font-bold text-[#173b2a]">{o.name}</h3><p className="text-xs text-slate-500">{o.email}</p><p className="mt-2 text-xs text-slate-500">{o.phone} · {o.zone}</p><p className="mt-3 text-[11px] font-semibold text-slate-400">{ownedAssignments.filter(a=>a.officer===o.name).length} assigned jobs</p></article>)}</section>}
        {view==="Verification"&&<section className="space-y-3">{submitted.length===0?<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No field reports are waiting for Consultant Admin QA.</div>:submitted.map(a=><article key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-[#173b2a]">{a.projectName}</h3><p className="mt-1 text-xs text-slate-500">{a.officer} · {a.state} · {a.component}</p><p className="mt-2 text-xs text-slate-500">Submitted {a.report?.submittedAt?new Date(a.report.submittedAt).toLocaleString():"for QA"}</p></div><div className="flex gap-2"><button onClick={()=>{workflow.reviewReport(a.id,"Re-inspection","Consultant Admin requested correction/re-inspection.");setNotice(`${a.projectName} returned for re-inspection.`)}} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Re-inspection</button><button onClick={()=>{workflow.reviewReport(a.id,"Approved","Approved by Consultant Admin QA.");setNotice(`${a.projectName} approved and sent to REA for verification.`)}} className="rounded-lg bg-[#08733f] px-3 py-2 text-xs font-bold text-white">Approve for REA</button></div></div></article>)}</section>}
        {view==="Reports"&&<Table assignments={ownedAssignments.filter(a=>a.report)}/>}      
      </main>
    </div>
    {modal==="officer"&&<CreateOfficer consultantId={consultantId} onClose={()=>setModal(null)} onDone={m=>{setNotice(m);setModal(null)}}/>}
    {modal==="assign"&&<AssignJob consultantId={consultantId} projectsList={coveredProjects} officers={ownedOfficers} assignments={workflow.assignments} onClose={()=>setModal(null)} onDone={m=>{setNotice(m);setModal(null)}}/>}
  </div>
}

function Table({assignments}:{assignments:InspectionAssignment[]}){return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><h3 className="font-bold text-[#173b2a]">Inspection workflow</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">Project</th><th className="p-3">Officer</th><th className="p-3">Location</th><th className="p-3">Status</th><th className="p-3">Sync</th></tr></thead><tbody>{assignments.map(a=><tr key={a.id} className="border-t border-slate-100"><td className="p-3"><b className="text-[#173b2a]">{a.projectName}</b><div className="text-[10px] text-slate-400">{a.id}</div></td><td className="p-3">{a.officer}</td><td className="p-3">{a.state} / {a.lga}</td><td className="p-3"><Pill status={a.status}/></td><td className="p-3 capitalize">{a.syncStatus}</td></tr>)}</tbody></table></div></section>}

function CreateOfficer({consultantId,onClose,onDone}:{consultantId:string;onClose:()=>void;onDone:(m:string)=>void}){
 const {createFieldOfficer}=useInspectionWorkflow(); const [form,setForm]=useState({name:"",email:"",phone:"",zone:"North West",device:`REA-FO-${Math.random().toString(36).slice(2,6).toUpperCase()}`,password:"Field2026!"}); const [error,setError]=useState("");
 const submit=()=>{const result=createFieldOfficer(form);if(!result.ok)return setError(result.message);setOfficerConsultant(form.email,consultantId);onDone(`${form.name} created and linked to this consultant.`)};
 return <Modal title="Create Field Officer" onClose={onClose}><div className="grid gap-3 sm:grid-cols-2"><input className={input} placeholder="Full name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><input className={input} placeholder="Email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/><input className={input} placeholder="Phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/><select className={input} value={form.zone} onChange={e=>setForm({...form,zone:e.target.value})}>{["North West","North East","North Central","South West","South East","South South"].map(x=><option key={x}>{x}</option>)}</select><input className={input} value={form.device} onChange={e=>setForm({...form,device:e.target.value})}/><input className={input} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></div>{error&&<p className="mt-3 text-xs font-bold text-red-600">{error}</p>}<button onClick={submit} className="mt-5 w-full rounded-lg bg-[#08733f] py-3 text-xs font-bold text-white">Create Field Officer</button></Modal>
}

function AssignJob({consultantId,projectsList,officers,assignments,onClose,onDone}:{consultantId:string;projectsList:any[];officers:any[];assignments:InspectionAssignment[];onClose:()=>void;onDone:(m:string)=>void}){
 const {assignProject}=useInspectionWorkflow(); const available=projectsList.filter(p=>!assignments.some(a=>a.projectName===p.name)); const [projectName,setProjectName]=useState(available[0]?.name||""); const [officer,setOfficer]=useState(officers.find(o=>o.status==="Active")?.name||""); const [due,setDue]=useState(new Date(Date.now()+7*86400000).toISOString().slice(0,10)); const project=available.find(p=>p.name===projectName);
 const submit=()=>{if(!project||!officer)return;const assignment=assignProject(project,officer,new Date(`${due}T17:00:00`).toISOString());if(!assignment)return;setAssignmentConsultant(assignment.id,consultantId);onDone(`${project.name} assigned to ${officer}.`)};
 return <Modal title="Assign Job" onClose={onClose}><div className="space-y-3"><select className={input} value={projectName} onChange={e=>setProjectName(e.target.value)}>{available.map(p=><option key={p.name}>{p.name}</option>)}</select><select className={input} value={officer} onChange={e=>setOfficer(e.target.value)}>{officers.filter(o=>o.status==="Active").map(o=><option key={o.id} value={o.name}>{o.name} · {o.zone}</option>)}</select><input type="date" className={input} value={due} onChange={e=>setDue(e.target.value)}/>{project&&<div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{project.programme} · {project.component} · {project.state} · {project.contractor}</div>}</div><button onClick={submit} disabled={!project||!officer} className="mt-5 w-full rounded-lg bg-[#08733f] py-3 text-xs font-bold text-white disabled:opacity-40">Assign Job</button></Modal>
}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:any}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"><section className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h3 className="text-lg font-bold text-[#173b2a]">{title}</h3><button onClick={onClose}><X className="h-5 w-5 text-slate-500"/></button></div>{children}</section></div>}
