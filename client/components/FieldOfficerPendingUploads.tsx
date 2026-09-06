import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CloudUpload, FileCheck2, Image, RefreshCw, Video, Wifi, WifiOff } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useInspectionWorkflow } from "../lib/inspection-workflow";
import { useAuth } from "../lib/auth";

const mockPending = [
  {
    id: "REA-KAN-0042",
    projectName: "Kura Solar Mini Grid",
    programme: "DARES",
    component: "Mini Grid",
    location: "Kura, Kano",
    capturedAt: "2026-09-06T07:42:00.000Z",
    evidence: 7,
    photos: 6,
    videos: 1,
    size: "18.4 MB",
    status: "Waiting for connection",
  },
  {
    id: "REA-KAD-0028",
    projectName: "Kajuru Distribution Extension",
    programme: "NEP",
    component: "Grid Extension",
    location: "Kajuru, Kaduna",
    capturedAt: "2026-09-06T06:18:00.000Z",
    evidence: 5,
    photos: 5,
    videos: 0,
    size: "11.7 MB",
    status: "Queued",
  },
  {
    id: "REA-JIG-0019",
    projectName: "Dutse Productive Use Solar Hub",
    programme: "AMP",
    component: "SAS",
    location: "Dutse, Jigawa",
    capturedAt: "2026-09-05T16:56:00.000Z",
    evidence: 9,
    photos: 8,
    videos: 1,
    size: "24.2 MB",
    status: "Retry required",
  },
];

export default function FieldOfficerPendingUploads() {
  const location = useLocation();
  const { session } = useAuth();
  const { assignments, isOnline, syncNow } = useInspectionWorkflow();
  const [target, setTarget] = useState<HTMLElement | null>(null);

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
        photos: item.report?.evidence.filter((evidence) => evidence.type === "photo").length ?? 0,
        videos: item.report?.evidence.filter((evidence) => evidence.type === "video").length ?? 0,
        size: "Pending upload",
        status: "Queued",
      }));

    return realQueued.length ? realQueued : mockPending;
  }, [assignments, session?.name]);

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
      const headings = Array.from(document.querySelectorAll("h2"));
      const heading = headings.find((node) =>
        ["Sync Queue", "Offline Sync"].includes(node.textContent?.trim() ?? ""),
      );
      const section = heading?.closest("section") as HTMLElement | null;
      if (!section) return false;

      const existing = section.parentElement?.querySelector<HTMLDivElement>("[data-pending-offline-uploads]");
      if (existing) {
        setTarget(existing);
        return true;
      }

      hidden = section;
      hidden.style.display = "none";
      mount = document.createElement("div");
      mount.dataset.pendingOfflineUploads = "true";
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
      setTarget(null);
    };
  }, [location.pathname]);

  if (!target) return null;

  return createPortal(
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#173b2a]">Offline Sync</h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-bold text-amber-700">
              {rows.length} not uploaded
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Completed field inspections stored on this device and waiting to upload.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold ${isOnline ? "bg-[#eaf8ef] text-[#08733f]" : "bg-amber-50 text-amber-700"}`}>
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? "Online · auto-sync active" : "Offline · stored locally"}
          </span>
          <button
            type="button"
            onClick={syncNow}
            disabled={!isOnline || rows.length === 0}
            className="inline-flex items-center gap-2 rounded-md bg-[#08733f] px-4 py-2 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Sync now
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-100 bg-[#f8fbf9] p-4 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Pending uploads</p>
          <p className="mt-1 text-xl font-bold text-[#173b2a]">{rows.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Evidence files</p>
          <p className="mt-1 text-xl font-bold text-[#173b2a]">{rows.reduce((sum, item) => sum + item.evidence, 0)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Upload behavior</p>
          <p className="mt-1 text-xs font-bold text-[#08733f]">Automatic when online</p>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {rows.map((item) => (
          <article key={item.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[1.5fr_1fr_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <FileCheck2 className="h-4 w-4 text-[#08733f]" />
                <p className="text-xs font-bold text-[#173b2a]">{item.projectName}</p>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[8px] font-bold text-amber-700">
                  Not uploaded
                </span>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-500">
                {item.id} · {item.programme} · {item.component}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">{item.location}</p>
            </div>

            <div className="space-y-1.5 text-[9px] text-slate-500">
              <p>Captured: {new Date(item.capturedAt).toLocaleString()}</p>
              <p className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1"><Image className="h-3 w-3" /> {item.photos} photos</span>
                <span className="inline-flex items-center gap-1"><Video className="h-3 w-3" /> {item.videos} videos</span>
              </p>
              <p>{item.evidence} evidence files · {item.size}</p>
            </div>

            <div className="flex items-center gap-3 lg:justify-end">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-semibold text-slate-600">
                {item.status}
              </span>
              <button
                type="button"
                onClick={syncNow}
                disabled={!isOnline}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#9ed5af] px-3 py-2 text-[9px] font-bold text-[#08733f] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CloudUpload className="h-3.5 w-3.5" /> Retry upload
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="border-t border-slate-100 bg-[#fbfefc] px-5 py-3 text-[9px] text-slate-500">
        Records remain on the device until the server confirms upload. Once synchronized successfully, they are removed from this pending list automatically.
      </div>
    </section>,
    target,
  );
}
