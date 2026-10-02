import { useMemo, useState } from "react";
import { MapPin, Search, ShieldAlert } from "lucide-react";
import { presentVerdict } from "../lib/satellite-verdict-presentation";

export type SatelliteChoice = {
  id: string;
  name: string;
  state: string;
  lga: string;
  community: string;
  component: string;
  programme?: string;
  status?: string;
  verified?: boolean;
};

export type SatelliteCardData = {
  project: {
    id: string;
    name: string;
    programme: string;
    component: string;
    state: string;
    lga: string;
    community: string;
  };
  resolvedVia: "selection" | "id" | "name" | "map";
  verdict: {
    status: "present" | "absent" | "inconclusive";
    imageQuality: "clear" | "degraded" | "unusable" | "unknown";
    confidence: number | null;
    estimatedNearbyHouses: number | null;
    notes: string;
    evidenceClass?: "direct" | "limited" | "settlement_only";
    evidenceLocation?: "at_project_point" | "elsewhere_in_frame" | "none" | null;
    limitation?: { code: string; message: string } | null;
    houseEstimateNote?: string | null;
  };
  imageUrl: string | null;
  checkedAt: string | null;
  imagerySource: string;
  imageryDate: string | null;
  radiusMetres: number | null;
  analysisMethod: string | null;
};

const VIA_NOTE: Partial<Record<SatelliteCardData["resolvedVia"], string>> = {
  name: "Matched from your message.",
  id: "Matched by the project ID in your message.",
  map: "Taken from the pin open on the Project Map.",
};

