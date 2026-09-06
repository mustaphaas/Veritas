import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, LocateFixed, MapPin } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  useInspectionWorkflow,
  type InspectionAssignment,
} from "../lib/inspection-workflow";

type ResolvedCoordinate = {
  latitude: number;
  longitude: number;
  source: "Inspection GPS" | "Verified arrival GPS" | "Project GPS";
};

function isValidCoordinate(latitude: number, longitude: number) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 4 &&
    latitude <= 14.5 &&
    longitude >= 2.5 &&
    longitude <= 15
  );
}

function resolveCoordinate(item: InspectionAssignment): ResolvedCoordinate | null {
  if (item.report && isValidCoordinate(item.report.latitude, item.report.longitude)) {
    return {
      latitude: item.report.latitude,
      longitude: item.report.longitude,
      source: "Inspection GPS",
    };
  }

  if (item.arrival && isValidCoordinate(item.arrival.latitude, item.arrival.longitude)) {
    return {
      latitude: item.arrival.latitude,
      longitude: item.arrival.longitude,
      source: "Verified arrival GPS",
    };
  }

  if (isValidCoordinate(item.latitude, item.longitude)) {
    return {
      latitude: item.latitude,
      longitude: item.longitude,
      source: "Project GPS",
    };
  }

  return null;
}

function osmEmbedUrl(coordinate: ResolvedCoordinate) {
  const { latitude, longitude } = coordinate;
  const latDelta = 0.015;
  const lonDelta = 0.02;
  const bbox = [
    longitude - lonDelta,
    latitude - latDelta,
    longitude + lonDelta,
    latitude + latDelta,
  ]
    .map((value) => value.toFixed(6))
    .join("%2C");

  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude.toFixed(6)}%2C${longitude.toFixed(6)}`;
}

function googleMapsUrl(coordinate: ResolvedCoordinate) {
  return `https://www.google.com/maps/search/?api=1&query=${coordinate.latitude.toFixed(6)},${coordinate.longitude.toFixed(6)}`;
}

export default function ConsultantProjectMapClickFix() {
  const location = useLocation();
  const { assignments } = useInspectionWorkflow();
  const [selected, setSelected] = useState<InspectionAssignment | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const coordinate = useMemo(
    () => (selected ? resolveCoordinate(selected) : null),
    [selected],
  );

  useEffect(() => {
    if (location.pathname.replace(/\/+$/, "") !== "/consultant-admin") {
      setSelected(null);
      setHost(null);
      return;
    }

    let observer: MutationObserver | null = null;

    const attach = () => {
      const root = document.querySelector<HTMLElement>("[data-consultant-coverage-map]");
      if (!root) return false;
      const mapHost = root.querySelector<HTMLElement>("div.grid > div.relative");
      if (!mapHost) return false;
      setHost(mapHost);
      return true;
    };

    if (!attach()) {
      observer = new MutationObserver(() => {
        if (attach()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    const onClickCapture = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>(
        "[data-consultant-coverage-map] aside button",
      );
      if (!button) return;

      const projectName = button.querySelector("p")?.textContent?.trim();
      if (!projectName) return;

      const assignment = assignments.find(
        (item) => item.projectName.trim() === projectName,
      );
      if (!assignment) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setSelected(assignment);
    };

    document.addEventListener("click", onClickCapture, true);

    return () => {
      observer?.disconnect();
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [assignments, location.pathname]);

  if (!selected || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-40 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#08733f] text-white">
              <LocateFixed className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-extrabold text-[#173b2a]">
                {selected.projectName}
              </p>
              <p className="truncate text-[9px] text-slate-500">
                {selected.community ? `${selected.community} · ` : ""}
                {selected.lga}, {selected.state}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setSelected(null)}
          className="shrink-0 rounded-lg border border-[#cfe4d5] bg-white px-3 py-2 text-[9px] font-bold text-[#08733f] transition hover:bg-[#f3faf5]"
        >
          ← Back to Nigeria
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-[#edf4ef]">
        {coordinate ? (
          <>
            <iframe
              key={`${selected.id}-${coordinate.latitude}-${coordinate.longitude}`}
              title={`${selected.projectName} exact location`}
              src={osmEmbedUrl(coordinate)}
              className="h-full w-full border-0"
              loading="eager"
              referrerPolicy="no-referrer-when-downgrade"
            />

            <div className="absolute bottom-3 left-3 rounded-lg border border-white/70 bg-[#103e29]/95 px-3 py-2 text-white shadow-lg backdrop-blur">
              <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/60">
                {coordinate.source}
              </p>
              <p className="mt-0.5 font-mono text-[10px] font-semibold">
                {coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}
              </p>
            </div>

            <a
              href={googleMapsUrl(coordinate)}
              target="_blank"
              rel="noreferrer"
              className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-[#b9dbc4] bg-white/95 px-3 py-2 text-[9px] font-bold text-[#08733f] shadow-lg transition hover:bg-white"
            >
              Open in Maps <ExternalLink className="h-3 w-3" />
            </a>
          </>
        ) : (
          <div className="flex h-full min-h-[300px] items-center justify-center p-8">
            <div className="max-w-sm rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center shadow-sm">
              <MapPin className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-3 text-xs font-bold text-slate-700">GPS coordinates unavailable</p>
              <p className="mt-1 text-[10px] leading-5 text-slate-500">
                This project does not yet have a valid inspection, verified arrival, or stored project coordinate.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>,
    host,
  );
}
