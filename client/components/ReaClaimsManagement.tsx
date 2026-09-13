import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, Banknote, FileSpreadsheet, Filter, Loader2, Search, ShieldCheck, Upload, UserRoundCheck } from 'lucide-react';
import { assignClaimApi, importClaimsApi, listActiveConsultantsApi, listClaimsApi, type ActiveConsultant, type ClaimRecord } from '../lib/claims-api';
import { parseClaimsFile, type ParsedClaim } from '../lib/claims-import';

const money = (value:number) => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(value || 0);

export default function ReaClaimsManagement(){
  const [claims,setClaims]=useState<ClaimRecord[]>([]);
  const [consultants,setConsultants]=useState<ActiveConsultant[]>([]);
  const [allocation,setAllocation]=useState<'All'|'Assigned'|'Unassigned'>('All');
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [staged,setStaged]=useState<ParsedClaim[]>([]);
  const [assigning,setAssigning]=useState<string>('');
  const fileRef=useRef<HTMLInputElement>(null);

  async function load(next=allocation){
    setLoading(true);setError('');
    try{const [claimResult,consultantResult]=await Promise.all([listClaimsApi(next),listActiveConsultantsApi()]);setClaims(claimResult.claims);setConsultants(consultantResult.consultants);}catch(e){setError(e instanceof Error?e.message:'Unable to load claims.');}finally{setLoading(false);}
  }
  useEffect(()=>{void load(allocation);},[allocation]);

  const visible=useMemo(()=>claims.filter(c=>!q||`${c.claimId} ${c.projectId} ${c.state} ${c.lga} ${c.contractor} ${c.consultantFirm}`.toLowerCase().includes(q.toLowerCase())),[claims,q]);
  const totalValue=claims.reduce((sum,c)=>sum+c.claimAmount,0);
  const assigned=claims.filter(c=>c.allocationStatus==='Assigned').length;
  const unassigned=claims.filter(c=>c.allocationStatus==='Unassigned').length;

  async function onFile(file?:File){
    if(!file)return;
    setNotice('');
    try{setStaged(await parseClaimsFile(file));}catch(e){setStaged([]);setNotice(e instanceof Error?e.message:'Unable to parse file.');}
  }
  async function importValid(){
    const valid=staged.filter(r=>r.valid).map(({rowNumber,issues,valid,...row})=>row);
    if(!valid.length){setNotice('There are no valid rows to import.');return;}
    try{const result=await importClaimsApi(valid);setNotice(`${result.imported} claim records imported into Veritas.`);setStaged([]);await load('All');setAllocation('All');}catch(e){setNotice(e instanceof Error?e.message:'Import failed.');}
  }
  async function assign(claim:ClaimRecord,consultantId:string){
    if(!consultantId||claim.allocationStatus==='Assigned')return;
    setAssigning(claim.id);setNotice('');
    try{await assignClaimApi(claim.id,consultantId);setNotice('Project assigned successfully. This assignment is now locked.');await load(allocation);}catch(e){setNotice(e instanceof Error?e.message:'Assignment failed.');}finally{setAssigning('');}
  }

  return <div className="space-y-5 p-1">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-slate-900">Claims Register</h1><p className="text-sm text-slate-500">Database-backed claim intake and one-time consultant allocation.</p></div>
      <div className="flex gap-2"><button onClick={()=>fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white"><Upload size={16}/>Upload CSV/XLS</button><input ref={fileRef} type="file" accept=".csv,.xls" className="hidden" onChange={e=>void onFile(e.target.files?.[0])}/></div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[['Total Claims',claims.length,FileSpreadsheet],['Assigned',assigned,UserRoundCheck],['Unassigned',unassigned,AlertTriangle],['Claim Value',money(totalValue),Banknote]].map(([label,value,Icon]:any)=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 inline-flex rounded-xl bg-emerald-50 p-2 text-emerald-700"><Icon size={18}/></div><div className="text-2xl font-semibold text-slate-900">{value}</div><div className="text-sm text-slate-500">{label}</div></div>)}
    </div>

    <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 text-slate-400" size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search claim, project, state or contractor" className="w-full rounded-xl border border-slate-200 py-2 pl-10 pr-3 text-sm outline-none focus:border-emerald-500"/></div>
      <div className="flex items-center gap-2"><Filter size={16} className="text-slate-400"/><select value={allocation} onChange={e=>setAllocation(e.target.value as any)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm"><option>All</option><option>Assigned</option><option>Unassigned</option></select></div>
    </div>

    {(notice||error)&&<div className={`rounded-xl border px-4 py-3 text-sm ${error?'border-rose-200 bg-rose-50 text-rose-700':'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error||notice}</div>}

    {staged.length>0&&<div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="mb-3 flex items-center justify-between"><div><div className="font-semibold text-slate-900">Import preview</div><div className="text-sm text-slate-600">{staged.filter(r=>r.valid).length} valid · {staged.filter(r=>!r.valid).length} flagged/error</div></div><button onClick={()=>void importValid()} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white">Import valid rows</button></div><div className="max-h-48 overflow-auto text-xs text-slate-700">{staged.slice(0,12).map(r=><div key={r.rowNumber} className="border-t border-amber-200 py-2">Row {r.rowNumber}: {r.claimId||'No Claim ID'} — {r.valid?'Valid':r.issues.join('; ')}</div>)}</div></div>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {loading?<div className="flex items-center justify-center gap-2 p-12 text-slate-500"><Loader2 className="animate-spin" size={18}/>Loading claims from database…</div>:<div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Claim / Project</th><th className="px-4 py-3">Location</th><th className="px-4 py-3">Contractor</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Allocation</th><th className="px-4 py-3">Consultant</th></tr></thead><tbody className="divide-y divide-slate-100">{visible.map(claim=><tr key={claim.id} className="hover:bg-slate-50"><td className="px-4 py-3"><div className="font-medium text-slate-900">{claim.claimId}</div><div className="text-xs text-slate-500">{claim.projectId||'No Project ID'} · {claim.programme}</div></td><td className="px-4 py-3">{claim.state}, {claim.lga}</td><td className="px-4 py-3">{claim.contractor}</td><td className="px-4 py-3 font-medium">{money(claim.claimAmount)}</td><td className="px-4 py-3"><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${claim.allocationStatus==='Assigned'?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>{claim.allocationStatus==='Assigned'?<BadgeCheck size={13}/>:<AlertTriangle size={13}/>} {claim.allocationStatus}</span></td><td className="px-4 py-3">{claim.allocationStatus==='Assigned'?<div className="flex items-center gap-2 text-slate-700"><ShieldCheck size={15} className="text-emerald-600"/><span>{claim.consultantFirm}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Locked</span></div>:<select disabled={assigning===claim.id} defaultValue="" onChange={e=>void assign(claim,e.target.value)} className="min-w-[210px] rounded-lg border border-slate-200 px-2 py-1.5 text-sm"><option value="">Assign active consultant…</option>{consultants.map(c=><option key={c.id} value={c.id}>{c.firmName}</option>)}</select>}</td></tr>)}</tbody></table>{!visible.length&&<div className="p-10 text-center text-sm text-slate-500">No claims match the current filter.</div>}</div>}
    </div>
  </div>;
}
