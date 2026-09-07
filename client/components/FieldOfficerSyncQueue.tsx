import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  CloudUpload,
  Loader2,
  Signal,
  Wifi,
  WifiOff,
} from "lucide-react";

const initialQueue = [
  {
    project: "DARES Kaduna Grid Extension",
    id: "REA-KAD-0214",
    location: "Kawo, Kaduna North",
    type: "Inspection report + 8 photos",
    queued: "Today, 8:42 AM",
    size: "18.4 MB",
  },
  {
    project: "NEP Kano Mini Grid",
    id: "REA-KAN-0187",
    location: "Kofar Ruwa, Kano Municipal",
    type: "Inspection report + signatures",
    queued: "Today, 8:18 AM",
    size: "6.7 MB",
  },
  {
    project: "AMP Katsina SAS Verification",
    id: "REA-KAT-0096",
    location: "Kofar Sauri, Katsina",
    type: "GPS record + 5 photos",
    queued: "Yesterday, 5:36 PM",
    size: "12.1 MB",
  },
  {
    project: "NEP Sokoto Mini Grid",
    id: "REA-SOK-0068",
    location: "Gagi, Sokoto South",
    type: "Inspection draft + evidence",
    queued: "Yesterday, 4:11 PM",
    size: "9.8 MB",
  },
];

export default function FieldOfficerSyncQueue() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [progress, setProgress] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    const online = () => {
      setIsOnline(true);
      setRunning(true);
    };
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  const pending = useMemo(
    () => initialQueue.filter((item) => !completedIds.includes(item.id)),
    [completedIds],
  );
  const completed = useMemo(
    () => initialQueue.filter((item) => completedIds.includes(item.id)),
    [completedIds],
  );
  const active = pending[0];
  const orderedQueue = [...pending, ...completed];

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
            setProgress(0);
          }, 350);
        }
        return next;
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [active?.id, isOnline, running]);

  const waitingCount = Math.max(pending.length - (active ? 1 : 0), 0);

  const startSync = () => {
    if (!active) return;
    setProgress(0);
    setRunning(true);
  };

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
                {initialQueue.length} records
              </span>
              <span className="inline-flex h-6 items-center rounded-full border border-[#b9dfc5] bg-[#eff9f2] px-2.5 text-[9px] font-bold text-[#08733f]">
                One-at-a-time upload
              </span>
            </div>
            <p className="mt-1.5 max-w-3xl text-[11px] leading-5 text-slate-500 sm:text-xs">
              The record at the top uploads first. Every other record remains waiting until the previous upload is completed successfully.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-[10px] font-bold ${
              isOnline
                ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]"
                : "border-amber-200 bg-amber-50 text-amber-700"
            }`}
          >
            {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {isOnline ? "Connected" : "Offline"}
          </span>
          <button
            type="button"
            onClick={startSync}
            disabled={!active || !isOnline}
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 text-[10px] font-bold text-white shadow-[0_4px_12px_rgba(8,115,63,0.18)] transition hover:bg-[#066535] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CloudUpload className="h-3.5 w-3.5" />
            Start sync
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-[#f7faf8] p-4 sm:grid-cols-3 sm:p-5 lg:p-6">
        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-[#b9dfc5] bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#5e8069]">Uploading</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#08733f]">{active ? 1 : 0}</p>
            <p className="mt-2 text-[9px] font-medium text-[#6e8b76]">Top record only</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf8f0] text-[#08733f]">
            <Loader2 className={`h-4 w-4 ${active && isOnline && running ? "animate-spin" : ""}`} />
          </span>
        </div>

        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Waiting</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#173b2a]">{waitingCount}</p>
            <p className="mt-2 text-[9px] font-medium text-slate-400">Queued behind current upload</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
            <Signal className="h-4 w-4" />
          </span>
        </div>

        <div className="flex min-h-[108px] items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-[0_3px_12px_rgba(15,23,42,0.035)] sm:px-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Completed</p>
            <p className="mt-1 text-[26px] font-bold leading-none text-[#173b2a]">{completedIds.length}</p>
            <p className="mt-2 text-[9px] font-medium text-slate-400">Successfully synchronized</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#edf8f0] text-[#08733f]">
            <CheckCircle2 className="h-4 w-4" />
          </span>
        </div>
      </div>

      <div className="hidden grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] items-center gap-8 border-b border-slate-100 bg-slate-50/60 px-6 py-3.5 text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400 lg:grid">
        <span>Inspection record</span>
        <span>Package details</span>
        <span className="text-right">Sync status</span>
      </div>

      <div className="divide-y divide-slate-100">
        {orderedQueue.map((item) => {
          const done = completedIds.includes(item.id);
          const current = active?.id === item.id && !done;
          const status = done
            ? "Uploaded"
            : current
              ? isOnline
                ? "Uploading"
                : "Paused"
              : "Waiting";

          return (
            <article
              key={item.id}
              className={`grid gap-4 px-5 py-5 transition-colors sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(250px,.85fr)_240px] lg:items-center lg:gap-8 lg:py-5 ${current ? "bg-[#fbfefc]" : "bg-white"}`}
            >
              <div className="min-w-0">
                <div className="flex items-start gap-3.5">
                  <span
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                      done
                        ? "border-[#d5eadc] bg-[#edf8f0] text-[#08733f]"
                        : current
                          ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]"
                          : "border-slate-200 bg-slate-50 text-slate-400"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : current ? (
                      <Loader2 className={`h-4 w-4 ${isOnline && running ? "animate-spin" : ""}`} />
                    ) : (
                      <Signal className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-bold leading-5 text-[#173b2a]">{item.project}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-medium text-slate-500">
                      <span>{item.id}</span>
                      <span className="text-slate-300">•</span>
                      <span>{item.location}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3.5 py-3 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
                <p className="truncate text-[10px] font-semibold leading-4 text-slate-600">{item.type}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] text-slate-400">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3 w-3 shrink-0" />
                    {item.queued}
                  </span>
                  <span className="hidden text-slate-300 sm:inline">•</span>
                  <span className="font-medium text-slate-500">{item.size}</span>
                </div>
              </div>

              <div className="min-w-0 lg:text-right">
                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[9px] font-bold ${
                      done
                        ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]"
                        : current
                          ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    {status}
                  </span>
                  {current && (
                    <span className="min-w-[42px] text-right text-[10px] font-bold text-[#08733f]">
                      {isOnline ? progress : 0}%
                    </span>
                  )}
                </div>

                {current && (
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[#08733f] transition-[width] duration-200 ease-out"
                      style={{ width: `${isOnline ? progress : 0}%` }}
                    />
                  </div>
                )}

                {!current && !done && (
                  <p className="mt-2 text-[8px] leading-4 text-slate-400">
                    Waiting for the upload above to finish
                  </p>
                )}
                {done && (
                  <p className="mt-2 text-[8px] leading-4 text-[#5d8069]">
                    Upload completed successfully
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <div className="flex items-start gap-3 border-t border-[#d7e9dc] bg-[#f4faf6] px-5 py-4 sm:px-6">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#08733f] shadow-sm ring-1 ring-[#d5eadc]">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </span>
        <p className="max-w-4xl text-[10px] leading-5 text-[#4d745d]">
          Only one inspection package uploads at a time. When it reaches 100%, the next waiting record automatically becomes the active upload.
        </p>
      </div>
    </section>
  );
}
