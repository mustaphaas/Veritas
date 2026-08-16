import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileEdit,
  FolderKanban,
  Home,
  LocateFixed,
  LockKeyhole,
  MapPin,
  Navigation,
  QrCode,
  RefreshCw,
  Route,
  ShieldCheck,
  Signal,
  UploadCloud,
  UserRound,
  Video,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import RoleDashboardShell from "../components/RoleDashboardShell";
import {
  assignmentDisplayRank,
  getDeviceId,
  getDeviceType,
  getAssignmentDisplayStatus,
  isFieldReportLocked,
  isArrivalFresh,
  useInspectionWorkflow,
  type InspectionAssignment,
  type InspectionReport,
} from "../lib/inspection-workflow";

const navigation = [
  { label: "Overview", icon: Home, href: "/field-officer" },
  {
    label: "My Assignments",
    icon: FolderKanban,
    href: "/field-officer/assignments",
  },
  {
    label: "Inspections",
    icon: ClipboardCheck,
    href: "/field-officer/inspections",
  },
  { label: "Draft Reports", icon: FileEdit, href: "/field-officer/drafts" },
  { label: "Sync Queue", icon: RefreshCw, href: "/field-officer/sync" },
  { label: "Profile", icon: UserRound, href: "/field-officer/profile" },
];

const fieldViewPaths: Record<string, string> = {
  Overview: "/field-officer",
  "My Assignments": "/field-officer/assignments",
  Inspections: "/field-officer/inspections",
  "Draft Reports": "/field-officer/drafts",
  "Sync Queue": "/field-officer/sync",
  Profile: "/field-officer/profile",
  Settings: "/field-officer/settings",
  Notifications: "/field-officer/notifications",
};

const fieldPathViews: Record<string, string> = Object.fromEntries(
  Object.entries(fieldViewPaths).map(([view, path]) => [path, view]),
);
const fieldClass =
  "mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-[#173b2a] outline-none focus:border-[#08733f]";
const areaClass =
  "mt-1.5 min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-[#173b2a] outline-none focus:border-[#08733f]";

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "green",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof FolderKanban;
  tone?: "green" | "amber" | "blue";
}) {
  const colors =
    tone === "amber"
      ? "border-[#f1dfaf] bg-[#fffaf0] text-[#d28b00]"
      : tone === "blue"
        ? "border-[#d8e5f6] bg-[#f4f8fd] text-[#3b73ba]"
        : "border-slate-200 bg-white text-[#119653]";
  return (
    <article
      className={`min-h-[116px] min-w-[205px] flex-1 rounded-lg border p-4 ${colors}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-current/10">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-[#263c31]">{label}</p>
          <p className="mt-1 text-2xl font-bold leading-none text-[#13281e]">
            {value}
          </p>
          <p className="mt-3 text-[10px] text-slate-500">{detail}</p>
        </div>
      </div>
    </article>
  );
}

function StatusPill({ status }: { status: InspectionAssignment["status"] }) {
  const displayStatus = getAssignmentDisplayStatus(status);
  const style =
    displayStatus === "Verified"
      ? "border-[#08733f] bg-[#08733f] text-white"
      : displayStatus === "Approved"
        ? "border-[#b9dfc5] bg-[#eaf8ef] text-[#08733f]"
        : displayStatus === "Draft"
          ? "border-[#c8daef] bg-[#eef5fc] text-[#356ca5]"
          : "border-[#f0d88d] bg-[#fff8e5] text-[#956300]";
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${style}`}
    >
      {displayStatus}
    </span>
  );
}

