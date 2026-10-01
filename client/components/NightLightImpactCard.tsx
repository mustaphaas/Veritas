import { MoonStar, TrendingDown, TrendingUp } from "lucide-react";
import type { NightLightImpact } from "../lib/rea-project-map-data";

export type NightLightCardData = {
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
  impact: NightLightImpact;
};

function fmtRadiance(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.01) return value.toFixed(4);
  return value.toFixed(2);
}

function pct(value: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
    : "—";
}

function impactLabel(value: NightLightImpact["impactClass"]) {
  if (value === "strong_increase") return "Strong increase";
  if (value === "moderate_increase") return "Moderate increase";
  if (value === "decrease") return "Decrease";
  if (value === "no_clear_change") return "No clear change";
  return "Signal too low for reliable % change";
}

export function NightLightImpactCard({ data }: { data: NightLightCardData }) {
  const { project, impact } = data;
  const primaryBefore =
    typeof impact.coreP90BaselineRadiance === "number" && Number.isFinite(impact.coreP90BaselineRadiance)
      ? impact.coreP90BaselineRadiance
      : impact.baselineRadiance;
  const primaryAfter =
    typeof impact.coreP90AfterRadiance === "number" && Number.isFinite(impact.coreP90AfterRadiance)
      ? impact.coreP90AfterRadiance
      : impact.afterRadiance;
  const usingCoreP90 =
    typeof impact.coreP90BaselineRadiance === "number" &&
    Number.isFinite(impact.coreP90BaselineRadiance) &&
    typeof impact.coreP90AfterRadiance === "number" &&
    Number.isFinite(impact.coreP90AfterRadiance);
  const primaryPercentChange =
    typeof impact.coreP90PercentChange === "number" && Number.isFinite(impact.coreP90PercentChange)
      ? impact.coreP90PercentChange
      : impact.percentChange;
  const hasMeasuredChange = typeof primaryPercentChange === "number" && Number.isFinite(primaryPercentChange);
  const increased = hasMeasuredChange && primaryPercentChange > 0;
  const TrendIcon = hasMeasuredChange ? (increased ? TrendingUp : TrendingDown) : MoonStar;
  const place = [project.community, project.lga, project.state].filter(Boolean).join(", ");
  return (
    <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white">
      <div className="border-b border-indigo-100 bg-gradient-to-r from-slate-950 to-indigo-950 px-3 py-3 text-white">
        <div className="flex items-center gap-2">
          <MoonStar className="h-4 w-4" />
          <div>
            <p className="text-[11px] font-extrabold">Night-time Light Impact</p>
            <p className="text-[9px] text-white/65">NASA VIIRS Black Marble · {impact.sourceProduct}</p>
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-[12px] font-bold text-[#173b2a]">{project.name}</p>
        <p className="mt-0.5 text-[9px] text-slate-500">{place}</p>

        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="rounded-lg bg-slate-50 p-2.5">
            <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">Before{usingCoreP90 ? " · 1 km core P90" : ""}</p>
            <p className="mt-1 text-lg font-black text-slate-800">{fmtRadiance(primaryBefore)}</p>
            <p className="text-[8px] text-slate-500">nW/cm²/sr</p>
          </div>
          <TrendIcon className={`h-4 w-4 ${!hasMeasuredChange ? "text-slate-400" : increased ? "text-emerald-600" : "text-rose-600"}`} />
          <div className="rounded-lg bg-indigo-50 p-2.5">
            <p className="text-[8px] font-bold uppercase tracking-wide text-indigo-400">After{usingCoreP90 ? " · 1 km core P90" : ""}</p>
            <p className="mt-1 text-lg font-black text-indigo-950">{fmtRadiance(primaryAfter)}</p>
            <p className="text-[8px] text-indigo-500">nW/cm²/sr</p>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-100 px-2.5 py-2">
          <span className="text-[9px] font-semibold text-slate-500">Observed change</span>
          <strong className={`text-[11px] ${!hasMeasuredChange ? "text-slate-600" : increased ? "text-emerald-700" : "text-rose-700"}`}>
            {pct(primaryPercentChange)} · {impactLabel(impact.impactClass)}
          </strong>
        </div>

        {impact.detectionReason && (
          <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[9px] leading-4 text-slate-600">
            {impact.detectionReason}
          </div>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2 text-[9px]">
          <div className="rounded-lg border border-slate-100 p-2">
            <span className="text-slate-400">Comparison area</span>
            <p className="mt-0.5 font-bold text-slate-700">{pct(impact.controlPercentChange)}</p>
          </div>
          <div className="rounded-lg border border-slate-100 p-2">
            <span className="text-slate-400">Valid months</span>
            <p className="mt-0.5 font-bold text-slate-700">{impact.monthsBefore} before · {impact.monthsAfter} after</p>
          </div>
        </div>

        <p className="mt-2.5 text-[9px] leading-4 text-slate-500">
          Completion reference {impact.commissioningDate} · {impact.dateBasis}. This is supporting evidence of a change in nighttime illumination, not proof that this project alone caused the change.
        </p>
      </div>
    </div>
  );
}
