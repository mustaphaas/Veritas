import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { completePasswordResetApi } from "../lib/field-api";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage("");
    if (!token) return setError("This password reset link is missing or invalid.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("The passwords do not match.");
    setSaving(true);
    try { const result = await completePasswordResetApi(token, password); setMessage(result.message || "Password updated successfully."); setDone(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to reset the password."); }
    finally { setSaving(false); }
  };
  return <main className="min-h-screen bg-[#eef6f0] p-4 sm:p-7"><div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-[520px] items-center justify-center"><section className="w-full rounded-2xl border border-[#cfe4d5] bg-white p-7 shadow-[0_24px_70px_rgba(11,70,40,0.12)] sm:p-10"><div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-[#08733f] text-[#08733f]"><ShieldCheck className="h-6 w-6"/></div><div><p className="text-xl font-bold text-[#153b28]">Veritas</p><p className="text-[9px] font-bold tracking-wide text-slate-500">REA MONITORING PLATFORM</p></div></div>{done ? <div className="mt-8 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-[#08733f]"/><h1 className="mt-4 text-2xl font-bold text-[#142a1f]">Password updated</h1><p className="mt-2 text-sm text-slate-500">{message}</p><Link to="/login" className="mt-6 inline-flex rounded-md bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white">Return to sign in</Link></div> : <><h1 className="mt-8 text-2xl font-bold text-[#142a1f]">Create a new password</h1><p className="mt-2 text-sm text-slate-500">Choose a new password for your Veritas account.</p><form onSubmit={submit} className="mt-6 space-y-4"><label className="block"><span className="text-xs font-semibold text-[#263c31]">New password</span><div className="relative mt-1.5"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input type={show?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} className="h-11 w-full rounded-md border border-slate-200 pl-10 pr-10 text-sm outline-none focus:border-[#08733f]" minLength={8} required/><button type="button" onClick={()=>setShow(v=>!v)} className="absolute right-2.5 top-2.5 text-slate-400">{show?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div></label><label className="block"><span className="text-xs font-semibold text-[#263c31]">Confirm password</span><input type={show?"text":"password"} value={confirm} onChange={e=>setConfirm(e.target.value)} className="mt-1.5 h-11 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#08733f]" minLength={8} required/></label>{error&&<p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}<button type="submit" disabled={saving} className="flex h-11 w-full items-center justify-center rounded-md bg-[#08733f] text-sm font-bold text-white disabled:opacity-60">{saving?"Updating password…":"Update password"}</button></form></>}</section></div></main>;
}
