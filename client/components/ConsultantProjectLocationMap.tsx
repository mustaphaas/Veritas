import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, LocateFixed, MapPin } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  getAssignmentDisplayStatus,
  useInspectionWorkflow,
  type InspectionAssignment,
} from "../lib/inspection-workflow";

type ProjectLocation = {
  latitude: number;
  longitude: number;
  source: "Inspection GPS" | "Verified arrival GPS" | "Assigned project GPS";
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

function resolveProjectLocation(item: InspectionAssignment): ProjectLocation | null {
  if (
    item.report &&
    isValidCoordinate(item.report.latitude, item.report.longitude)
  ) {
    return {
      latitude: item.report.latitude,
      longitude: item.report.longitude,
      source: "Inspection GPS",
    };
  }

  if (
    item.arrival &&
    isValidCoordinate(item.arrival.latitude, item.arrival.longitude)
  ) {
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
      source: "Assigned project GPS",
    };
  }

  return null;
}

function statusColor(item: InspectionAssignment) {
  const status = getAssignmentDisplayStatus(item.status);
  if (status === "Verified") return "#08733f";
  if (status === "Approved") return "#26a269";
  if (status === "Draft") return "#3974b6";
  return "#d69218";
}

function googleEmbedUrl(location: ProjectLocation) {
  return `https://maps.google.com/maps?q=${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}&z=16&output=embed`;
}

function googleMapsUrl(location: ProjectLocation) {
  return `https://www.google.com/maps/search/?api=1&query=${location.latitude.toFixed(6)},${location.longitude.toFixed(6)}`;
}

