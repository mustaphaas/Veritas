import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Database,
  FileCheck2,
  HardDrive,
  Image,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Video,
  Wifi,
  WifiOff,
} from "lucide-react";
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

function QueueState({ status, isOnline }: { status: string; isOnline: boolean }) {
  const retry = status === "Retry required";
  const waiting = !isOnline || status === "Waiting for connection";
  const className = retry
    ? "border-red-200 bg-red-50 text-red-700"
    : waiting
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-bold ${className}`}
    >
      {retry ? (
        <AlertTriangle className="h-3 w-3" />
      ) : waiting ? (
        <WifiOff className="h-3 w-3" />
      ) : (
        <CheckCircle2 className="h-3 w-3" />
      )}
      {retry ? "Retry required" : waiting ? "Waiting for network" : "Ready to upload"}
    </span>
  );
}

export default function FieldOfficerPendingUploads() {
  const location = useLocation();
  const { session } = useAuth();
  const { assignments, isOnline, syncNow } = useInspectionWorkflow();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  const rows = useMemo(() => {
    const officerName = session?.name ?? "Amina Yusuf";
    const realQueued = assignments
      .filter(
        (item) => item.officer === officerName && item.syncStatus === "queued",
      )
      .map((item) => ({
        id: item.id,
        projectName: item.projectName,
        programme: item.programme,
        component: item.component,
        location: `${item.community}, ${item.state}`,
        capturedAt:
          item.report?.inspectedAt ?? item.arrival?.at ?? new Date().toISOString(),
        evidence: item.report?.evidence.length ?? 0,
        photos:
          item.report?.evidence.filter((evidence) => evidence.type === "photo")
            .length ?? 0,
        videos:
          item.report?.evidence.filter((evidence) => evidence.type === "video")
            .length ?? 0,
        size: "Pending upload",
        status: "Queued",
      }));

    return realQueued.length ? realQueued : mockPending;
  }, [assignments, session?.name]);

  const evidenceTotal = rows.reduce((sum, item) => sum + item.evidence, 0);
  const retryCount = rows.filter((item) => item.status === "Retry required").length;

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

      const existing = section.parentElement?.querySelector<HTMLDivElement>(
        "[data-pending-offline-uploads]",
      );
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
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-2xl border border-[#cfe6d6] bg-[linear-gradient(135deg,#f5fbf7_0%,#ffffff_55%,#eef8f1_100%)] shadow-sm">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#dff2e5]/70 blur-3xl" />
        <div className="relative flex flex-col gap-5 px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#c4e2ce] bg-white text-[#08733f] shadow-sm">
              <CloudUpload className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-[#173b2a]">
                  Offline Sync Queue
                </h2>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-bold text-amber-700">
                  {rows.length} pending
                </span>
              </div>
              <p className="mt-1.5 max-w-2xl text-[11px] leading-5 text-slate-500">
                Inspection records and evidence captured in the field are kept securely on this device until Veritas confirms a successful upload.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[9px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#08733f]" />
                  Secure local storage
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-[#08733f]" />
                  Automatic retry
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Smartphone className="h-3.5 w-3.5 text-[#08733f]" />
                  Device-resident evidence
                </span>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
            <span
              className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-[10px] font-bold ${
                isOnline
                  ? "border-[#b9dfc5] bg-white text-[#08733f]"
                  : "border-amber-200 bg-amber-50 text-amber-700"
              }`}
            >
              {isOnline ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
              {isOnline ? "Connected" : "Offline mode"}
            </span>
            <button
              type="button"
              onClick={syncNow}
              disabled={!isOnline || rows.length === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-4 text-[10px] font-bold text-white shadow-sm transition hover:bg-[#066434] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw className="h-4 w-4" />
              Synchronize all
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Pending records",
            value: rows.length,
            detail: "Awaiting server confirmation",
            icon: Database,
            tone: "text-[#08733f] bg-[#eff9f2] border-[#d5ebdc]",
          },
          {
            label: "Evidence files",
            value: evidenceTotal,
            detail: "Photos, videos and attachments",
            icon: FileCheck2,
            tone: "text-[#386fa8] bg-[#f3f8fd] border-[#dbe8f5]",
          },
          {
            label: "Retry required",
            value: retryCount,
            detail: "Needs another upload attempt",
            icon: AlertTriangle,
            tone: "text-[#b46f08] bg-[#fff9ed] border-[#f0dfb9]",
          },
          {
            label: "Storage state",
            value: "Protected",
            detail: isOnline ? "Ready to synchronize" : "Safe while offline",
            icon: HardDrive,
            tone: "text-[#5c6570] bg-slate-50 border-slate-200",
          },
        ].map(({ label, value, detail, icon: Icon, tone }) => (
          <article key={label} className={`rounded-xl border bg-white p-4 shadow-sm ${tone.split(" ").find((value) => value.startsWith("border-")) ?? ""}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  {label}
                </p>
                <p className="mt-2 text-xl font-bold text-[#173b2a]">{value}</p>
                <p className="mt-1 text-[9px] text-slate-500">{detail}</p>
              </div>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${tone}`}>
                <Icon className="h-4 w-4" />
              </span>
            </div>
          </article>
        ))}
      </section>

      {!isOnline && (
        <section className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="text-[10px] font-bold text-amber-800">No network connection detected</p>
            <p className="mt-1 text-[9px] leading-4 text-amber-700">
              You can continue working normally. Veritas will retain all queued records and retry automatically when connectivity returns.
            </p>
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-sm font-bold text-[#173b2a]">Pending uploads</h3>
            <p className="mt-1 text-[10px] text-slate-500">
              Records are uploaded in queue order when a stable connection is available.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[9px] font-bold text-slate-600">
            {rows.length} records
          </span>
        </div>

        <div className="space-y-3 bg-[#fafcfb] p-3 sm:p-4">
          {rows.map((item, index) => {
            const ready = isOnline && item.status !== "Retry required";
            const progress = ready ? 72 : item.status === "Retry required" ? 18 : 8;

            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-[#bddfc8] hover:shadow-sm sm:p-5"
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(220px,.8fr)_auto] xl:items-center">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eff9f2] text-[#08733f]">
                        <FileCheck2 className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-[#173b2a]">
                          {item.projectName}
                        </p>
                        <p className="mt-0.5 text-[9px] text-slate-400">
                          Queue #{String(index + 1).padStart(2, "0")} · {item.id}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-slate-500">
                      <span>{item.programme} · {item.component}</span>
                      <span>{item.location}</span>
                      <span>{new Date(item.capturedAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-3 text-[9px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Image className="h-3.5 w-3.5 text-[#386fa8]" />
                        {item.photos} photos
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Video className="h-3.5 w-3.5 text-[#8a58a5]" />
                        {item.videos} videos
                      </span>
                      <span>{item.evidence} files</span>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[8px] font-semibold text-slate-400">
                        <span>{ready ? "Preparing upload" : "Upload paused"}</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${item.status === "Retry required" ? "bg-amber-500" : "bg-[#08733f]"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <QueueState status={item.status} isOnline={isOnline} />
                    <button
                      type="button"
                      onClick={syncNow}
                      disabled={!isOnline}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#9ed5af] bg-white px-3 text-[9px] font-bold text-[#08733f] transition hover:bg-[#f3faf5] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </button>
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
                      <ChevronRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 text-[9px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#08733f]" />
            A record leaves this queue only after the server confirms receipt.
          </span>
          <span>{isOnline ? "Connection available · sync can proceed" : "Waiting for network"}</span>
        </div>
      </section>
    </div>,
    target,
  );
}
