import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, CloudUpload, FileCheck2, Image, Loader2, Video, Wifi, WifiOff } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useInspectionWorkflow } from "../lib/inspection-workflow";

const mockPending = [
  { id: "REA-KAN-0042", projectName: "Kura Solar Mini Grid", programme: "DARES", component: "Mini Grid", location: "Kura, Kano", capturedAt: "2026-09-06T07:42:00.000Z", evidence: 7, photos: 6, videos: 1, size: "18.4 MB" },
  { id: "REA-KAD-0028", projectName: "Kajuru Distribution Extension", programme: "NEP", component: "Grid Extension", location: "Kajuru, Kaduna", capturedAt: "2026-09-06T06:18:00.000Z", evidence: 5, photos: 5, videos: 0, size: "11.7 MB" },
  { id: "REA-JIG-0019", projectName: "Dutse Productive Use Solar Hub", programme: "AMP", component: "SAS", location: "Dutse, Jigawa", capturedAt: "2026-09-05T16:56:00.000Z", evidence: 9, photos: 8, videos: 1, size: "24.2 MB" },
];

export default function FieldOfficerSequentialUploadQueue() {
  const location = useLocation();
  const { session } = useAuth();
  const { assignments, isOnline, syncNow } = useInspectionWorkflow();
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(42);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  const rows = useMemo(() => {
    const officerName = session?.name ?? "Amina Yusuf";
    const realQueued = assignments
      .filter((item) => item.officer === officerName && item.syncStatus === "queued")
      .map((item) => ({
        id: item.id,
        projectName: item.projectName,
        programme: item.programme,
        component: item.component,
        location: `${item.community}, ${item.state}`,
        capturedAt: item.report?.inspectedAt ?? item.arrival?.at ?? new Date().toISOString(),
        evidence: item.report?.evidence.length ?? 0,
        photos: item.report?.evidence.filter((e) => e.type === "photo").length ?? 0,
        videos: item.report?.evidence.filter((e) => e.type === "video").length ?? 0,
        size: "Pending upload",
      }));
    return realQueued.length ? realQueued : mockPending;
  }, [assignments, session?.name]);

  const pendingRows = rows.filter((row) => !completedIds.includes(row.id));
  const active = pendingRows[activeIndex] ?? pendingRows[0];

  useEffect(() => {
    if (!isOnline || !active) return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(value + 3, 100);
        if (next >= 100) {
          window.clearInterval(timer);
          window.setTimeout(() => {
            setCompletedIds((current) => [...current, active.id]);
            setActiveIndex(0);
            setProgress(0);
            syncNow();
          }, 350);
        }
        return next;
      });
    }, 450);
    return () => window.clearInterval(timer);
  }, [active?.id, isOnline, syncNow]);

  useEffect(() => {
    if (location.pathname !== "/field-officer/sync") {
      setTarget(null);
      return;
    }

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let mount: HTMLDivElement | null = null;
    let hidden: HTMLElement | null = null;

    const attach = () => {
      if (cancelled) return false;
      const existingCustom = document.querySelector<HTMLElement>("[data-pending-offline-uploads]");
      if (existingCustom) existingCustom.style.display = "none";

      const headings = Array.from(document.querySelectorAll("h2"));
      const heading = headings.find((node) => ["Sync Queue", "Offline Sync"].includes(node.textContent?.trim() ?? ""));
      const section = heading?.closest("section") as HTMLElement | null;
      if (!section) return false;

      const existing = section.parentElement?.querySelector<HTMLDivElement>("[data-sequential-upload-queue]");
      if (existing) {
        setTarget(existing);
        return true;
      }

      hidden = section;
      hidden.style.display = "none";
      mount = document.createElement("div");
      mount.dataset.sequentialUploadQueue = "true";
      section.parentElement?.insertBefore(mount, section.nextSibling);
      setTarget(mount);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      mount?.remove();
      if (hidden) hidden.style.display = "";
      const existingCustom = document.querySelector<HTMLElement>("[data-pending-offline-uploads]");
      if (existingCustom) existingCustom.style.display = "";
      setTarget(null);
    };
  }, [location.pathname]);

  if (!target) return null;

  const total = rows.length;
  const completed = completedIds.length;
  const waiting = Math.max(total - completed - (active ? 1 : 0), 0);

  return createPortal(
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div>
          <div className="flex items-center gap-2">
            <CloudUpload className="h-5 w-5 text-[#08733f]" />
            <h2 className="text-lg font-bold text-[#173b2a]">Offline Uploads</h2>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">Uploads run one at a time. The next inspection starts automatically after the current upload reaches 100%.</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[9px] font-bold ${isOnline ? "bg-[#eaf8ef] text-[#08733f]" : "bg-amber-50 text-amber-700"}`}>
          {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {isOnline ? "Connected · uploading automatically" : "Offline · uploads paused"}
        </span>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-[#fafcfb] p-4 sm:grid-cols-3 sm:p-5">
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Uploading</p>
          <p className="mt-2 text-xl font-bold text-[#08733f]">{active ? 1 : 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Waiting</p>
          <p className="mt-2 text-xl font-bold text-[#173b2a]">{waiting}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Completed</p>
          <p className="mt-2 text-xl font-bold text-[#173b2a]">{completed}</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((item) => {
          const done = completedIds.includes(item.id);
          const current = active?.id === item.id && !done;
          const stateLabel = done ? "Uploaded" : current ? (isOnline ? "Uploading" : "Paused") : "Waiting";

          return (
            <article key={item.id} className={`grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(220px,.75fr)_180px] lg:items-center ${current ? "bg-[#fbfefc]" : "bg-white"}`}>
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${done ? "bg-[#eaf8ef] text-[#08733f]" : current ? "bg-[#eff9f2] text-[#08733f]" : "bg-slate-100 text-slate-400"}`}>
                    {done ? <CheckCircle2 className="h-4 w-4" /> : current ? <Loader2 className={`h-4 w-4 ${isOnline ? "animate-spin" : ""}`} /> : <FileCheck2 className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#173b2a]">{item.projectName}</p>
                    <p className="mt-1 text-[9px] text-slate-500">{item.id} · {item.programme} · {item.component}</p>
                    <p className="mt-1 text-[9px] text-slate-400">{item.location} · {new Date(item.capturedAt).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[9px] text-slate-500 lg:justify-center">
                <span className="inline-flex items-center gap-1.5"><Image className="h-3.5 w-3.5" />{item.photos} photos</span>
                <span className="inline-flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />{item.videos} videos</span>
                <span>{item.size}</span>
              </div>

              <div className="w-full lg:text-right">
                <div className="flex items-center justify-between gap-3 lg:justify-end">
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${done ? "bg-[#eaf8ef] text-[#08733f]" : current ? "bg-[#eff9f2] text-[#08733f]" : "bg-slate-100 text-slate-500"}`}>{stateLabel}</span>
                  {current && <span className="min-w-[38px] text-right text-[10px] font-bold text-[#08733f]">{isOnline ? progress : 0}%</span>}
                </div>
                {current && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#08733f] transition-all duration-300" style={{ width: `${isOnline ? progress : 0}%` }} />
                  </div>
                )}
                {!current && !done && <p className="mt-2 text-[8px] text-slate-400">Starts after previous upload completes</p>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="border-t border-slate-100 bg-[#fbfefc] px-5 py-3 text-center text-[9px] text-slate-500 sm:px-6">
        Only one inspection uploads at a time to keep field synchronization stable. Waiting records remain safely stored on the device.
      </div>
    </section>,
    target,
  );
}
