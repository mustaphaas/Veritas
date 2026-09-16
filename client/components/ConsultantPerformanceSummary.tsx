import { useEffect, useState } from "react";
import { Gauge, Loader2, UsersRound } from "lucide-react";
import { fetchConsultantPerformance } from "../lib/field-api";

type FieldOfficerRow = {
  id: string;
  name: string;
  score: number | null;
  verificationRate: number | null;
  avgTurnaroundHours: number | null;
};

type ConsultantPerformance = {
  firmName: string;
  score: number | null;
  fieldOfficerCount: number;
  avgApprovalTurnaroundHours: number | null;
  firmVerificationRate: number | null;
  fieldOfficers: FieldOfficerRow[];
};

function scoreClass(score: number | null) {
  if (score === null) return "bg-slate-100 text-slate-500";
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

// Read-only summary of this consultant firm's own performance score and its
// own field officers' numeric metrics. Intentionally shows no other
// consultant firm's data and no AI-generated narrative (that stays
// REA-admin-only) - just the same deterministic numbers the REA dashboard
// uses to rate this firm, so the firm can act on them.
export default function ConsultantPerformanceSummary() {
  const [state, setState] = useState<{ loading: boolean; error: string; data: ConsultantPerformance | null }>({ loading: true, error: "", data: null });

  useEffect(() => {
    fetchConsultantPerformance(90)
      .then((payload) => setState({ loading: false, error: "", data: payload.consultant }))
      .catch((error) => setState({ loading: false, error: error instanceof Error ? error.message : "Unable to load performance.", data: null }));
  }, []);

  if (state.loading) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading your performance…</div>
      </section>
    );
  }
  if (state.error || !state.data) {
    return null; // Not enough workflow data yet - no need to alarm the consultant with an error card.
  }

  const { data } = state;
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-[#08733f]" />
          <h2 className="text-sm font-bold text-[#173b2a]">Your performance rating</h2>
        </div>
        <span className={`inline-flex h-8 min-w-12 items-center justify-center rounded-lg px-2 text-sm font-bold ${scoreClass(data.score)}`}>{data.score === null ? "—" : data.score}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 text-xs sm:grid-cols-3">
        <div><p className="text-[10px] font-bold uppercase text-slate-400">Verification rate</p><p className="mt-1 font-bold text-[#173b2a]">{data.firmVerificationRate === null ? "—" : `${data.firmVerificationRate}%`}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-slate-400">Avg. approval time</p><p className="mt-1 font-bold text-[#173b2a]">{data.avgApprovalTurnaroundHours === null ? "—" : `${data.avgApprovalTurnaroundHours}h`}</p></div>
        <div><p className="text-[10px] font-bold uppercase text-slate-400">Field officers</p><p className="mt-1 font-bold text-[#173b2a]">{data.fieldOfficerCount}</p></div>
      </div>
      {!!data.fieldOfficers.length && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><UsersRound className="h-3.5 w-3.5" />Your roster</p>
          <div className="space-y-1.5">
            {data.fieldOfficers.map((officer) => (
              <div key={officer.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs">
                <span className="font-bold text-[#173b2a]">{officer.name}</span>
                <span className="flex items-center gap-3 text-slate-500">
                  {officer.verificationRate !== null && <span>{officer.verificationRate}% verified</span>}
                  <span className={`inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1.5 text-[11px] font-bold ${scoreClass(officer.score)}`}>{officer.score === null ? "—" : officer.score}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
