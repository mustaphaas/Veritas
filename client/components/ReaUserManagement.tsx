import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Search, ShieldCheck, UserPlus, UserRoundCog, UserRoundX, X } from "lucide-react";
import { createReaStaffApi, fetchReaPortalUsers } from "../lib/field-api";
import { reaAccessModules } from "../lib/rea-admin";

type PortalUser = {
  id: string; name: string; email: string; phone?: string; role: string;
  classification: "REA Staff" | "Consultant Admin" | "Field Officer" | "Other";
  consultantFirm?: string; department?: string; access?: string[];
  status: "Active" | "Suspended"; createdAt?: string;
};

const STAFF_ROLES = ["Programme Manager", "Verification Officer", "Claims Officer", "Analyst", "Viewer"];

function roleLabel(role: string) {
  if (role === "rea_admin") return "REA Administrator";
  if (role === "consultant_admin") return "Consultant Admin";
  if (role === "field_officer") return "Field Officer";
  return role || "REA Staff";
}

function makePassword() {
  return `REA-${Math.random().toString(36).slice(2, 7).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function ReaUserManagement() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [query, setQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("All users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({
    name: "", email: "", phone: "", department: "", staffRole: "Programme Manager",
    temporaryPassword: makePassword(), access: ["Overview", "Field Inspections", "Verification", "Reports"],
  });

  const loadUsers = () => {
    setLoading(true);
    fetchReaPortalUsers().then((payload) => {
      setUsers(Array.isArray(payload.users) ? payload.users : []);
      setError("");
    }).catch((reason) => {
      setUsers([]);
      setError(reason instanceof Error ? reason.message : "Unable to load portal users from the database.");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const visible = useMemo(() => users.filter((user) => {
    const text = `${user.name} ${user.email} ${user.role} ${user.classification} ${user.consultantFirm || ""}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (classificationFilter === "All users" || user.classification === classificationFilter);
  }), [users, query, classificationFilter]);

  const activeAccounts = users.filter((user) => user.status === "Active").length;
  const reaStaff = users.filter((user) => user.classification === "REA Staff").length;
  const suspended = users.filter((user) => user.status === "Suspended").length;

  const toggleAccess = (module: string) => setForm((current) => ({
    ...current,
    access: current.access.includes(module) ? current.access.filter((item) => item !== module) : [...current.access, module],
  }));

  async function createStaff() {
    setSuccess(""); setError("");
    if (!form.name.trim() || !form.email.trim() || !form.temporaryPassword) {
      setError("Name, email and temporary password are required."); return;
    }
    setSaving(true);
    try {
      await createReaStaffApi(form);
      setSuccess("REA staff account created successfully.");
      setShowCreate(false);
      setForm({ name: "", email: "", phone: "", department: "", staffRole: "Programme Manager", temporaryPassword: makePassword(), access: ["Overview", "Field Inspections", "Verification", "Reports"] });
      loadUsers();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create the REA staff account.");
    } finally { setSaving(false); }
  }

  return <div className="space-y-4 pb-8 pt-4">
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-[#08733f]"/><h2 className="text-xl font-bold text-[#173b2a]">Staff & Access Management</h2></div>
        <p className="mt-1 text-xs text-slate-500">Manage REA portal accounts directly in the Veritas production database.</p>
      </div>
      <button type="button" onClick={() => { setError(""); setSuccess(""); setShowCreate(true); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#075d34]"><UserPlus className="h-4 w-4"/> Add REA Staff</button>
    </section>

    {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">{success}</div>}
    {error && !showCreate && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-3"><Stat icon={BadgeCheck} label="Active accounts" value={activeAccounts} tone="emerald" detail="All active portal users"/><Stat icon={ShieldCheck} label="REA Staff" value={reaStaff} tone="blue" detail="REA-owned user roles"/><Stat icon={UserRoundX} label="Suspended" value={suspended} tone="amber" detail="All suspended portal users"/></section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search portal users" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#08733f]"/></div>
        <select value={classificationFilter} onChange={(event)=>setClassificationFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"><option>All users</option><option>REA Staff</option><option>Consultant Admin</option><option>Field Officer</option><option>Other</option></select>
      </div>
      {loading ? <div className="p-8 text-center text-xs font-medium text-slate-500">Loading users from the Veritas database…</div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] table-fixed text-left"><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">User Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Classification</th><th className="px-4 py-3">Role / Department</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Access</th></tr></thead>
        <tbody>{visible.map((user)=><tr key={user.id} className="border-t border-slate-100 hover:bg-[#f8fcf9]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{user.name.split(/\s+/).slice(0,2).map((part)=>part[0]).join("")}</span><p className="text-xs font-bold text-slate-800">{user.name}</p></div></td><td className="px-4 py-4 text-xs text-slate-600">{user.email || "—"}</td><td className="px-4 py-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{user.classification}</span></td><td className="px-4 py-4"><p className="text-xs font-semibold text-slate-700">{roleLabel(user.role)}</p><p className="mt-0.5 text-[10px] text-slate-500">{user.department || user.consultantFirm || (user.classification === "REA Staff" ? "Rural Electrification Agency" : "—")}</p></td><td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{user.status}</span></td><td className="px-4 py-4 text-[10px] text-slate-500">{user.classification === "REA Staff" ? (user.access?.length || 0) + " modules" : "—"}</td></tr>)}</tbody></table>{visible.length === 0 && <div className="border-t border-slate-100 p-8 text-center text-xs text-slate-500">No database users match this view.</div>}</div>}
    </section>

    {showCreate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><div><h3 className="text-lg font-bold text-[#173b2a]">Add REA Staff</h3><p className="mt-1 text-xs text-slate-500">Create a real Veritas account and assign dashboard access.</p></div><button type="button" onClick={()=>setShowCreate(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5"/></button></div>
        <div className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label="Full name"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Musa Ibrahim" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"/></Field>
          <Field label="Email address"><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="name@rea.gov.ng" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"/></Field>
          <Field label="Phone number"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="Optional" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"/></Field>
          <Field label="Department"><input value={form.department} onChange={e=>setForm({...form,department:e.target.value})} placeholder="e.g. Programme Delivery" className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"/></Field>
          <Field label="Role"><select value={form.staffRole} onChange={e=>setForm({...form,staffRole:e.target.value})} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]">{STAFF_ROLES.map(role=><option key={role}>{role}</option>)}</select></Field>
          <Field label="Temporary password"><div className="flex gap-2"><input value={form.temporaryPassword} onChange={e=>setForm({...form,temporaryPassword:e.target.value})} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-[#08733f]"/><button type="button" onClick={()=>setForm({...form,temporaryPassword:makePassword()})} className="rounded-lg border border-slate-200 px-3 text-[10px] font-bold text-slate-600">Generate</button></div></Field>
          <div className="sm:col-span-2"><p className="mb-2 text-xs font-bold text-slate-700">Dashboard access</p><div className="grid gap-2 sm:grid-cols-3">{reaAccessModules.map(module=><label key={module} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-xs font-medium text-slate-700"><input type="checkbox" checked={form.access.includes(module)} onChange={()=>toggleAccess(module)}/>{module}</label>)}</div></div>
          {error && <div className="sm:col-span-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4"><button type="button" onClick={()=>setShowCreate(false)} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600">Cancel</button><button type="button" disabled={saving} onClick={createStaff} className="rounded-lg bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">{saving ? "Creating…" : "Create REA Staff"}</button></div>
      </div>
    </div>}
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block"><span className="mb-1.5 block text-[11px] font-bold text-slate-600">{label}</span>{children}</label>}
function Stat({icon:Icon,label,value,tone,detail}:{icon:any,label:string,value:number,tone:string,detail:string}){const classes=tone==="emerald"?"bg-emerald-50 text-emerald-700":tone==="blue"?"bg-blue-50 text-blue-700":"bg-amber-50 text-amber-700";return <article className="group min-h-[104px] rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm"><div className="flex h-full items-start gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${classes}`}><Icon className="h-5 w-5"/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#263c31]">{label}</p><p className="mt-1 text-[23px] font-bold leading-none text-[#13281e]">{value}</p><p className="mt-2 text-[11px] text-slate-500">{detail}</p></div></div></article>}
