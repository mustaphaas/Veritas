import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { LocateFixed, Navigation } from "lucide-react";
import { useInspectionWorkflow } from "../lib/inspection-workflow";

export default function FieldOfficerArrivalControls() {
  const location = useLocation();
  const { assignments, startRoute, verifyArrival } = useInspectionWorkflow();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);

  const selected = useMemo(
    () => assignments.find((assignment) => assignment.id === selectedId) ?? null,
    [assignments, selectedId],
  );

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) {
      setHost(null);
      setSelectedId("");
      return;
    }

    const sync = () => {
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (node) => node.textContent?.trim() === "Site arrival & workflow",
      );
      const section = heading?.closest("section");
      if (!section) {
        setHost(null);
        return;
      }

      const headerText = heading?.parentElement?.textContent ?? section.textContent ?? "";
      const assignment = assignments.find((item) => headerText.includes(item.id));
      if (assignment) setSelectedId(assignment.id);

      const existingAction = Array.from(section.querySelectorAll("button")).some((button) => {
        const text = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
        return (
          text.includes("GPS verification") ||
          text.includes("Optional: start navigation") ||
          text.includes("Google Map navigation active") ||
          text.includes("Open Google Map again")
        );
      });

      if (existingAction) {
        const oldHost = section.querySelector<HTMLElement>("[data-veritas-arrival-controls]");
        oldHost?.remove();
        setHost(null);
        return;
      }

      let target = section.querySelector<HTMLElement>("[data-veritas-arrival-controls]");
      if (!target) {
        target = document.createElement("div");
        target.setAttribute("data-veritas-arrival-controls", "true");
        const content = section.querySelector<HTMLElement>("div.p-4, div.p-5");
        const mapWrap = section.querySelector("iframe")?.parentElement;
        if (content && mapWrap?.parentElement === content) {
          content.insertBefore(target, mapWrap.nextSibling);
        } else if (content) {
          content.prepend(target);
        } else {
          section.appendChild(target);
        }
      }
      setHost(target);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [assignments, location.pathname]);

  if (!host || !selected) return null;

  const navigate = () => {
    startRoute(selected.id);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}`,
      "_blank",
      "noopener,noreferrer",
    );
    setMessage("Google Maps opened with directions to the assigned project site.");
  };

  const verify = (demo = false) => {
    setLocating(true);
    const apply = (latitude: number, longitude: number) => {
      const result = verifyArrival(selected.id, latitude, longitude);
      setMessage(
        result.allowed
          ? `Arrival verified — ${result.distance} m from the approved project centre.`
          : `Verification blocked — you are ${result.distance.toLocaleString()} m outside the project centre.`,
      );
      setLocating(false);
    };

    if (demo) {
      apply(selected.latitude, selected.longitude);
      return;
    }

    if (!navigator.geolocation) {
      setMessage("GPS is unavailable on this device.");
      setLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => apply(position.coords.latitude, position.coords.longitude),
      () => {
        setMessage("Location permission is required to verify arrival.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  return createPortal(
    <div className="mt-3 rounded-lg border border-[#eed89c] bg-[#fff9e9] p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#fff0bf] text-[#a36b00]">
          <LocateFixed className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <strong className="text-[10px] text-[#5f4615]">GPS verification & navigation</strong>
          <p className="mt-1 text-[9px] text-[#8b7548]">
            Re-check the project geofence at any time or reopen directions to the assigned site.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={navigate}
            className="flex items-center gap-1.5 rounded-md border border-[#8bcba0] bg-white px-3 py-2.5 text-[9px] font-bold text-[#08733f]"
          >
            <Navigation className="h-3.5 w-3.5" />
            Navigate
          </button>
          <button
            type="button"
            disabled={locating}
            onClick={() => verify(false)}
            className="rounded-md bg-[#b27a12] px-4 py-2.5 text-[10px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {locating ? "Checking GPS…" : "GPS verification"}
          </button>
          <button
            type="button"
            disabled={locating}
            onClick={() => verify(true)}
            className="rounded-md border border-[#d9bd77] bg-white px-3 py-2.5 text-[9px] font-bold text-[#8b650e] disabled:opacity-40"
          >
            Demo GPS
          </button>
        </div>
      </div>
      {message && (
        <div
          className={`mt-2 rounded-md border px-3 py-2 text-[10px] ${message.startsWith("Verification blocked") ? "border-red-300 bg-red-50 font-bold text-red-700" : message.startsWith("Arrival verified") ? "border-[#a8d8b7] bg-[#eff9f2] font-bold text-[#08733f]" : "border-slate-200 bg-white text-slate-600"}`}
        >
          {message}
        </div>
      )}
    </div>,
    host,
  );
}
