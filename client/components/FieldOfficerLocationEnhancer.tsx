import { useMemo, useState } from "react";
import { Navigation, MapPin, ShieldCheck, TestTube2, X } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  canVerifyArrival,
  useInspectionWorkflow,
} from "../lib/inspection-workflow";

export default function FieldOfficerLocationEnhancer() {
  const location = useLocation();
  const { assignments, startRoute, verifyArrival } = useInspectionWorkflow();
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState(
    "Select an assignment, then verify your live GPS location or use Demo GPS for off-site testing.",
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);

  const eligibleAssignments = useMemo(
    () => assignments.filter((assignment) => canVerifyArrival(assignment.status)),
    [assignments],
  );

  const selected =
    eligibleAssignments.find((assignment) => assignment.id === selectedId) ??
    eligibleAssignments[0];

  if (!location.pathname.startsWith("/field-officer") || !open) return null;

  const verify = (demo = false) => {
    if (!selected) {
      setMessage("No assignment is currently available for GPS verification.");
      return;
    }

    const apply = (latitude: number, longitude: number) => {
      const result = verifyArrival(selected.id, latitude, longitude);
      setMessage(
        result.allowed
          ? `${demo ? "Demo verified" : "GPS verified"} — ${result.distance} m from the approved project centre.`
          : `Verification blocked — you are ${result.distance.toLocaleString()} m outside the approved project geofence.`,
      );
      setBusy(false);
    };

    if (demo) {
      setBusy(true);
      apply(selected.latitude, selected.longitude);
      return;
    }

    if (!navigator.geolocation) {
      setMessage("GPS is unavailable in this browser or device.");
      return;
    }

    setBusy(true);
    setMessage("Capturing your current GPS location…");
    navigator.geolocation.getCurrentPosition(
      (position) => apply(position.coords.latitude, position.coords.longitude),
      (error) => {
        const detail =
          error.code === error.PERMISSION_DENIED
            ? "Location permission is blocked. Allow location access for Veritas in your browser/device settings and try again."
            : error.code === error.TIMEOUT
              ? "GPS timed out before a reliable fix was received. Move to an open area and try again, or use Demo GPS for testing."
              : "Your device could not determine its current location. Turn on Location Services and try again.";
        setMessage(detail);
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const navigate = () => {
    if (!selected) {
      setMessage("Select an assignment before starting navigation.");
      return;
    }
    startRoute(selected.id);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}&travelmode=driving`,
      "_blank",
      "noopener,noreferrer",
    );
    setMessage(
      `Google Maps opened with directions to ${selected.projectName} (${selected.community}, ${selected.lga}).`,
    );
  };

  return (
    <aside className="fixed bottom-5 right-5 z-[80] w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-[#b9dfc5] bg-white shadow-2xl">
      <div className="flex items-start justify-between bg-[#08733f] px-4 py-3 text-white">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/75">
            Field Officer
          </p>
          <h2 className="mt-0.5 text-sm font-bold">GPS Verification & Navigation</h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
          aria-label="Close GPS verification panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 p-4">
        {eligibleAssignments.length > 0 ? (
          <>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">
              Assignment / project site
              <select
                value={selected?.id ?? ""}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setMessage("Project selected. Verify GPS, use Demo GPS, or navigate to the site.");
                }}
                className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#173b2a] outline-none focus:border-[#08733f]"
              >
                {eligibleAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.projectName} — {assignment.state}
                  </option>
                ))}
              </select>
            </label>

            {selected && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#08733f]" />
                  <div>
                    <p className="text-xs font-bold text-[#173b2a]">{selected.projectName}</p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {selected.community}, {selected.lga}, {selected.state}
                    </p>
                    <p className="mt-1 text-[10px] font-medium text-slate-500">
                      {selected.latitude.toFixed(6)}, {selected.longitude.toFixed(6)} · Geofence {selected.geofenceRadius} m
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => verify(false)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#08733f] px-3 text-[10px] font-bold text-white disabled:opacity-50"
              >
                <ShieldCheck className="h-4 w-4" />
                {busy ? "Locating…" : "Verify GPS"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => verify(true)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#e3bd58] bg-[#fff8e5] px-3 text-[10px] font-bold text-[#8a6500] disabled:opacity-50"
                title="Use the assigned project coordinates so the workflow can be demonstrated away from the physical site."
              >
                <TestTube2 className="h-4 w-4" />
                Demo GPS
              </button>

              <button
                type="button"
                onClick={navigate}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#8bcba0] bg-white px-3 text-[10px] font-bold text-[#08733f]"
              >
                <Navigation className="h-4 w-4" />
                Navigate
              </button>
            </div>

            <div
              className={`rounded-lg border p-3 text-[10px] font-semibold leading-relaxed ${
                message.includes("verified")
                  ? "border-[#b9dfc5] bg-[#eef9f1] text-[#08733f]"
                  : message.includes("blocked") || message.includes("permission") || message.includes("unavailable") || message.includes("timed out")
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
            >
              {message}
            </div>

            <p className="text-[9px] leading-relaxed text-slate-400">
              Demo GPS is only for demonstrations and testing away from the project site. Live inspection verification continues to use the device's real GPS position and the project's approved geofence.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            No Assigned, En route, Draft, or Re-inspection project is currently available for GPS verification.
          </div>
        )}
      </div>
    </aside>
  );
}