function ConsultantLocationMap({ assignments }: { assignments: InspectionAssignment[] }) {
  const [filterVersion, setFilterVersion] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const listener = () => setFilterVersion((value) => value + 1);
    document.addEventListener("change", listener);
    return () => document.removeEventListener("change", listener);
  }, []);

  const pageFilters = useMemo(() => {
    void filterVersion;
    const labels = Array.from(document.querySelectorAll("label"));
    const read = (name: string, fallback: string) => {
      const label = labels.find((item) =>
        item.textContent?.trim().toLowerCase().startsWith(name.toLowerCase()),
      );
      return (label?.querySelector("select") as HTMLSelectElement | null)?.value ?? fallback;
    };
    return {
      programme: read("Programme", "All Programmes"),
      state: read("State", "All States"),
      officer: read("Field officer", "All Field Officers"),
    };
  }, [filterVersion]);

  const filteredAssignments = useMemo(
    () =>
      assignments.filter(
        (item) =>
          (pageFilters.programme === "All Programmes" || item.programme === pageFilters.programme) &&
          (pageFilters.state === "All States" || item.state === pageFilters.state) &&
          (pageFilters.officer === "All Field Officers" || item.officer === pageFilters.officer),
      ),
    [assignments, pageFilters],
  );

  const selected = useMemo(() => {
    const current = filteredAssignments.find((item) => item.id === selectedId);
    return current ?? filteredAssignments[0] ?? null;
  }, [filteredAssignments, selectedId]);

  useEffect(() => {
    if (!selected) {
      setSelectedId(null);
      return;
    }
    if (selectedId !== selected.id) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const selectedLocation = selected ? resolveProjectLocation(selected) : null;

  return (
    <div className="overflow-hidden bg-white">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="relative min-h-[420px] bg-[#eef4f0] p-3">
          {selected && selectedLocation ? (
            <div className="relative h-[396px] overflow-hidden rounded-xl border border-[#c8dfd0] bg-slate-100 shadow-inner">
              <iframe
                key={`${selected.id}-${selectedLocation.latitude}-${selectedLocation.longitude}`}
                title={`${selected.projectName} exact location`}
                src={googleEmbedUrl(selectedLocation)}
                className="h-full w-full border-0"
                loading="eager"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />

              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-slate-950/25 to-transparent" />

              <div className="absolute left-3 top-3 max-w-[75%] rounded-xl border border-white/80 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2.5">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white shadow"
                    style={{ backgroundColor: statusColor(selected) }}
                  >
                    <LocateFixed className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-extrabold text-[#173b2a]">
                      {selected.projectName}
                    </p>
                    <p className="mt-0.5 truncate text-[9px] text-slate-500">
                      {selected.community ? `${selected.community} · ` : ""}
                      {selected.lga}, {selected.state}
                    </p>
                  </div>
                </div>
              </div>

              <div className="absolute bottom-3 left-3 rounded-xl border border-white/70 bg-[#103e29]/94 px-3 py-2.5 text-white shadow-lg backdrop-blur">
                <p className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/60">
                  {selectedLocation.source}
                </p>
                <p className="mt-1 font-mono text-[10px] font-semibold">
                  {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                </p>
              </div>

              <a
                href={googleMapsUrl(selectedLocation)}
                target="_blank"
                rel="noreferrer"
                className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-[#b9dbc4] bg-white/95 px-3 py-2.5 text-[9px] font-bold text-[#08733f] shadow-lg transition hover:bg-white"
              >
                Open in Google Maps <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          ) : (
            <div className="flex h-[396px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center">
              <div className="max-w-xs px-5">
                <MapPin className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-xs font-bold text-[#173b2a]">
                  {selected ? "No valid GPS coordinates for this project" : "No projects match the current filters"}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  A project needs valid latitude and longitude before it can be plotted.
                </p>
              </div>
            </div>
          )}
        </div>

        <aside className="max-h-[420px] overflow-y-auto border-t border-slate-100 bg-gradient-to-b from-white to-[#fbfefc] p-3 lg:border-l lg:border-t-0">
          <div className="sticky top-0 z-10 -mx-1 mb-3 bg-white/95 px-1 pb-2 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                  Project locations
                </p>
                <p className="mt-0.5 text-[8px] text-slate-400">
                  {filteredAssignments.length} project{filteredAssignments.length === 1 ? "" : "s"} in current view
                </p>
              </div>
              <span className="rounded-full bg-[#e8f5ec] px-2 py-1 text-[8px] font-black text-[#08733f]">
                GPS map
              </span>
            </div>
          </div>

          <div className="space-y-2">
            {filteredAssignments.slice(0, 50).map((item) => {
              const location = resolveProjectLocation(item);
              const active = selected?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-[#62b27d] bg-[#eff9f2] shadow-sm"
                      : "border-slate-100 bg-white hover:-translate-y-px hover:border-[#cce4d3] hover:shadow-sm"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-sm"
                      style={{ backgroundColor: statusColor(item) }}
                    >
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-extrabold text-[#173b2a]">
                        {item.projectName}
                      </p>
                      <p className="mt-1 truncate text-[9px] text-slate-500">
                        {item.community ? `${item.community}, ` : ""}{item.state}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="truncate text-[8px] text-slate-400">{item.officer}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[8px] font-bold text-white"
                          style={{ backgroundColor: statusColor(item) }}
                        >
                          {getAssignmentDisplayStatus(item.status)}
                        </span>
                      </div>
                      <div className="mt-2 border-t border-slate-100 pt-1.5">
                        {location ? (
                          <>
                            <p className="font-mono text-[8px] font-semibold text-[#3d7d57]">
                              {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                            </p>
                            <p className="mt-0.5 text-[7px] font-bold uppercase tracking-wide text-slate-400">
                              {location.source}
                            </p>
                          </>
                        ) : (
                          <p className="text-[8px] font-semibold text-amber-600">GPS unavailable</p>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {selected && selectedLocation && (
        <div className="grid gap-2 border-t border-slate-100 bg-[#fbfefc] px-4 py-3 text-[9px] text-slate-500 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <span className="block font-bold uppercase text-slate-400">Project</span>
            <strong className="mt-1 block truncate text-[10px] text-[#173b2a]">{selected.projectName}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">Programme</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selected.programme}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">State</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selected.state}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">LGA</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selected.lga}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">Community</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selected.community || "—"}</strong>
          </div>
          <div>
            <span className="block font-bold uppercase text-slate-400">Location source</span>
            <strong className="mt-1 block text-[10px] text-[#173b2a]">{selectedLocation.source}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConsultantProjectLocationMap() {
  const location = useLocation();
  const { assignments } = useInspectionWorkflow();
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (location.pathname !== "/consultant-admin") {
      setTarget(null);
      return;
    }

    let mount: HTMLDivElement | null = null;
    let legacyChildren: HTMLElement[] = [];
    let cancelled = false;

    const attach = () => {
      if (cancelled) return false;
      const heading = Array.from(document.querySelectorAll("h2")).find(
        (element) =>
          element.textContent?.trim() === "Interactive Project Map" ||
          element.textContent?.trim() === "Consultant Project Coverage" ||
          element.textContent?.trim() === "Project Location Map",
      );
      const section = heading?.closest("section");
      if (!section) return false;
      const header = heading.closest("div.border-b");
      if (!header) return false;

      const existing = section.querySelector<HTMLDivElement>("[data-consultant-project-location-map]");
      if (existing) {
        mount = existing;
        setTarget(existing);
        return true;
      }

      legacyChildren = Array.from(section.children)
        .filter((child) => child !== header)
        .map((child) => child as HTMLElement);
      legacyChildren.forEach((child) => {
        child.dataset.consultantLegacyDisplay = child.style.display;
        child.style.display = "none";
      });

      heading.textContent = "Project Location Map";
      const subtitle = header.querySelector("p");
      if (subtitle) {
        subtitle.textContent =
          "Select a project to view its exact GPS point on the live map";
      }

      mount = document.createElement("div");
      mount.dataset.consultantProjectLocationMap = "true";
      section.appendChild(mount);
      setTarget(mount);
      return true;
    };

    if (!attach()) {
      const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const timeout = window.setTimeout(() => observer.disconnect(), 5000);
      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
        observer.disconnect();
      };
    }

    return () => {
      cancelled = true;
      setTarget(null);
      mount?.remove();
      legacyChildren.forEach((child) => {
        child.style.display = child.dataset.consultantLegacyDisplay ?? "";
        delete child.dataset.consultantLegacyDisplay;
      });
    };
  }, [location.pathname]);

  if (location.pathname !== "/consultant-admin" || !target) return null;
  return createPortal(<ConsultantLocationMap assignments={assignments} />, target);
}