function checkedLabel(iso: string | null) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function QualityNotice({ quality }: { quality: SatelliteCardData["verdict"]["imageQuality"] }) {
  if (quality === "clear") return null;
  const unusable = quality === "unusable";
  return (
    <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-[#ecd9a6] bg-[#fdf8e8] px-2.5 py-2 text-[10px] leading-4 text-[#7a5b00]">
      <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
      <span>
        {unusable
          ? "The imagery could not be read, so this is inconclusive. It is not evidence that the infrastructure is missing."
          : quality === "degraded"
            ? "The imagery is degraded. Treat this reading with extra caution."
            : "Imagery quality was not reported. Treat this reading with caution."}
      </span>
    </div>
  );
}

export function SatelliteVerdictCard({ data }: { data: SatelliteCardData }) {
  const { project, verdict } = data;
  const status = presentVerdict(verdict);
  const confidence = verdict.confidence === null ? null : `${Math.round(verdict.confidence * 100)}% confidence`;
  const rooftops = verdict.estimatedNearbyHouses === null ? null : `about ${verdict.estimatedNearbyHouses} rooftops in frame (all buildings)`;
  const place = [project.community, project.lga, project.state].filter(Boolean).join(", ");
  const checked = checkedLabel(data.checkedAt);
  const provenance = [
    data.imagerySource,
    data.radiusMetres === null ? null : `${data.radiusMetres} m radius`,
    checked ? `checked ${checked}` : null,
    data.imageryDate ? `imagery dated ${data.imageryDate}` : "imagery date not supplied",
  ].filter(Boolean);

  return (
    <div className="overflow-hidden rounded-xl border border-[#d9e9de] bg-[#fbfefc]">
      {data.imageUrl ? (
        <div className="relative aspect-[4/3] bg-[#0d2419]">
          <img
            src={data.imageUrl}
            alt={`Satellite view centred on ${project.name}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {/* The export is centred on the stored project point, so the ring marks the claim being tested. */}
          <span
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          />
          <span className="absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-1 text-[9px] font-semibold text-white">
            <MapPin className="h-3 w-3" /> Stored project point
          </span>
        </div>
      ) : null}

      <div className="p-3">
        <p className="text-[12px] font-bold leading-4 text-[#173b2a]">{project.name}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-slate-500">
          {[place, project.component].filter(Boolean).join(" · ")}
        </p>

        <div className="mt-2.5 flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
          <p className="text-[11px] font-bold leading-4" style={{ color: status.color }}>{status.label}</p>
        </div>
        {(confidence || rooftops) && (
          <p className="mt-1 text-[10px] leading-4 text-slate-600">{[confidence, rooftops].filter(Boolean).join(", ")}</p>
        )}

        {verdict.limitation ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-700">
            {verdict.limitation.message}
          </div>
        ) : null}

        <QualityNotice quality={verdict.imageQuality} />

        {verdict.notes ? <p className="mt-2 text-[10px] leading-4 text-slate-700">{verdict.notes}</p> : null}
        {verdict.houseEstimateNote ? <p className="mt-1.5 text-[10px] leading-4 text-slate-500">{verdict.houseEstimateNote}</p> : null}

        <p className="mt-2.5 border-t border-slate-100 pt-2 text-[9px] leading-4 text-slate-500">
          {provenance.join(" · ")}. This is visual evidence only. It does not establish installed capacity, equipment specifications, ownership or operational status.
        </p>
        {VIA_NOTE[data.resolvedVia] ? (
          <p className="mt-1 text-[9px] leading-4 text-slate-400">{VIA_NOTE[data.resolvedVia]} If this is the wrong site, name the project differently.</p>
        ) : null}
      </div>
    </div>
  );
}

export function SatelliteChoiceList({
  choices,
  disabled,
  onChoose,
}: {
  choices: SatelliteChoice[];
  disabled?: boolean;
  onChoose: (choice: SatelliteChoice) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return choices;
    return choices.filter((choice) =>
      [
        choice.name,
        choice.state,
        choice.lga,
        choice.community,
        choice.component,
        choice.programme,
        choice.status,
      ].some((value) => String(value || "").toLowerCase().includes(needle)),
    );
  }, [choices, query]);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-[#d9e9de] bg-[#fbfefc]">
      <div className="border-b border-[#e4eee7] bg-white p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#557060]">
            Project selection
          </p>
          <span className="rounded-full bg-[#edf7f0] px-2 py-0.5 text-[9px] font-bold text-[#08733f]">
            {filtered.length.toLocaleString("en-GB")}{query ? ` of ${choices.length.toLocaleString("en-GB")}` : ""} project{filtered.length === 1 ? "" : "s"}
          </span>
        </div>
        {choices.length > 6 ? (
          <label className="mt-2 flex items-center gap-2 rounded-lg border border-[#dce8df] bg-[#f8fbf9] px-2.5 py-2 focus-within:border-[#79be91] focus-within:bg-white">
            <Search className="h-3.5 w-3.5 shrink-0 text-[#08733f]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search project, state, LGA, community or programme"
              className="min-w-0 flex-1 bg-transparent text-[10px] text-slate-700 outline-none placeholder:text-slate-400"
              aria-label="Search project options"
            />
          </label>
        ) : null}
      </div>

      <div className="max-h-[310px] space-y-1.5 overflow-y-auto p-2">
        {filtered.length ? filtered.map((choice) => {
          const place = [choice.community, choice.lga, choice.state].filter(Boolean).join(", ");
          const meta = [choice.programme, choice.component, choice.status].filter(Boolean).join(" · ");
          return (
            <button
              key={choice.id}
              type="button"
              disabled={disabled}
              onClick={() => onChoose(choice)}
              className="group block w-full rounded-lg border border-[#e0ebe3] bg-white px-2.5 py-2.5 text-left transition hover:border-[#79be91] hover:bg-[#eff9f2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#08733f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold leading-4 text-[#173b2a]">{choice.name}</span>
                  <span className="block text-[9px] leading-4 text-slate-500">{place || "Location not specified"}</span>
                  {meta ? <span className="block text-[9px] leading-4 text-slate-400">{meta}</span> : null}
                </span>
                {typeof choice.verified === "boolean" ? (
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold ${
                    choice.verified
                      ? "bg-[#e9f7ee] text-[#08733f]"
                      : "bg-[#fff7df] text-[#8a6400]"
                  }`}>
                    {choice.verified ? "Verified" : "Pending"}
                  </span>
                ) : null}
              </span>
            </button>
          );
        }) : (
          <div className="px-3 py-6 text-center text-[10px] leading-4 text-slate-500">
            No projects match that search.
          </div>
        )}
      </div>
    </div>
  );
}
