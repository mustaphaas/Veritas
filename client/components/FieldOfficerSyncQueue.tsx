import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CloudUpload,
  Loader2,
  RefreshCw,
  Signal,
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
  if (!previewUrl) return 0.4;
  return (previewUrl.length * 0.75) / (1024 * 1024);
}

export default function FieldOfficerSyncQueue() {
  const { session } = useAuth();
  const { assignments, isOnline, syncAssignment } = useInspectionWorkflow();
  const officerName = session?.name ?? "Amina Yusuf";

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
          size: evidenceMb > 0 ? `${evidenceMb.toFixed(1)} MB` : "0.2 MB",
        };
      }),
  );

  const [progress, setProgress] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const pending = useMemo(
    () => queueItems.filter((item) => !completedIds.includes(item.id)),
    [queueItems, completedIds],
  );
  const completed = useMemo(
    () => queueItems.filter((item) => completedIds.includes(item.id)),
    [queueItems, completedIds],
  );
  const active = running ? pending[0] : undefined;
  const orderedQueue = [...pending, ...completed];

  useEffect(() => {
    if (isOnline && pending.length > 0 && !running) {
      setProgress(0);
      setRunning(true);
    }
  }, [isOnline, pending.length, running]);

  useEffect(() => {
    if (!active || !isOnline || !running) return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(current + 2, 100);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => {
            setCompletedIds((ids) =>
              ids.includes(active.id) ? ids : [...ids, active.id],
            );
            syncAssignment(active.id);
            setProgress(0);
            if (pending.length <= 1) setRunning(false);
          }, 320);
        }
        return next;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [active?.id, isOnline, pending.length, running, syncAssignment]);

  useEffect(() => {
    if (running && pending.length === 0) setRunning(false);
  }, [pending.length, running]);

  const syncNow = () => {
    if (!isOnline || pending.length === 0) return;
    setProgress(0);
    setRunning(true);
  };

  const syncOne = (id: string) => {
    if (!isOnline || completedIds.includes(id)) return;
    syncAssignment(id);
    setCompletedIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
  };

  const totalMb = queueItems.reduce((sum, item) => {
    const value = Number.parseFloat(item.size);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
  const readyCount = isOnline ? pending.length : 0;
  const attentionCount = isOnline ? 0 : pending.length;

  return (
    <section className="w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_34px_rgba(15,23,42,0.06)]">
      <div className="flex flex-col gap-5 border-b border-slate-100 px-5 py-5 sm:px-6 sm:py-6 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#d4e9db] bg-[#eef8f1] text-[#08733f] shadow-sm">
            <CloudUpload className="h-5 w-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-[18px] font-bold tracking-tight text-[#173b2a] sm:text-xl">
                Offline Sync Queue
              </h2>
              <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-600">
                {queueItems.length} records
              </span>
              <span className="inline-flex h-6 items-center rounded-full border border-[#b9dfc5] bg-[#eff9f2] px-2.5 text-[9px] font-bold text-[#08733f]">
                Sequential upload
              </span>
            </div>
            <p className="mt-1.5 max-w-3xl text-[11px] leading-5 text-slate-500 sm:text-xs">
              Field inspection records waiting to upload. Records remain securely stored on the device until synchronization succeeds.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={syncNow}
          disabled={!isOnline || pending.length === 0 || running}
          className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 text-[10px] font-bold text-white shadow-[0_4px_12px_rgba(8,115,63,0.18)] transition hover:bg-[#066535] disabled:cursor-not-allowed disabled:opacity-45 sm:w-fit"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {running ? "Synchronizing" : "Sync all records"}
        </button>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-[#f7faf8] p-4 sm:grid-cols-3 sm:p-5 lg:p-6">
        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Queued</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#173b2a]">{pending.length}</p>
            <p className="mt-2 text-[9px] font-medium text-slate-400">{totalMb.toFixed(1)} MB pending</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <CloudUpload className="h-4 w-4" />
          </span>
        </div>
        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-[#b9dfc5] bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#5e8069]">Ready</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#08733f]">{readyCount}</p>
            <p className="mt-2 text-[9px] font-medium text-[#6e8b76]">Ready to synchronize</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#edf8f0] text-[#08733f]">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        </div>
        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-[#f0d88d] bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#8d6a1e]">Attention</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#a56c00]">{attentionCount}</p>
            <p className="mt-2 text-[9px] font-medium text-[#8d764c]">Waiting or retry required</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#fff8e5] text-[#a56c00]">
            <Signal className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] items-center gap-8 border-b border-slate-100 bg-slate-50/60 px-6 py-3.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400 lg:grid">
        <span>Inspection record</span>
        <span>Package details</span>
        <span className="text-right">Sync status</span>
      </div>

      {orderedQueue.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
          <CheckCircle2 className="h-8 w-8 text-[#08733f]" />
          <p className="text-xs font-bold text-[#173b2a]">All caught up</p>
          <p className="text-[10px] text-slate-500">No offline submissions are waiting to sync right now.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {orderedQueue.map((item) => {
            const done = completedIds.includes(item.id);
            const current = active?.id === item.id && !done;
            const state = done
              ? "Uploaded"
              : current
                ? isOnline
                  ? "Uploading"
                  : "Waiting for network"
                : isOnline
                  ? "Ready to sync"
                  : "Waiting for network";
            return (
              <article
                key={item.id}
                className="grid gap-4 px-5 py-5 transition-colors hover:bg-[#fbfdfb] sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] lg:items-center lg:gap-8 lg:py-5"
              >
                <div className="min-w-0">
                  <div className="flex items-start gap-3.5">
                    <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#d5eadc] bg-[#edf8f0] text-[#08733f]">
                      {done ? <CheckCircle2 className="h-4 w-4" /> : current ? <Loader2 className="h-4 w-4 animate-spin" /> : <Signal className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-bold leading-5 text-[#173b2a]">{item.project}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-medium text-slate-500">
                        <span>{item.id}</span><span className="text-slate-300">•</span><span>{item.location}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                  <p className="mb-1.5 text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Package details</p>
                  <p className="truncate text-[10px] font-semibold leading-4 text-slate-600">{item.type}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-slate-400">
                    <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3 shrink-0" />{item.queued}</span>
                    <span className="hidden text-slate-300 sm:inline">•</span>
                    <span className="font-medium text-slate-500">{item.size}</span>
                  </div>
                </div>
                <div className="flex min-w-0 items-center justify-between gap-3 lg:justify-end">
                  <div className="min-w-0 lg:text-right">
                    <p className="mb-1.5 text-left text-[8px] font-bold uppercase tracking-[0.12em] text-slate-400 lg:hidden">Sync status</p>
                    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-bold ${done || state === "Ready to sync" ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]" : "border-[#f0d88d] bg-[#fff8e5] text-[#956300]"}`}>
                      {state}
                    </span>
                    {current && isOnline && <p className="mt-1 text-[8px] font-bold text-[#08733f]">{progress}%</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => syncOne(item.id)}
                    disabled={!isOnline || done || current}
                    className="inline-flex h-9 min-w-[70px] shrink-0 items-center justify-center rounded-lg border border-[#9bcfab] bg-white px-3 text-[9px] font-bold text-[#08733f] shadow-sm transition hover:border-[#08733f] hover:bg-[#eff9f2] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {done ? "Synced" : current ? "Syncing" : "Sync"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-3 border-t border-[#d7e9dc] bg-[#f4faf6] px-5 py-4 sm:px-6">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#08733f] shadow-sm ring-1 ring-[#d5eadc]">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </span>
        <p className="max-w-4xl text-[10px] leading-5 text-[#4d745d]">
          GPS coordinates, timestamps, evidence and signatures stay attached to each inspection package until the upload is completed successfully.
        </p>
      </div>
    </section>
  );
}
