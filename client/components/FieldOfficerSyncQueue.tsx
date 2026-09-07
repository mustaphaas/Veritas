import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CloudUpload,
  Loader2,
  PauseCircle,
  Signal,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";

const initialQueue = [
  { project: "DARES Kaduna Grid Extension", id: "REA-KAD-0214", location: "Kawo, Kaduna North", type: "Inspection report + 8 photos", queued: "Today, 8:42 AM", size: "18.4 MB" },
  { project: "NEP Kano Mini Grid", id: "REA-KAN-0187", location: "Kofar Ruwa, Kano Municipal", type: "Inspection report + signatures", queued: "Today, 8:18 AM", size: "6.7 MB" },
  { project: "AMP Katsina SAS Verification", id: "REA-KAT-0096", location: "Kofar Sauri, Katsina", type: "GPS record + 5 photos", queued: "Yesterday, 5:36 PM", size: "12.1 MB" },
  { project: "NEP Sokoto Mini Grid", id: "REA-SOK-0068", location: "Gagi, Sokoto South", type: "Inspection draft + evidence", queued: "Yesterday, 4:11 PM", size: "9.8 MB" },
];

export default function FieldOfficerSyncQueue() {
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [progress, setProgress] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [automaticSync, setAutomaticSync] = useState(false);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const pending = useMemo(() => initialQueue.filter((item) => !completedIds.includes(item.id)), [completedIds]);
  const completed = useMemo(() => initialQueue.filter((item) => completedIds.includes(item.id)), [completedIds]);
  const active = running ? pending[0] : undefined;
  const orderedQueue = [...pending, ...completed];

  useEffect(() => {
    if (automaticSync && isOnline && pending.length > 0 && !running) {
      setProgress(0);
      setRunning(true);
    }
  }, [automaticSync, isOnline, pending.length, running]);

  useEffect(() => {
    if (!active || !isOnline || !running) return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + 2, 100);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => {
            setCompletedIds((ids) => (ids.includes(active.id) ? ids : [...ids, active.id]));
            setProgress(0);
            if (!automaticSync && pending.length <= 1) setRunning(false);
          }, 320);
        }
        return next;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [active?.id, automaticSync, isOnline, pending.length, running]);

  useEffect(() => {
    if (running && pending.length === 0) setRunning(false);
  }, [pending.length, running]);

  const waitingCount = Math.max(pending.length - (active ? 1 : 0), 0);

  const syncNow = () => {
    if (!isOnline || pending.length === 0) return;
    setProgress(0);
    setRunning(true);
  };

  const toggleAutomatic = () => {
    setAutomaticSync((value) => !value);
  };

  return (
    <section className="w-full overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.07)]">
      <div className="flex flex-col gap-5 border-b border-slate-100 bg-gradient-to-r from-white via-[#fbfefc] to-[#f6fbf8] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e8f7ed] text-[#08733f] ring-1 ring-[#cbe8d4] shadow-sm">
            <CloudUpload className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-[#173b2a]">Offline Sync Queue</h2>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 shadow-sm">{initialQueue.length} records</span>
              <span className="rounded-full border border-[#cbe8d4] bg-[#edf9f1] px-2.5 py-1 text-[9px] font-bold text-[#08733f]">Sequential upload</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[10px] font-bold shadow-sm ${isOnline ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? "Connected" : "Offline"}
          </span>

          <button type="button" onClick={toggleAutomatic} className={`group inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-[10px] font-bold transition-all duration-200 ${automaticSync ? "border-[#9fcfaf] bg-[#e8f7ed] text-[#08733f] shadow-sm hover:bg-[#08733f] hover:text-white" : "border-slate-200 bg-white text-slate-600 hover:border-[#9fcfaf] hover:bg-[#eef8f1] hover:text-[#08733f]"}`}>
            <span className={`relative h-5 w-9 rounded-full transition ${automaticSync ? "bg-[#08733f] group-hover:bg-white/25" : "bg-slate-200"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${automaticSync ? "translate-x-[18px]" : "translate-x-0.5"}`} />
            </span>
            Automatic Sync
          </button>

          <button type="button" onClick={syncNow} disabled={!isOnline || pending.length === 0 || running} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#08733f] px-4 text-[10px] font-bold text-white shadow-[0_7px_18px_rgba(8,115,63,0.22)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#075d35] hover:shadow-[0_10px_24px_rgba(8,115,63,0.28)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CloudUpload className="h-3.5 w-3.5" />}
            {running ? "Syncing" : "Sync Now"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 border-b border-slate-100 bg-[#f8faf9] p-4 sm:grid-cols-3 sm:p-5 lg:p-6">
        <div className="group flex min-h-[112px] items-center justify-between rounded-2xl border border-[#c7e3d0] bg-[#f0faf3] px-5 py-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#08733f] hover:bg-[#08733f] hover:shadow-lg">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5d8068] transition group-hover:text-white/75">Uploading</p>
            <p className="mt-1 text-3xl font-bold text-[#08733f] transition group-hover:text-white">{active ? 1 : 0}</p>
            <p className="mt-2 text-[9px] font-medium text-[#688473] transition group-hover:text-white/75">{running ? "Current active record" : "Not started"}</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#08733f] shadow-sm transition group-hover:bg-white/15 group-hover:text-white">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PauseCircle className="h-4 w-4" />}
          </span>
        </div>

        <div className="group flex min-h-[112px] items-center justify-between rounded-2xl border border-[#cddcf5] bg-[#f2f6fd] px-5 py-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#2563eb] hover:bg-[#2563eb] hover:shadow-lg">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#64748b] transition group-hover:text-white/75">Waiting</p>
            <p className="mt-1 text-3xl font-bold text-[#2456a6] transition group-hover:text-white">{waitingCount}</p>
            <p className="mt-2 text-[9px] font-medium text-slate-500 transition group-hover:text-white/75">Queued for synchronization</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#2563eb] shadow-sm transition group-hover:bg-white/15 group-hover:text-white"><Signal className="h-4 w-4" /></span>
        </div>

        <div className="group flex min-h-[112px] items-center justify-between rounded-2xl border border-[#ead4a3] bg-[#fff9ec] px-5 py-4 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-[#d97706] hover:bg-[#d97706] hover:shadow-lg">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8b6a2d] transition group-hover:text-white/75">Completed</p>
            <p className="mt-1 text-3xl font-bold text-[#b56b00] transition group-hover:text-white">{completedIds.length}</p>
            <p className="mt-2 text-[9px] font-medium text-[#8b764d] transition group-hover:text-white/75">Successfully synchronized</p>
          </div>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#d97706] shadow-sm transition group-hover:bg-white/15 group-hover:text-white"><CheckCircle2 className="h-4 w-4" /></span>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] items-center gap-8 border-b border-slate-100 bg-white px-6 py-3.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400 lg:grid">
        <span>Inspection record</span><span>Package details</span><span className="text-right">Sync status</span>
      </div>

      <div className="divide-y divide-slate-100">
        {orderedQueue.map((item) => {
          const done = completedIds.includes(item.id);
          const current = active?.id === item.id && !done;
          const status = done ? "Uploaded" : current ? (isOnline ? "Uploading" : "Paused") : "Waiting";
          return (
            <article key={item.id} className={`group grid gap-4 px-5 py-5 transition-all duration-200 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] lg:items-center lg:gap-8 ${current ? "bg-[#f7fcf8]" : "bg-white hover:bg-[#f8fbf9]"}`}>
              <div className="min-w-0">
                <div className="flex items-start gap-3.5">
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-200 ${done ? "border-[#c9e5d2] bg-[#edf8f0] text-[#08733f]" : current ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]" : "border-slate-200 bg-slate-50 text-slate-400 group-hover:border-[#bfd8c7] group-hover:bg-[#eef8f1] group-hover:text-[#08733f]"}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : current ? <Loader2 className="h-4 w-4 animate-spin" /> : <Signal className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold leading-5 text-[#173b2a]">{item.project}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-medium text-slate-500"><span>{item.id}</span><span className="text-slate-300">•</span><span>{item.location}</span></div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 transition group-hover:border-slate-200 group-hover:bg-white lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                <p className="truncate text-[10px] font-semibold leading-4 text-slate-600">{item.type}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-slate-400"><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" />{item.queued}</span><span className="hidden text-slate-300 sm:inline">•</span><span className="font-medium text-slate-500">{item.size}</span></div>
              </div>

              <div className="min-w-0 lg:text-right">
                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-bold ${done ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]" : current ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]" : "border-[#d4def0] bg-[#f4f7fc] text-[#52647f]"}`}>{status}</span>
                  {current && <span className="min-w-[42px] text-right text-[10px] font-bold text-[#08733f]">{isOnline ? progress : 0}%</span>}
                </div>
                {current && <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-r from-[#149553] to-[#08733f] transition-[width] duration-200" style={{ width: `${isOnline ? progress : 0}%` }} /></div>}
                {!current && !done && <p className="mt-2 text-[8px] text-slate-400">Waiting to sync</p>}
                {done && <p className="mt-2 text-[8px] text-[#5d8069]">Upload completed successfully</p>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 border-t border-[#dbe9df] bg-[#f7fbf8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 text-[9px] text-[#587362]"><Sparkles className="h-3.5 w-3.5 text-[#08733f]" /><span>Records remain securely stored until synchronization completes.</span></div>
        <span className="text-[9px] font-bold text-slate-400">Mode: {automaticSync ? "Automatic" : "Manual"}</span>
      </div>
    </section>
  );
}
