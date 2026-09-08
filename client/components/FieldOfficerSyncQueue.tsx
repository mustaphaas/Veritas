import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CheckCircle2,
  Clock3,
  CloudUpload,
  ListChecks,
  Loader2,
  Signal,
  UploadCloud,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { useInspectionWorkflow } from "../lib/inspection-workflow";

type QueueItem = {
  id: string;
  project: string;
  location: string;
  type: string;
  queued: string;
  size: string;
};

function estimateEvidenceMegabytes(previewUrl: string | undefined) {
  if (!previewUrl) return 0.4; // undecoded/large-file placeholder objectURL
  // base64 payloads are ~4/3 the size of the raw bytes they encode.
  return (previewUrl.length * 0.75) / (1024 * 1024);
}

export default function FieldOfficerSyncQueue() {
  const { session } = useAuth();
  const { assignments, isOnline, syncAssignment } = useInspectionWorkflow();
  const officerName = session?.name ?? "Amina Yusuf";

  // Snapshot the officer's queued items when this view mounts, so items
  // that finish syncing stay visible in the "Completed" section instead of
  // vanishing the instant their real syncStatus flips. Revisiting this page
  // re-mounts the component and takes a fresh snapshot of whatever is
  // actually queued at that point.
  const [queueItems] = useState<QueueItem[]>(() =>
    assignments
      .filter(
        (assignment) =>
          assignment.officer === officerName &&
          assignment.syncStatus === "queued",
      )
      .map((assignment): QueueItem => {
        const evidence = assignment.report?.evidence ?? [];
        const evidenceMb = evidence.reduce(
          (sum, item) => sum + estimateEvidenceMegabytes(item.previewUrl),
          0,
        );
        const queuedAudit = [...assignment.audit]
          .reverse()
          .find((entry) => entry.action === "Submission queued offline");
        const queuedAt = queuedAudit?.at ?? assignment.report?.submittedAt;
        return {
          id: assignment.id,
          project: assignment.projectName,
          location: `${assignment.community}, ${assignment.lga}`,
          type:
            evidence.length > 0
              ? `Inspection report + ${evidence.length} media file${evidence.length > 1 ? "s" : ""}`
              : "Inspection report + no media",
          queued: queuedAt
            ? new Date(queuedAt).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "Pending sync",
          size:
            evidenceMb > 0
              ? `${evidenceMb.toFixed(1)} MB`
              : "0.2 MB",
        };
      }),
  );

  const [progress, setProgress] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [automaticSync, setAutomaticSync] = useState(false);

  const pending = useMemo(() => queueItems.filter((item) => !completedIds.includes(item.id)), [queueItems, completedIds]);
  const completed = useMemo(() => queueItems.filter((item) => completedIds.includes(item.id)), [queueItems, completedIds]);
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
            syncAssignment(active.id);
            setProgress(0);
            if (!automaticSync && pending.length <= 1) setRunning(false);
          }, 320);
        }
        return next;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [active?.id, automaticSync, isOnline, pending.length, running, syncAssignment]);

  useEffect(() => {
    if (running && pending.length === 0) setRunning(false);
  }, [pending.length, running]);

  const waitingCount = Math.max(pending.length - (active ? 1 : 0), 0);

  const syncNow = () => {
    if (!isOnline || pending.length === 0) return;
    setProgress(0);
    setRunning(true);
  };

  const toggleAutomatic = () => setAutomaticSync((value) => !value);

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
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 shadow-sm">{queueItems.length} records</span>
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
        <div className="group flex min-h-[148px] flex-col items-center justify-center rounded-2xl border border-[#b9dfc5] bg-[#edf8f0] px-5 py-5 text-center shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[#08733f] hover:bg-[#08733f] hover:shadow-[0_12px_28px_rgba(8,115,63,0.18)]">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-[#08733f] ring-1 ring-[#d4eadb] transition-all duration-200 group-hover:bg-white/15 group-hover:text-white group-hover:ring-white/25">
            {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5" />}
          </span>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#5d8068] transition group-hover:text-white/75">Uploading</p>
          <p className="mt-1 text-[30px] font-bold leading-none text-[#173b2a] transition group-hover:text-white">{active ? 1 : 0}</p>
          <p className="mt-2 text-[9px] font-medium text-[#6e8977] transition group-hover:text-white/75">{running ? "Current active record" : "Not started"}</p>
        </div>

        <div className="group flex min-h-[148px] flex-col items-center justify-center rounded-2xl border border-[#cddcf5] bg-[#eef4ff] px-5 py-5 text-center shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[#2563eb] hover:bg-[#2563eb] hover:shadow-[0_12px_28px_rgba(37,99,235,0.18)]">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-[#2563eb] ring-1 ring-[#d7e3fb] transition-all duration-200 group-hover:bg-white/15 group-hover:text-white group-hover:ring-white/25">
            <ListChecks className="h-5 w-5" />
          </span>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#60728d] transition group-hover:text-white/75">Waiting</p>
          <p className="mt-1 text-[30px] font-bold leading-none text-[#173b2a] transition group-hover:text-white">{waitingCount}</p>
          <p className="mt-2 text-[9px] font-medium text-[#70809a] transition group-hover:text-white/75">Queued for synchronization</p>
        </div>

        <div className="group flex min-h-[148px] flex-col items-center justify-center rounded-2xl border border-[#ead4a3] bg-[#fff7e8] px-5 py-5 text-center shadow-[0_4px_14px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-1 hover:border-[#d97706] hover:bg-[#d97706] hover:shadow-[0_12px_28px_rgba(217,119,6,0.18)]">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/80 text-[#d97706] ring-1 ring-[#f1dfba] transition-all duration-200 group-hover:bg-white/15 group-hover:text-white group-hover:ring-white/25">
            <BadgeCheck className="h-5 w-5" />
          </span>
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8b6a2d] transition group-hover:text-white/75">Completed</p>
          <p className="mt-1 text-[30px] font-bold leading-none text-[#173b2a] transition group-hover:text-white">{completedIds.length}</p>
          <p className="mt-2 text-[9px] font-medium text-[#92733b] transition group-hover:text-white/75">Successfully synchronized</p>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] items-center gap-8 border-b border-slate-100 bg-white px-6 py-3.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400 lg:grid">
        <span>Inspection record</span><span>Package details</span><span className="text-right">Sync status</span>
      </div>

      {orderedQueue.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <BadgeCheck className="h-8 w-8 text-[#08733f]" />
          <p className="text-xs font-bold text-[#173b2a]">All caught up</p>
          <p className="text-[10px] text-slate-500">
            No offline submissions are waiting to sync right now.
          </p>
        </div>
      )}

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

      <div className="flex justify-end border-t border-[#dbe9df] bg-[#f7fbf8] px-5 py-4 sm:px-6">
        <span className="text-[9px] font-bold text-slate-400">Mode: {automaticSync ? "Automatic" : "Manual"}</span>
      </div>
    </section>
  );
}
