import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Search, ShieldCheck, UserRoundCog, UserRoundX } from "lucide-react";
import { fetchReaPortalUsers } from "../lib/field-api";

type PortalUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  classification: "REA Staff" | "Consultant Admin" | "Field Officer" | "Other";
  consultantFirm?: string;
  status: "Active" | "Suspended";
  createdAt?: string;
};

function roleLabel(role: string) {
  if (role === "rea_admin") return "REA Administrator";
  if (role === "consultant_admin") return "Consultant Admin";
  if (role === "field_officer") return "Field Officer";
  if (role.startsWith("rea_")) return role.slice(4).split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  return role.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export default function ReaUserManagement() {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [query, setQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("All users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchReaPortalUsers()
      .then((payload) => {
        if (!active) return;
        setUsers(Array.isArray(payload.users) ? payload.users : []);
        setError("");
      })
      .catch((reason) => {
        if (!active) return;
        setUsers([]);
        setError(reason instanceof Error ? reason.message : "Unable to load portal users from the database.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => users.filter((user) => {
    const matchesQuery = `${user.name} ${user.email} ${user.role} ${user.classification} ${user.consultantFirm || ""}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (classificationFilter === "All users" || user.classification === classificationFilter);
  }), [users, query, classificationFilter]);

  const activeAccounts = users.filter((user) => user.status === "Active").length;
  const reaStaff = users.filter((user) => user.classification === "REA Staff").length;
  const suspended = users.filter((user) => user.status === "Suspended").length;

  return <div className="space-y-4 pb-8 pt-4">
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div><div className="flex items-center gap-2"><UserRoundCog className="h-5 w-5 text-[#08733f]"/><h2 className="text-xl font-bold text-[#173b2a]">Staff & Access Management</h2></div><p className="mt-1 text-xs text-slate-500">Live portal accounts from the Veritas production database, classified by organisation role.</p></div>
      <span className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-700">Database source</span>
    </section>

    <section className="grid gap-3 sm:grid-cols-3"><Stat icon={BadgeCheck} label="Active accounts" value={activeAccounts} tone="emerald" detail="All active portal users"/><Stat icon={ShieldCheck} label="REA Staff" value={reaStaff} tone="blue" detail="REA-owned user roles only"/><Stat icon={UserRoundX} label="Suspended" value={suspended} tone="amber" detail="All suspended portal users"/></section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search portal users" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#08733f]"/></div><select value={classificationFilter} onChange={(event)=>setClassificationFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"><option>All users</option><option>REA Staff</option><option>Consultant Admin</option><option>Field Officer</option><option>Other</option></select></div>
      {loading && <div className="p-8 text-center text-xs font-medium text-slate-500">Loading users from the Veritas database…</div>}
      {!loading && error && <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-700">{error} No demo or browser-stored users are being shown.</div>}
      {!loading && !error && <div className="overflow-x-auto"><table className="w-full min-w-[940px] table-fixed text-left"><colgroup><col className="w-[22%]"/><col className="w-[23%]"/><col className="w-[18%]"/><col className="w-[20%]"/><col className="w-[9%]"/><col className="w-[8%]"/></colgroup><thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-3">User Name</th><th className="px-4 py-3">Email Address</th><th className="px-4 py-3">Classification</th><th className="px-4 py-3">Role / Organisation</th><th className="px-4 py-3 text-center">Status</th><th className="px-4 py-3 text-center">Source</th></tr></thead><tbody>{visible.map((user)=><tr key={user.id} className="border-t border-slate-100 transition hover:bg-[#f8fcf9]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">{user.name.split(/\s+/).slice(0,2).map((part)=>part[0]).join("")}</span><p className="text-xs font-bold text-slate-800">{user.name}</p></div></td><td className="px-4 py-4 text-xs font-medium text-slate-600">{user.email || "—"}</td><td className="px-4 py-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-700">{user.classification}</span></td><td className="px-4 py-4"><p className="text-xs font-semibold text-slate-700">{roleLabel(user.role)}</p><p className="mt-0.5 text-[10px] text-slate-500">{user.consultantFirm || (user.classification === "REA Staff" ? "Rural Electrification Agency" : "—")}</p></td><td className="px-4 py-4 text-center"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${user.status === "Active" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{user.status}</span></td><td className="px-4 py-4 text-center text-[10px] font-bold text-slate-500">D1</td></tr>)}</tbody></table>{visible.length === 0 && <div className="border-t border-slate-100 p-8 text-center text-xs text-slate-500">No database users match this view.</div>}</div>}
    </section>
  </div>;
}

function Stat({icon:Icon,label,value,tone,detail}:{icon:any,label:string,value:number,tone:string,detail:string}){const classes=tone==="emerald"?"bg-emerald-50 text-emerald-700":tone==="blue"?"bg-blue-50 text-blue-700":"bg-amber-50 text-amber-700";return <article className="group min-h-[104px] rounded-lg border border-slate-200 bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9dceb0] hover:shadow-md"><div className="flex h-full items-start gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-all duration-200 group-hover:bg-[#08733f] group-hover:text-white ${classes}`}><Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110"/></div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#263c31]">{label}</p><p className="mt-1 text-[23px] font-bold leading-none tracking-tight text-[#13281e]">{value}</p><p className="mt-2 text-[11px] text-slate-500">{detail}</p></div></div></article>}