function SignaturePad({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext("2d")!;
    const p = point(event);
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    context.beginPath();
    context.moveTo(p.x, p.y);
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = canvasRef.current!.getContext("2d")!;
    const p = point(event);
    context.lineWidth = 2;
    context.lineCap = "round";
    context.strokeStyle = "#173b2a";
    context.lineTo(p.x, p.y);
    context.stroke();
  };
  const end = () => {
    drawing.current = false;
    if (canvasRef.current) onChange(canvasRef.current.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        <button
          type="button"
          onClick={clear}
          className="text-[10px] font-bold text-[#08733f]"
        >
          Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={520}
        height={120}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        className={`h-28 w-full touch-none rounded-md border bg-white ${value ? "border-[#8bcba0]" : "border-slate-200"}`}
        aria-label={label}
      />
    </div>
  );
}

function InspectionModal({
  assignment,
  onClose,
}: {
  assignment: InspectionAssignment;
  onClose: () => void;
}) {
  const { isOnline, startRoute, verifyArrival, saveReport, submitReport } =
    useInspectionWorkflow();
  const locked = isFieldReportLocked(assignment.status);
  const arrivalFresh = isArrivalFresh(assignment.arrival);
  const [step, setStep] = useState(locked || arrivalFresh ? 2 : 1);
  const [gpsMessage, setGpsMessage] = useState(
    assignment.arrival
      ? `Arrival verified at ${assignment.arrival.distance} m`
      : "Arrival verification required",
  );
  const [gpsBusy, setGpsBusy] = useState(false);
  const [routeStarted, setRouteStarted] = useState(
    Boolean(assignment.routeStartedAt),
  );
  const [report, setReport] = useState<InspectionReport>(
    () =>
      assignment.report ?? {
        projectId: assignment.id,
        contractor: assignment.contractor,
        state: assignment.state,
        lga: assignment.lga,
        community: assignment.community,
        inspectedAt: new Date().toISOString(),
        latitude: assignment.arrival?.latitude ?? assignment.latitude,
        longitude: assignment.arrival?.longitude ?? assignment.longitude,
        inspector: assignment.officer,
        deviceId: getDeviceId(),
        deviceType: getDeviceType(),
        equipmentInstalled: "",
        capacity: "",
        meterDetails: "",
        transformerDetails: "",
        poleCount: "",
        cableLength: "",
        beneficiaries: "",
        observations: "",
        defects: "",
        recommendations: "",
        assetCode: "",
        evidence: [],
      },
  );
  const canCollect =
    locked || arrivalFresh || gpsMessage.startsWith("Verified");
  const update = (key: keyof InspectionReport, value: string) =>
    !locked && setReport((current) => ({ ...current, [key]: value }));
  const captureArrival = (demo = false) => {
    if (locked) return;
    setGpsBusy(true);
    const apply = (latitude: number, longitude: number) => {
      const result = verifyArrival(assignment.id, latitude, longitude);
      setGpsMessage(
        result.allowed
          ? `Verified — ${result.distance} m from project centre`
          : `Outside approved area — ${result.distance.toLocaleString()} m away`,
      );
      if (result.allowed) {
        setReport((current) => ({
          ...current,
          latitude,
          longitude,
          inspectedAt: new Date().toISOString(),
        }));
        setStep(2);
      }
      setGpsBusy(false);
    };
    if (demo) return apply(assignment.latitude, assignment.longitude);
    if (!navigator.geolocation) {
      setGpsMessage("GPS is unavailable on this device");
      setGpsBusy(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => apply(position.coords.latitude, position.coords.longitude),
      () => {
        setGpsMessage("Location permission was not granted");
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };
  const addEvidence = async (
    event: ChangeEvent<HTMLInputElement>,
    type: "photo" | "video",
  ) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    const capturedAt = new Date().toISOString();
    const previews = await Promise.all(
      files.map(
        (file) =>
          new Promise<string>((resolve) => {
            if (file.size > 4_000_000) {
              resolve(URL.createObjectURL(file));
              return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => resolve(URL.createObjectURL(file));
            reader.readAsDataURL(file);
          }),
      ),
    );
    setReport((current) => ({
      ...current,
      evidence: [
        ...current.evidence,
        ...files.map((file, index) => ({
          id: `${capturedAt}-${index}`,
          name: file.name || `${type}-${index + 1}`,
          type,
          capturedAt,
          latitude: current.latitude,
          longitude: current.longitude,
          projectId: current.projectId,
          inspector: current.inspector,
          deviceId: current.deviceId,
          deviceType: current.deviceType,
          previewUrl: previews[index],
        })),
      ],
    }));
    event.target.value = "";
  };
  const mapUrl = `https://www.google.com/maps?q=${assignment.latitude},${assignment.longitude}&z=16&output=embed`;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-5">
      <section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl bg-[#f7f9f7] shadow-2xl sm:rounded-xl">
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-[#173b2a]">
                {assignment.projectName}
              </h2>
              <StatusPill status={assignment.status} />
              {!isOnline && (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">
                  Offline mode
                </span>
              )}
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {assignment.id} · {assignment.state}, {assignment.lga} · Device{" "}
              {getDeviceId()}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="grid grid-cols-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          {["Location & arrival", "Inspection form", "Evidence & submit"].map(
            (label, index) => (
              <button
                key={label}
                type="button"
                onClick={() =>
                  (index === 0 || canCollect) && setStep(index + 1)
                }
                className={`border-b-2 px-2 py-3 text-[10px] font-bold sm:text-xs ${step === index + 1 ? "border-[#08733f] text-[#08733f]" : "border-transparent text-slate-400"}`}
              >
                {index + 1}. {label}
              </button>
            ),
          )}
        </div>
        {locked && (
          <div className="border-b border-[#c8daef] bg-[#eef5fc] px-4 py-3 text-xs font-semibold text-[#356ca5] sm:px-6">
            This report is locked because it has been submitted to Consultant
            Admin. It can only be edited if it is returned for re-inspection.
          </div>
        )}
        {assignment.status === "Re-inspection" &&
          assignment.report?.reviewNote && (
            <div className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 sm:px-6">
              <strong>Re-inspection requested:</strong>{" "}
              {assignment.report.reviewNote}. Verify your arrival again before
              updating the report.
            </div>
          )}
        {step === 1 && (
          <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.6fr_1fr]">
            <iframe
              title="Project location map"
              src={mapUrl}
              className="h-[360px] w-full rounded-lg border border-slate-200 bg-slate-100"
              loading="lazy"
            />
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Project location
                </p>
                <p className="mt-2 text-sm font-bold text-[#173b2a]">
                  {assignment.community}, {assignment.lga}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {assignment.latitude.toFixed(6)},{" "}
                  {assignment.longitude.toFixed(6)}
                </p>
                <p className="mt-3 rounded-md bg-[#edf8f0] p-2 text-[10px] font-semibold text-[#08733f]">
                  Approved geofence: {assignment.geofenceRadius} metres
                </p>
              </div>
              {!locked && (
                <button
                  type="button"
                  disabled={routeStarted}
                  onClick={() => {
                    startRoute(assignment.id);
                    setRouteStarted(true);
                    setGpsMessage(
                      "Optional Google Map navigation enabled. GPS verification is available independently.",
                    );
                    window.open(
                      `https://www.google.com/maps/dir/?api=1&destination=${assignment.latitude},${assignment.longitude}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-[#8bcba0] bg-white text-xs font-bold text-[#08733f] disabled:opacity-50"
                >
                  <Navigation className="h-4 w-4" />{" "}
                  {routeStarted
                    ? "Google Map navigation active"
                    : "Optional: navigate in Google Map"}
                </button>
              )}
              <button
                type="button"
                disabled={gpsBusy || locked}
                onClick={() => captureArrival()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#08733f] text-xs font-bold text-white disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4" />{" "}
                {gpsBusy ? "Capturing GPS…" : "Verify arrival with GPS"}
              </button>
              <button
                type="button"
                disabled={locked}
                onClick={() => captureArrival(true)}
                className="w-full text-[10px] font-bold text-slate-500 underline disabled:cursor-not-allowed disabled:opacity-40"
              >
                Use project coordinates for demo
              </button>
              <div
                className={`rounded-md border p-3 text-xs font-semibold ${canCollect ? "border-[#b9dfc5] bg-[#eef9f1] text-[#08733f]" : gpsMessage.startsWith("Outside") ? "border-red-200 bg-red-50 text-red-700" : "border-[#f0d88d] bg-[#fff8e5] text-[#956300]"}`}
              >
                {gpsMessage}
              </div>
            </div>
          </div>
        )}
        {step === 2 && (
          <form
            className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              setStep(3);
            }}
          >
            {[
              ["Project ID", "projectId", true],
              ["Contractor", "contractor", true],
              ["State", "state", true],
              ["LGA", "lga"],
              ["Community", "community"],
              ["Inspector", "inspector", true],
              ["Equipment installed", "equipmentInstalled"],
              ["Capacity (kW/kVA)", "capacity"],
              ["Meter details", "meterDetails"],
              ["Transformer details", "transformerDetails"],
              ["Pole count", "poleCount"],
              ["Cable length", "cableLength"],
              ["Number of beneficiaries", "beneficiaries"],
            ].map(([label, key, readOnly]) => (
              <label
                key={String(key)}
                className="text-[10px] font-bold uppercase tracking-wide text-slate-500"
              >
                {String(label)}
                <input
                  required={!readOnly && !locked}
                  readOnly={Boolean(readOnly) || locked}
                  value={String(report[key as keyof InspectionReport] ?? "")}
                  onChange={(event) =>
                    update(key as keyof InspectionReport, event.target.value)
                  }
                  className={`${fieldClass} ${readOnly || locked ? "bg-slate-50" : ""}`}
                />
              </label>
            ))}
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:col-span-3">
              Observations
              <textarea
                required={!locked}
                readOnly={locked}
                value={report.observations}
                onChange={(event) => update("observations", event.target.value)}
                className={areaClass}
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:col-span-3">
              Defects
              <textarea
                readOnly={locked}
                value={report.defects}
                onChange={(event) => update("defects", event.target.value)}
                className={areaClass}
              />
            </label>
            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500 lg:col-span-3">
              Recommendations
              <textarea
                required={!locked}
                readOnly={locked}
                value={report.recommendations}
                onChange={(event) =>
                  update("recommendations", event.target.value)
                }
                className={areaClass}
              />
            </label>
            <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-3">
              {!locked && (
                <button
                  type="button"
                  onClick={() => saveReport(assignment.id, report)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600"
                >
                  Save offline draft
                </button>
              )}
              <button
                type="submit"
                className="rounded-md bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white"
              >
                Continue to evidence
              </button>
            </div>
          </form>
        )}
        {step === 3 && (
          <div className="space-y-5 p-4 sm:p-6">
            {!locked && (
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#8bcba0] bg-white text-center text-[#08733f]">
                  <Camera className="h-6 w-6" />
                  <span className="mt-2 text-[10px] font-bold">
                    Capture photos
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(event) => addEvidence(event, "photo")}
                  />
                </label>
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#91abd0] bg-white text-center text-[#3974b6]">
                  <Video className="h-6 w-6" />
                  <span className="mt-2 text-[10px] font-bold">
                    Capture optional video
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    capture="environment"
                    className="hidden"
                    onChange={(event) => addEvidence(event, "video")}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "assetCode",
                      window.prompt(
                        "Scan with a connected barcode reader or enter the asset code",
                        report.assetCode,
                      ) ?? report.assetCode,
                    )
                  }
                  className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-[#173b2a]"
                >
                  <QrCode className="h-6 w-6" />
                  <span className="mt-2 text-[10px] font-bold">
                    Scan QR / barcode
                  </span>
                  <span className="mt-1 text-[9px] text-slate-500">
                    {report.assetCode || "No code captured"}
                  </span>
                </button>
              </div>
            )}
            {report.evidence.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold text-[#173b2a]">
                  Evidence captured ({report.evidence.length})
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {report.evidence.map((item) => (
                    <div
                      key={item.id}
                      className="overflow-hidden rounded-md bg-slate-50 text-[10px]"
                    >
                      {item.previewUrl && item.type === "photo" && (
                        <img
                          src={item.previewUrl}
                          alt={item.name}
                          className="h-32 w-full object-cover"
                        />
                      )}
                      {item.previewUrl && item.type === "video" && (
                        <video
                          src={item.previewUrl}
                          controls
                          className="h-32 w-full bg-slate-900 object-contain"
                        />
                      )}
                      <div className="p-2">
                        <strong>{item.name}</strong>
                        <p className="mt-1 text-slate-500">
                          Tagged: {item.projectId} · {item.latitude.toFixed(5)},{" "}
                          {item.longitude.toFixed(5)} ·{" "}
                          {new Date(item.capturedAt).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!locked ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <SignaturePad
                  label="Community representative signature"
                  value={report.communitySignature}
                  onChange={(value) =>
                    setReport((current) => ({
                      ...current,
                      communitySignature: value,
                    }))
                  }
                />
                <SignaturePad
                  label="Contractor representative signature"
                  value={report.contractorSignature}
                  onChange={(value) =>
                    setReport((current) => ({
                      ...current,
                      contractorSignature: value,
                    }))
                  }
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[#b9dfc5] bg-white p-3 text-xs font-semibold text-[#08733f]">
                  Community representative signature captured
                </div>
                <div className="rounded-lg border border-[#b9dfc5] bg-white p-3 text-xs font-semibold text-[#08733f]">
                  Contractor representative signature captured
                </div>
              </div>
            )}
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-[10px] text-slate-500">
              Submission includes automatic time stamp, GPS, device ID,
              inspector identity and complete audit history.{" "}
              {!isOnline &&
                "It will be queued securely until connectivity returns."}
            </div>
            {!locked && (
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => saveReport(assignment.id, report)}
                  className="rounded-md border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600"
                >
                  Save draft
                </button>
                <button
                  type="button"
                  disabled={
                    !report.communitySignature ||
                    !report.contractorSignature ||
                    report.evidence.length === 0
                  }
                  onClick={() => {
                    submitReport(assignment.id, report);
                    onClose();
                  }}
                  className="flex items-center gap-2 rounded-md bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <UploadCloud className="h-4 w-4" />{" "}
                  {isOnline ? "Submit for QA review" : "Queue for submission"}
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function InlineInspectionWorkspace({
  assignments,
  onOpen,
}: {
  assignments: InspectionAssignment[];
  onOpen: (assignment: InspectionAssignment) => void;
}) {
  const { startRoute, verifyArrival } = useInspectionWorkflow();
  const orderedAssignments = [...assignments].sort(
    (left, right) =>
      assignmentDisplayRank(left.status) - assignmentDisplayRank(right.status),
  );
  const actionable =
    orderedAssignments.find(
      (item) => getAssignmentDisplayStatus(item.status) === "Assigned",
    ) ?? orderedAssignments[0];
  const [selectedId, setSelectedId] = useState(actionable?.id ?? "");
  const [locationMessage, setLocationMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const selected =
    assignments.find((item) => item.id === selectedId) ?? actionable;

  if (!selected) return null;
  const locked =
    !isArrivalFresh(selected.arrival) && !isFieldReportLocked(selected.status);
  const routeReady = Boolean(selected.routeStartedAt);
  const completed = ["Submitted", "Approved", "Verified"].includes(
    selected.status,
  );
  const currentStep = completed
    ? 4
    : selected.report
      ? 3
      : selected.arrival
        ? 2
        : 1;
  const progress = completed
    ? 100
    : selected.report
      ? 72
      : selected.arrival
        ? 48
        : 31;

  const beginRoute = () => {
    startRoute(selected.id);
    setLocationMessage(
      "Optional Google Map navigation enabled inside the app. GPS verification remains available independently.",
    );
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const verify = (demo = false) => {
    setLocating(true);
    const apply = (latitude: number, longitude: number) => {
      const result = verifyArrival(selected.id, latitude, longitude);
      setLocationMessage(
        result.allowed
          ? `Arrival verified — ${result.distance} m from the approved project centre.`
          : `Verification blocked — you are ${result.distance.toLocaleString()} m outside the project centre.`,
      );
      setLocating(false);
    };
    if (demo) return apply(selected.latitude, selected.longitude);
    if (!navigator.geolocation) {
      setLocationMessage("GPS is unavailable on this device.");
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => apply(position.coords.latitude, position.coords.longitude),
      () => {
        setLocationMessage(
          "Location permission is required to verify arrival.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  const previewFields = [
    ["Inspection type", selected.component],
    [
      "Equipment installed",
      selected.report?.equipmentInstalled ??
        "e.g. PV modules, inverters, batteries",
    ],
    ["Verified capacity (kW)", selected.report?.capacity ?? ""],
    ["Beneficiaries confirmed", selected.report?.beneficiaries ?? ""],
    ["Meter number", selected.report?.meterDetails ?? "MTR-…"],
    [
      "Transformer serial number",
      selected.report?.transformerDetails ?? "TR-…",
    ],
    ["Observed poles", selected.report?.poleCount ?? ""],
    ["Installed cable length", selected.report?.cableLength ?? ""],
  ];
  const googleMapUrl = `https://www.google.com/maps?q=${selected.latitude},${selected.longitude}&z=16&output=embed`;

  return (
    <div className="mt-3 space-y-4">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
          <h2 className="text-sm font-bold text-[#173b2a]">
            Assigned projects
          </h2>
          <p className="mt-1 text-[10px] text-slate-500">
            Select an assignment to continue its inspection workflow
          </p>
        </div>
        <div className="max-h-[390px] space-y-2 overflow-y-auto p-3 sm:p-4">
          {orderedAssignments.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setSelectedId(item.id);
                setLocationMessage("");
              }}
              className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition ${selected.id === item.id ? "border-[#9ed5af] bg-[#effaf2] shadow-sm" : "border-slate-200 bg-white hover:border-[#b9dfc5]"}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#08733f] shadow-sm">
                <Navigation className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-xs text-[#173b2a]">
                  {item.projectName}
                </strong>
                <span className="mt-1 block truncate text-[9px] text-slate-500">
                  {item.id} · {item.community}, {item.state}
                </span>
              </span>
              <StatusPill status={item.status} />
            </button>
          ))}
          {orderedAssignments.length > 6 && (
            <p className="py-1 text-center text-[9px] font-semibold text-slate-400">
              Six assignments visible · scroll to view more
            </p>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-base font-bold text-[#173b2a]">
              Site arrival &amp; workflow
            </h2>
            <p className="mt-1 text-[10px] text-slate-500">
              {selected.projectName} · {selected.id}
            </p>
          </div>
          <StatusPill status={selected.status} />
        </div>
        <div className="p-4 sm:p-5">
          <div className="relative h-64 overflow-hidden rounded-xl border border-[#d7e9dc] bg-[#f6fbf7]">
            <iframe
              title="In-app Google Map project navigation"
              src={googleMapUrl}
              className="h-full w-full"
              loading="lazy"
            />
            <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg bg-white/95 p-2.5 shadow-md backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#16824a]" />
                <div>
                  <strong className="block text-[10px] text-[#173b2a]">
                    {selected.community}
                  </strong>
                  <span className="text-[8px] text-slate-500">
                    {selected.latitude.toFixed(5)},{" "}
                    {selected.longitude.toFixed(5)} · {selected.geofenceRadius}{" "}
                    m geofence
                  </span>
                </div>
              </div>
            </div>
          </div>

          {!completed && !selected.arrival && (
            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-[#eed89c] bg-[#fff9e9] p-3 sm:flex-row sm:items-center">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff0bf] text-[#a36b00]">
                <LocateFixed className="h-4 w-4" />
              </span>
              <div className="flex-1">
                <strong className="text-[10px] text-[#5f4615]">
                  Verify arrival before data entry
                </strong>
                <p className="mt-1 text-[9px] text-[#8b7548]">
                  The inspection form remains locked until the officer is within
                  the approved project geofence.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={routeReady}
                  onClick={beginRoute}
                  className="rounded-md border border-[#8bcba0] bg-white px-3 py-2.5 text-[9px] font-bold text-[#08733f] disabled:opacity-50"
                >
                  {routeReady
                    ? "Google Map navigation active"
                    : "Optional: start navigation"}
                </button>
                <button
                  type="button"
                  disabled={locating}
                  onClick={() => verify()}
                  className="rounded-md bg-[#b27a12] px-4 py-2.5 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {locating ? "Checking GPS…" : "GPS verification"}
                </button>
                <button
                  type="button"
                  disabled={false}
                  onClick={() => verify(true)}
                  className="rounded-md border border-[#d9bd77] bg-white px-3 py-2.5 text-[9px] font-bold text-[#8b650e] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Demo GPS
                </button>
              </div>
            </div>
          )}
          {selected.arrival && (
            <div className="mt-3 rounded-lg border border-[#a8d8b7] bg-[#eff9f2] p-3 text-[10px] font-semibold text-[#08733f]">
              GPS verification complete · Arrival verified at{" "}
              {selected.arrival.distance} m ·{" "}
              {new Date(selected.arrival.at).toLocaleString()}
            </div>
          )}
          {locationMessage && (
            <div
              role="alert"
              className={`mt-2 rounded-md border px-3 py-2 text-[10px] ${locationMessage.startsWith("Verification blocked") ? "border-red-300 bg-red-50 font-bold text-red-700" : locationMessage.startsWith("Arrival verified") ? "border-[#a8d8b7] bg-[#eff9f2] font-bold text-[#08733f]" : "border-slate-200 bg-slate-50 text-slate-600"}`}
            >
              {locationMessage}
            </div>
          )}

          <div className="mt-4 grid grid-cols-4 gap-1">
            {["Assigned", "Arrival verified", "Data entry", "Submitted"].map(
              (label, index) => {
                const active = currentStep >= index + 1;
                return (
                  <div key={label} className="relative text-center">
                    <div className="flex items-center">
                      <span
                        className={`h-px flex-1 ${index === 0 ? "bg-transparent" : active ? "bg-[#65aa7d]" : "bg-slate-200"}`}
                      />
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[9px] font-bold ${active ? "border-[#08733f] bg-[#08733f] text-white" : "border-slate-200 bg-white text-slate-400"}`}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={`h-px flex-1 ${index === 3 ? "bg-transparent" : currentStep > index + 1 ? "bg-[#65aa7d]" : "bg-slate-200"}`}
                      />
                    </div>
                    <span
                      className={`mt-1 block text-[8px] ${active ? "font-semibold text-[#173b2a]" : "text-slate-400"}`}
                    >
                      {label}
                    </span>
                  </div>
                );
              },
            )}
          </div>

          <div className="mt-4 flex gap-3 rounded-lg border border-[#d7e9dc] bg-[#f4faf6] p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#16824a]" />
            <div>
              <strong className="text-[10px] text-[#173b2a]">
                Consultant instructions
              </strong>
              <p className="mt-1 text-[9px] leading-4 text-slate-500">
                Verify arrival within the {selected.geofenceRadius} m geofence,
                capture transformer and meter nameplates, confirm installed
                capacity and collect both representative signatures.
              </p>
              {selected.report?.reviewNote && (
                <p className="mt-1 text-[9px] font-semibold text-red-700">
                  Re-inspection note: {selected.report.reviewNote}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="text-base font-bold text-[#173b2a]">
              Inspection data entry
            </h2>
            <p className="mt-1 text-[10px] text-slate-500">
              {locked
                ? "Locked until site arrival is verified and the inspection is started"
                : completed
                  ? "Submitted report is locked for consultant review"
                  : "Complete the inspection record and supporting evidence"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-[#08733f]"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[9px] font-bold text-slate-600">
              {progress}%
            </span>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {locked && (
            <div className="mb-4 flex min-h-28 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-center">
              <LockKeyhole className="h-6 w-6 text-slate-400" />
              <strong className="mt-2 text-[10px] text-slate-600">
                Data entry is locked
              </strong>
              <p className="mt-1 text-[9px] text-slate-400">
                Complete the GPS/geofence arrival check before entering
                inspection data.
              </p>
            </div>
          )}
          <div
            className={`space-y-4 ${locked ? "pointer-events-none opacity-35" : ""}`}
          >
            {[
              "Inspection and asset details",
              "Meter and transformer",
              "Infrastructure verification",
            ].map((title, sectionIndex) => (
              <div
                key={title}
                className="rounded-lg border border-slate-100 p-4"
              >
                <div className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eff9f2] text-[9px] font-bold text-[#08733f]">
                    0{sectionIndex + 1}
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-[#173b2a]">
                      {title}
                    </h3>
                    <p className="mt-1 text-[9px] text-slate-400">
                      {sectionIndex === 0
                        ? "Record the physical equipment and verified capacity."
                        : sectionIndex === 1
                          ? "Use the serial numbers visible on installed equipment."
                          : "Compare observed infrastructure against the approved scope."}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {previewFields
                    .slice(
                      sectionIndex === 0 ? 0 : sectionIndex === 1 ? 4 : 6,
                      sectionIndex === 0 ? 4 : sectionIndex === 1 ? 6 : 8,
                    )
                    .map(([label, value]) => (
                      <label
                        key={label}
                        className="text-[9px] font-semibold text-slate-500"
                      >
                        {label}
                        <input
                          readOnly
                          value={value}
                          placeholder="Enter verified value"
                          className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs text-[#173b2a]"
                        />
                      </label>
                    ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              disabled={locked}
              onClick={() => onOpen(selected)}
              className="rounded-md bg-[#08733f] px-5 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {completed
                ? "View submitted report"
                : selected.report
                  ? "Continue data entry"
                  : "Start data entry"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FieldWorkspace({
  view,
  assignments,
  isOnline,
  onOpen,
  onSync,
}: {
  view: string;
  assignments: InspectionAssignment[];
  isOnline: boolean;
  onOpen: (assignment: InspectionAssignment) => void;
  onSync: () => void;
}) {
  const rows =
    view === "Draft Reports"
      ? assignments.filter((item) => item.status === "Draft")
      : view === "Sync Queue"
        ? assignments.filter((item) => item.syncStatus === "queued")
        : view === "Inspections"
          ? assignments.filter((item) =>
              [
                "Assigned",
                "En route",
                "Arrived",
                "Draft",
                "Re-inspection",
              ].includes(item.status),
            )
          : assignments;

  if (view === "Profile" || view === "Settings") {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h2 className="text-base font-bold text-[#173b2a]">
          {view === "Profile" ? "Field Officer Profile" : "Field App Settings"}
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ["Officer", "Amina Yusuf"],
            ["Operational zone", "North West"],
            ["Device ID", getDeviceId()],
            ["Device type", getDeviceType()],
            [
              "GPS permission",
              navigator.geolocation ? "Available" : "Unavailable",
            ],
            ["Connectivity", isOnline ? "Online" : "Offline"],
            ["Automatic synchronization", "Enabled"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-slate-100 bg-[#f7faf8] p-4"
            >
              <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className="mt-2 text-xs font-bold text-[#173b2a]">{value}</p>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (view === "Notifications") {
    const reinspection = assignments.filter(
      (item) => item.status === "Re-inspection",
    );
    return (
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-[#173b2a]">Notifications</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {reinspection.map((item) => (
            <button
              key={item.id}
              onClick={() => onOpen(item)}
              className="flex w-full items-start justify-between gap-4 p-4 text-left hover:bg-slate-50"
            >
              <div>
                <p className="text-xs font-bold text-red-700">
                  Re-inspection requested
                </p>
                <p className="mt-1 text-xs text-[#173b2a]">
                  {item.projectName}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {item.report?.reviewNote}
                </p>
              </div>
              <span className="text-[10px] font-bold text-[#08733f]">
                Open →
              </span>
            </button>
          ))}
          {!reinspection.length && (
            <p className="p-8 text-center text-xs text-slate-500">
              No new notifications.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-[#173b2a]">{view}</h2>
          <p className="mt-1 text-[10px] text-slate-500">
            Actions are enabled only when the required previous workflow step is
            complete.
          </p>
        </div>
        {view === "Sync Queue" && (
          <button
            onClick={onSync}
            disabled={!isOnline || !rows.length}
            className="rounded-md bg-[#08733f] px-4 py-2 text-[10px] font-bold text-white disabled:opacity-40"
          >
            Synchronize now
          </button>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((item) => (
          <div
            key={item.id}
            className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div>
              <p className="text-xs font-bold text-[#173b2a]">
                {item.projectName}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                {item.id} · {item.community}, {item.state} · Due{" "}
                {new Date(item.dueDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={item.status} />
              <button
                onClick={() => onOpen(item)}
                className="rounded-md border border-[#8bcba0] px-3 py-2 text-[10px] font-bold text-[#08733f]"
              >
                {["Submitted", "Approved", "Verified"].includes(item.status)
                  ? "View locked report"
                  : item.status === "Re-inspection"
                    ? "Start re-inspection"
                    : "Continue"}
              </button>
            </div>
          </div>
        ))}
        {!rows.length && (
          <p className="p-8 text-center text-xs text-slate-500">
            No records in this workspace.
          </p>
        )}
      </div>
    </section>
  );
}

export default function FieldOfficerDashboard() {
  const { assignments, isOnline, startRoute, syncNow } =
    useInspectionWorkflow();
  const [stateFilter, setStateFilter] = useState("All Assigned States");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [selected, setSelected] = useState<InspectionAssignment | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const activeView = fieldPathViews[location.pathname] ?? "Overview";
  const mine = assignments.filter(
    (assignment) => assignment.officer === "Amina Yusuf",
  );
  const filtered = useMemo(
    () =>
      mine.filter(
        (assignment) =>
          (stateFilter === "All Assigned States" ||
            assignment.state === stateFilter) &&
          (statusFilter === "All Statuses" ||
            getAssignmentDisplayStatus(assignment.status) === statusFilter),
      ),
    [mine, stateFilter, statusFilter],
  );
  const completed = mine.filter((item) => item.status === "Approved").length;
  const drafts = mine.filter(
    (item) => getAssignmentDisplayStatus(item.status) === "Draft",
  ).length;
  const queued = mine.filter((item) => item.syncStatus === "queued").length;
  const due = mine.filter(
    (item) => !["Approved", "Submitted", "Verified"].includes(item.status),
  ).length;
  const next =
    filtered.find(
      (item) => !["Approved", "Submitted", "Verified"].includes(item.status),
    ) ?? filtered[0];
  const openRoute = (assignment: InspectionAssignment) => {
    startRoute(assignment.id);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${assignment.latitude},${assignment.longitude}`,
      "_blank",
      "noopener,noreferrer",
    );
  };
  return (
    <RoleDashboardShell
      title="Field Officer Dashboard"
      subtitle="Navigate, verify arrival and complete secure field inspections."
      roleName="Amina Yusuf · Field Officer"
      initials="AY"
      navigation={navigation}
      activeNavigation={activeView}
      onNavigationChange={(label) =>
        navigate(fieldViewPaths[label] ?? "/field-officer")
      }
    >
      {activeView !== "Overview" && (
        <FieldWorkspace
          view={activeView}
          assignments={mine}
          isOnline={isOnline}
          onOpen={setSelected}
          onSync={syncNow}
        />
      )}
      <div className={activeView === "Overview" ? "" : "hidden"}>
        <section
          className={`mb-3 flex items-center justify-between rounded-lg border px-4 py-2.5 ${isOnline ? "border-[#b9dfc5] bg-[#eff9f2] text-[#08733f]" : "border-[#f0d88d] bg-[#fff8e5] text-[#956300]"}`}
        >
          <span className="flex items-center gap-2 text-xs font-bold">
            {isOnline ? (
              <Wifi className="h-4 w-4" />
            ) : (
              <WifiOff className="h-4 w-4" />
            )}
            {isOnline
              ? "Online · field data sync is active"
              : "Offline · drafts and evidence will remain on this device"}
          </span>
          <button
            type="button"
            onClick={syncNow}
            disabled={!isOnline || queued === 0}
            className="rounded-md border border-current px-3 py-1.5 text-[10px] font-bold disabled:opacity-40"
          >
            Sync now {queued ? `(${queued})` : ""}
          </button>
        </section>
        <section className="rounded-lg border border-[#d6e9da] bg-[#f7fcf8] p-3">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-[1fr_1fr_1fr_205px]">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Assigned state
              </span>
              <select
                value={stateFilter}
                onChange={(event) => setStateFilter(event.target.value)}
                className={fieldClass}
              >
                <option>All Assigned States</option>
                {[...new Set(mine.map((item) => item.state))].map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Assignment status
              </span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className={fieldClass}
              >
                <option>All Statuses</option>
                {["Assigned", "Draft", "Approved", "Verified"].map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                Schedule
              </span>
              <select className={fieldClass}>
                <option>This Week</option>
                <option>Next Week</option>
                <option>This Month</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!next}
              onClick={() => next && openRoute(next)}
              className="mt-auto flex h-10 items-center justify-center gap-2 rounded-md bg-[#08733f] px-4 text-xs font-bold text-white disabled:opacity-50"
            >
              <Navigation className="h-4 w-4" /> Open next route
            </button>
          </div>
        </section>
        <section className="mt-3 flex gap-3 overflow-x-auto pb-1">
          <MetricCard
            label="Assigned Projects"
            value={mine.length}
            detail="Received from Consultant Admin"
            icon={FolderKanban}
          />
          <MetricCard
            label="Inspections Due"
            value={due}
            detail="Visits requiring action"
            icon={Clock3}
            tone="amber"
          />
          <MetricCard
            label="Approved"
            value={completed}
            detail="Reports passed consultant QA"
            icon={CheckCircle2}
          />
          <MetricCard
            label="Draft Reports"
            value={drafts}
            detail="Saved on this device"
            icon={FileEdit}
            tone="blue"
          />
          <MetricCard
            label="Sync Pending"
            value={queued}
            detail="Automatically uploads online"
            icon={WifiOff}
            tone="amber"
          />
        </section>
        <InlineInspectionWorkspace
          assignments={filtered}
          onOpen={setSelected}
        />
        <div className="hidden">
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
              <div>
                <h2 className="text-sm font-bold text-[#173b2a]">
                  My Project Assignments
                </h2>
                <p className="mt-1 text-[10px] text-slate-500">
                  Project details, due dates and inspection status
                </p>
              </div>
              <span className="rounded-full bg-[#edf8f0] px-2.5 py-1 text-[10px] font-bold text-[#08733f]">
                {filtered.length} projects
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left">
                <thead className="bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Project</th>
                    <th className="px-3 py-2.5">Location</th>
                    <th className="px-3 py-2.5">Due</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((assignment) => (
                    <tr
                      key={assignment.id}
                      className="border-t border-slate-100"
                    >
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[#173b2a]">
                          {assignment.projectName}
                        </p>
                        <p className="mt-1 text-[10px] text-slate-500">
                          {assignment.id} · {assignment.contractor}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {assignment.community}, {assignment.state}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {new Date(assignment.dueDate).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={assignment.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(assignment)}
                          className="rounded-md border border-[#8bcba0] px-3 py-2 text-[10px] font-bold text-[#08733f]"
                        >
                          {["Submitted", "Approved", "Verified"].includes(
                            assignment.status,
                          )
                            ? "View report"
                            : assignment.status === "Assigned"
                              ? "Open assignment"
                              : "Continue inspection"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <aside className="space-y-3">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-[#173b2a]">
                  Field Workflow
                </h2>
                <Signal className="h-4 w-4 text-[#119653]" />
              </div>
              <div className="mt-4 space-y-2">
                {[
                  [Route, "Navigate to site"],
                  [ShieldCheck, "GPS & geofence arrival"],
                  [ClipboardCheck, "ODK-style data form"],
                  [Camera, "Tagged photos & video"],
                  [UploadCloud, "Submit for consultant QA"],
                ].map(([Icon, label], index) => (
                  <div
                    key={String(label)}
                    className="flex items-center gap-3 rounded-md bg-[#f7faf8] p-2.5"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e6f6eb] text-[10px] font-bold text-[#08733f]">
                      {index + 1}
                    </span>
                    <Icon className="h-4 w-4 text-[#08733f]" />
                    <span className="text-[10px] font-semibold text-[#173b2a]">
                      {String(label)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-bold text-[#173b2a]">
                Anti-fraud protection
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[9px] font-semibold text-slate-600">
                {[
                  "GPS verification",
                  "Geofencing",
                  "Automatic timestamps",
                  "In-app camera",
                  `Device ${getDeviceId()}`,
                  "Digital signatures",
                  "Audit trail",
                  "Offline-ready storage",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-1.5 rounded-md bg-slate-50 p-2"
                  >
                    <CheckCircle2 className="h-3 w-3 text-[#08733f]" />
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
      {selected && (
        <InspectionModal
          assignment={
            assignments.find((item) => item.id === selected.id) ?? selected
          }
          onClose={() => setSelected(null)}
        />
      )}
    </RoleDashboardShell>
  );
}
