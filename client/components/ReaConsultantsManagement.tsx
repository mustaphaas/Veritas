import { useMemo, useState } from "react";
import { ArrowLeft, Building2, CheckCircle2, Clock3, Edit3, Mail, MapPin, Phone, Plus, RefreshCw, Search, UserRound, UsersRound, X } from "lucide-react";
import {
  appendConsultantActivity,
  consultantMetrics,
  readConsultantActivity,
  readConsultants,
  writeConsultants,
  type ConsultantRecord,
  type ConsultantStatus,
} from "../lib/consultants";
import { appendAuditEvent } from "../lib/rea-admin";

const nigeriaStates = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];
const regions = ["North West","North East","North Central","South West","South East","South South"];
const inputClass = "mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-[#08733f] focus:ring-2 focus:ring-[#08733f]/10";

function statusClass(status: ConsultantStatus) {
  if (status === "Active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Inactive") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function safeAccounts() {
  try {
    const records = readConsultants();
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export default function ReaConsultantsManagement() {
  const [records, setRecords] = useState<ConsultantRecord[]>(safeAccounts);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    firmName: "",
    adminName: "",
    adminEmail: "",
    adminPhone: "",
    regions: [] as string[],
    states: [] as string[],
    status: "Pending Activation" as ConsultantStatus,
    engagementRef: "",
    scopeNote: "",
    engagementStart: "",
    engagementEnd: "",
    temporaryPassword: "Consult2026!",
  });

  const selected = useMemo(() => records.find((r) => r.id === selectedId) ?? null, [records, selectedId]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => `${r.firmName} ${r.adminName} ${r.adminEmail} ${(r.states ?? []).join(" ")}`.toLowerCase().includes(q));
  }, [records, query]);

  const save = (next: ConsultantRecord[]) => {
    setRecords(next);
    writeConsultants(next);
  };

  const createConsultant = () => {
    if (!form.firmName.trim() || !form.adminName.trim() || !form.adminEmail.trim() || !form.engagementRef.trim()) return;
    const record: ConsultantRecord = {
      ...form,
      id: `con-${Date.now()}`,
      states: [...form.states],
      regions: [...form.regions],
    };
    save([record, ...records]);
    appendConsultantActivity({ consultantId: record.id, action: "Consultant created", details: `${record.firmName} registered`, actor: "REA Administrator", tone: "success" });
    appendAuditEvent({ actor: "REA Administrator", action: "Created consultant", category: "User Management", target: record.firmName, details: `Consultant Admin ${record.adminEmail} created`, severity: "Success" });
    setShowCreate(false);
    setForm({ firmName:"", adminName:"", adminEmail:"", adminPhone:"", regions:[], states:[], status:"Pending Activation", engagementRef:"", scopeNote:"", engagementStart:"", engagementEnd:"", temporaryPassword:"Consult2026!" });
  };

  const setStatus = (record: ConsultantRecord, status: ConsultantStatus) => {
    const updated = { ...record, status };
    save(records.map((r) => r.id === record.id ? updated : r));
    appendConsultantActivity({ consultantId: record.id, action: `Status changed to ${status}`, details: `${record.firmName} is now ${status}`, actor: "REA Administrator", tone: status === "Active" ? "success" : "warning" });
  };

  if (selected) {
    const metrics = consultantMetrics(selected);
    const activity = readConsultantActivity().filter((a) => a.consultantId === selected.id);
    const demoOfficers = Array.from({ length: metrics.officerCount }, (_, i) => ({
      id: `${selected.id}-off-${i}`,
      name: ["Amina Yusuf","Ibrahim Musa","Grace Okeke","Samuel Adeyemi","Fatima Garba"][i % 5],
      email: `field.officer${i + 1}@${selected.firmName.toLowerCase().replace(/[^a-z0-9]/g, "")}.ng`,
      status: i % 5 === 4 ? "Suspended" : "Active",
    }));

    return <div className="space-y-4 py-4">
      <button type="button" onClick={() => setSelectedId(null)} className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-[#08733f]"><ArrowLeft className="h-4 w-4" />All consultants</button>
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50 text-[#08733f]"><Building2 className="h-7 w-7" /></div><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold text-[#173b2a]">{selected.firmName}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(selected.status)}`}>{selected.status}</span></div><p className="mt-1 text-xs text-slate-500">{selected.engagementRef} · {(selected.regions ?? []).join(", ") || "No region assigned"}</p><div className="mt-3 flex flex-wrap gap-4 text-[11px] text-slate-600"><span className="flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{selected.adminName}</span><span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{selected.adminEmail}</span><span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{selected.adminPhone || "—"}</span></div></div></div>
          <select value={selected.status} onChange={(e) => setStatus(selected, e.target.value as ConsultantStatus)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"><option>Active</option><option>Inactive</option><option>Pending Activation</option></select>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[ ["Field Officers", metrics.officerCount, UsersRound, "bg-blue-50 text-blue-600"], ["Assigned Projects", metrics.assignedProjects.length, Building2, "bg-violet-50 text-violet-600"], ["Approval Rate", `${metrics.approvalRate}%`, CheckCircle2, "bg-emerald-50 text-emerald-600"], ["Avg. Review", `${metrics.averageTurnaroundHours}h`, Clock3, "bg-amber-50 text-amber-600"], ["Re-inspection", `${metrics.reinspectionRate}%`, RefreshCw, "bg-rose-50 text-rose-600"] ].map(([label,value,Icon,tone]: any) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}><Icon className="h-4 w-4" /></div><p className="mt-3 text-[10px] font-semibold text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-[#173b2a]">{value}</p></article>)}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Profile & coverage</h3><p className="mt-3 text-xs leading-6 text-slate-600">{selected.scopeNote || "No scope note recorded."}</p><div className="mt-4 flex flex-wrap gap-2">{(selected.states ?? []).map((state) => <span key={state} className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-600">{state}</span>)}</div><p className="mt-4 text-[10px] text-slate-500">Engagement: {selected.engagementStart || "—"} → {selected.engagementEnd || "Open"}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">QA performance signal</h3><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: `${metrics.approvalRate}%` }} /></div><p className="mt-4 text-xs leading-5 text-slate-600">{metrics.averageTurnaroundHours < 12 ? "Review turnaround is unusually fast. Consider sampling approvals for QA consistency." : metrics.reinspectionRate > 15 ? "Re-inspection rate is elevated and may need a quality review." : "Review behaviour is within the expected operating range."}</p></article>
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Field Officers under this consultant</h3><div className="mt-3 divide-y divide-slate-100">{demoOfficers.map((officer) => <div key={officer.id} className="flex items-center justify-between py-3"><div><p className="text-xs font-bold text-slate-700">{officer.name}</p><p className="mt-1 text-[10px] text-slate-500">{officer.email}</p></div><span className={`text-[10px] font-bold ${officer.status === "Active" ? "text-emerald-700" : "text-rose-600"}`}>{officer.status}</span></div>)}</div></article>
        <article className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Assigned Projects</h3><div className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto">{metrics.assignedProjects.slice(0, 12).map((project) => <div key={project.name} className="py-3"><div className="flex justify-between gap-3"><p className="text-xs font-bold text-slate-700">{project.name}</p><span className="text-[10px] text-slate-500">{project.state}</span></div><p className="mt-1 text-[10px] text-slate-500">{project.programme} · {project.component}</p></div>)}</div></article>
      </section>
      <section className="rounded-xl border border-slate-200 bg-white p-5"><h3 className="text-sm font-bold text-[#173b2a]">Consultant activity & audit log</h3><div className="mt-3 divide-y divide-slate-100">{activity.length ? activity.map((item) => <div key={item.id} className="flex gap-3 py-3"><span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.tone === "success" ? "bg-emerald-500" : item.tone === "warning" ? "bg-amber-500" : "bg-blue-500"}`} /><div className="flex-1"><div className="flex justify-between gap-4"><p className="text-xs font-bold text-slate-700">{item.action}</p><time className="text-[9px] text-slate-400">{new Date(item.timestamp).toLocaleString()}</time></div><p className="mt-1 text-[10px] text-slate-500">{item.details} · {item.actor}</p></div></div>) : <p className="py-8 text-center text-xs text-slate-400">No activity recorded yet.</p>}</div></section>
    </div>;
  }

  return <div className="space-y-4 py-4">
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-bold text-[#173b2a]">Consultants</h2><p className="mt-1 text-xs text-slate-500">Manage consultant firms, coverage, access and delivery performance.</p></div><button type="button" onClick={() => setShowCreate(true)} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 text-xs font-bold text-white"><Plus className="h-4 w-4" />Create Consultant</button></section>
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="relative max-w-sm flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#08733f]" placeholder="Search consultants, admins or states" /></div><span className="text-[10px] font-semibold text-slate-500">{filtered.length} consultants</span></div><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Consultant / Firm</th><th className="px-4 py-3">Region(s)</th><th className="px-4 py-3">Field Officers</th><th className="px-4 py-3">Projects</th><th className="px-4 py-3">Reports Reviewed</th><th className="px-4 py-3">Approval / Turnaround</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{filtered.map((record) => { const metrics = consultantMetrics(record); return <tr key={record.id} className="border-t border-slate-100"><td className="px-4 py-4"><p className="text-xs font-bold text-[#173b2a]">{record.firmName}</p><p className="mt-1 text-[10px] text-slate-500">{record.adminName} · {record.adminEmail}</p></td><td className="px-4 py-4 text-xs text-slate-600">{(record.regions ?? []).join(", ") || "—"}</td><td className="px-4 py-4 text-xs font-semibold text-slate-700">{metrics.officerCount}</td><td className="px-4 py-4 text-xs font-semibold text-slate-700">{metrics.assignedProjects.length}</td><td className="px-4 py-4 text-xs font-semibold text-slate-700">{metrics.reviewed}</td><td className="px-4 py-4"><p className="text-xs font-bold text-slate-700">{metrics.approvalRate}%</p><p className="text-[10px] text-slate-500">{metrics.averageTurnaroundHours}h avg.</p></td><td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusClass(record.status)}`}>{record.status}</span></td><td className="px-4 py-4"><button type="button" onClick={() => setSelectedId(record.id)} className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-bold text-[#08733f] hover:bg-emerald-50">View</button></td></tr> })}</tbody></table>{filtered.length === 0 && <div className="p-10 text-center text-xs text-slate-400">No consultants match your search.</div>}</div></section>
    {showCreate && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5"><section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold text-[#173b2a]">Create Consultant</h3><p className="mt-1 text-xs text-slate-500">Register a consultant and create email-based Consultant Admin access.</p></div><button type="button" onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-slate-500" /></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-[10px] font-bold uppercase text-slate-500">Organization / firm name<input className={inputClass} value={form.firmName} onChange={(e) => setForm({ ...form, firmName: e.target.value })} /></label><label className="text-[10px] font-bold uppercase text-slate-500">Consultant Admin name<input className={inputClass} value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} /></label><label className="text-[10px] font-bold uppercase text-slate-500">Admin email<input type="email" className={inputClass} value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} /></label><label className="text-[10px] font-bold uppercase text-slate-500">Phone<input className={inputClass} value={form.adminPhone} onChange={(e) => setForm({ ...form, adminPhone: e.target.value })} /></label><label className="text-[10px] font-bold uppercase text-slate-500">Contract / engagement reference<input className={inputClass} value={form.engagementRef} onChange={(e) => setForm({ ...form, engagementRef: e.target.value })} /></label><label className="text-[10px] font-bold uppercase text-slate-500">Status<select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ConsultantStatus })}><option>Active</option><option>Inactive</option><option>Pending Activation</option></select></label><label className="text-[10px] font-bold uppercase text-slate-500">Engagement start<input type="date" className={inputClass} value={form.engagementStart} onChange={(e) => setForm({ ...form, engagementStart: e.target.value })} /></label><label className="text-[10px] font-bold uppercase text-slate-500">Engagement end<input type="date" className={inputClass} value={form.engagementEnd} onChange={(e) => setForm({ ...form, engagementEnd: e.target.value })} /></label><div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase text-slate-500">Assigned regions</p><div className="mt-2 flex flex-wrap gap-2">{regions.map((region) => <button key={region} type="button" onClick={() => setForm({ ...form, regions: form.regions.includes(region) ? form.regions.filter((r) => r !== region) : [...form.regions, region] })} className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${form.regions.includes(region) ? "border-[#08733f] bg-emerald-50 text-[#08733f]" : "border-slate-200 text-slate-500"}`}>{region}</button>)}</div></div><div className="sm:col-span-2"><p className="text-[10px] font-bold uppercase text-slate-500">Assigned states</p><div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2">{nigeriaStates.map((state) => <label key={state} className="mr-3 inline-flex items-center gap-1.5 py-1 text-[10px] text-slate-600"><input type="checkbox" checked={form.states.includes(state)} onChange={() => setForm({ ...form, states: form.states.includes(state) ? form.states.filter((s) => s !== state) : [...form.states, state] })} />{state}</label>)}</div></div><label className="text-[10px] font-bold uppercase text-slate-500 sm:col-span-2">Scope note<textarea className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-[#08733f]" value={form.scopeNote} onChange={(e) => setForm({ ...form, scopeNote: e.target.value })} /></label></div><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button type="button" onClick={createConsultant} className="rounded-lg bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white">Create Consultant</button></div></section></div>}
  </div>;
}
