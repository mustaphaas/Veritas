import { Fragment, useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronUp, Clock, Loader2, RefreshCw, ShieldCheck, Sparkles, UsersRound, X } from "lucide-react";
import { fetchPerformanceInsight, fetchReaPerformance } from "../lib/field-api";

type FieldOfficerRow = {
  id: string;
  name: string;
  consultantFirm: string | null;
  status: string;
  totalAssigned: number;
  submittedCount: number;
  verifiedCount: number;
  score: number | null;
  verificationRate: number | null;
  gpsComplianceRate: number | null;
  revisitRate: number | null;
  avgTurnaroundHours: number | null;
};

type ConsultantRow = {
  firmName: string;
  status: string;
  fieldOfficerCount: number;
  score: number | null;
  rosterScore: number | null;
  avgApprovalTurnaroundHours: number | null;
  firmVerificationRate: number | null;
  fieldOfficers: FieldOfficerRow[];
};

type ReaStaffRow = {
  id: string;
  name: string;
  status: string;
  score: number | null;
  totalReviewActions: number;
  verifiedReviews: number;
  reinspectionsSent: number;
  avgReviewTurnaroundHours: number | null;
};

type Insight = { summary: string; flags: string[]; cached: boolean; generatedAt: string };

function scoreClass(score: number | null) {
  if (score === null) return "bg-slate-100 text-slate-500";
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function ScoreBadge({ score }: { score: number | null }) {
  return <span className={`inline-flex h-9 w-14 items-center justify-center rounded-lg text-sm font-bold ${scoreClass(score)}`}>{score === null ? "—" : score}</span>;
}

function InsightPanel({ entityType, entityId, onClose }: { entityType: "field_officer" | "consultant" | "rea_staff"; entityId: string; onClose: () => void }) {
  const [state, setState] = useState<{ loading: boolean; error: string; insight: Insight | null }>({ loading: true, error: "", insight: null });

  const load = (refresh = false) => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    fetchPerformanceInsight(entityType, entityId, refresh)
      .then((payload) => setState({ loading: false, error: "", insight: payload }))
      .catch((error) => setState({ loading: false, error: error instanceof Error ? error.message : "Unable to generate an insight.", insight: null }));
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <section className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#08733f]" />
            <h3 className="text-base font-bold text-[#173b2a]">Veritas AI insight</h3>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="mt-4 min-h-24">
          {state.loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Generating insight…</div>
          ) : state.error ? (
            <p className="rounded-lg bg-red-50 p-3 text-xs font-bold text-red-600">{state.error}</p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-slate-700">{state.insight?.summary}</p>
              {!!state.insight?.flags?.length && (
                <div className="space-y-1.5">
                  {state.insight.flags.map((flag, index) => (
                    <div key={index} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{flag}</div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400">
                {state.insight?.cached ? "Cached" : "Freshly generated"} · {state.insight?.generatedAt ? new Date(state.insight.generatedAt).toLocaleString() : ""}
              </p>
            </div>
          )}
        </div>
        <button onClick={() => load(true)} disabled={state.loading} className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-50">
          <RefreshCw className="h-3.5 w-3.5" />Regenerate
        </button>
      </section>
    </div>
  );
}

export default function ReaPerformanceRatings() {
  const [tab, setTab] = useState<"consultants" | "staff">("consultants");
  const [sinceDays, setSinceDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consultants, setConsultants] = useState<ConsultantRow[]>([]);
  const [reaStaff, setReaStaff] = useState<ReaStaffRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [insightTarget, setInsightTarget] = useState<{ entityType: "field_officer" | "consultant" | "rea_staff"; entityId: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchReaPerformance(sinceDays)
      .then((payload) => {
        setConsultants(payload.consultants || []);
        setReaStaff(payload.reaStaff || []);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load performance ratings."))
      .finally(() => setLoading(false));
  }, [sinceDays]);

  return (
    <div className="space-y-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[#173b2a]">Performance & Ratings</h2>
          <p className="text-xs text-slate-500">Deterministic scores computed from live workflow data, with optional AI-generated context.</p>
        </div>
        <select value={sinceDays} onChange={(e) => setSinceDays(Number(e.target.value))} className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none">
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={180}>Last 180 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </div>

      <div className="flex gap-2 rounded-xl bg-slate-100 p-1 text-xs font-bold">
        <button onClick={() => setTab("consultants")} className={`flex-1 rounded-lg py-2 ${tab === "consultants" ? "bg-white text-[#08733f] shadow-sm" : "text-slate-500"}`}>Consultants</button>
        <button onClick={() => setTab("staff")} className={`flex-1 rounded-lg py-2 ${tab === "staff" ? "bg-white text-[#08733f] shadow-sm" : "text-slate-500"}`}>REA Staff</button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-600">{error}</div>}
      {loading ? (
        <div className="flex items-center gap-2 p-8 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Computing scores…</div>
      ) : tab === "consultants" ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h3 className="font-bold text-[#173b2a]">Consultant leaderboard</h3>
            <p className="text-xs text-slate-500">Rated on their field officers' roster performance, review turnaround, and firm-wide verification rate.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="p-3">Score</th><th className="p-3">Consultant</th><th className="p-3">Officers</th><th className="p-3">Verification rate</th><th className="p-3">Avg. approval time</th><th className="p-3"></th></tr>
              </thead>
              <tbody>
                {consultants.map((consultant) => (
                  <Fragment key={consultant.firmName}>
                    <tr className="border-t border-slate-100">
                      <td className="p-3"><ScoreBadge score={consultant.score} /></td>
                      <td className="p-3">
                        <button onClick={() => setExpanded(expanded === consultant.firmName ? null : consultant.firmName)} className="flex items-center gap-2 font-bold text-[#173b2a]">
                          {expanded === consultant.firmName ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          <Building2 className="h-3.5 w-3.5 text-[#08733f]" />{consultant.firmName}
                        </button>
                      </td>
                      <td className="p-3">{consultant.fieldOfficerCount}</td>
                      <td className="p-3">{consultant.firmVerificationRate === null ? "—" : `${consultant.firmVerificationRate}%`}</td>
                      <td className="p-3">{consultant.avgApprovalTurnaroundHours === null ? "—" : `${consultant.avgApprovalTurnaroundHours}h`}</td>
                      <td className="p-3">
                        <button
                          disabled={consultant.score === null}
                          onClick={() => setInsightTarget({ entityType: "consultant", entityId: consultant.firmName })}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-600 disabled:opacity-40"
                        >
                          <Sparkles className="h-3.5 w-3.5 text-[#08733f]" />AI insight
                        </button>
                      </td>
                    </tr>
                    {expanded === consultant.firmName && (
                      <tr className="border-t border-slate-100 bg-slate-50/60">
                        <td colSpan={6} className="p-4">
                          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400"><UsersRound className="h-3.5 w-3.5" />Field officers</p>
                          <table className="w-full text-left text-xs">
                            <thead className="text-slate-400"><tr><th className="p-2">Score</th><th className="p-2">Officer</th><th className="p-2">Jobs</th><th className="p-2">Verification rate</th><th className="p-2">GPS compliance</th><th className="p-2">Avg. turnaround</th><th className="p-2"></th></tr></thead>
                            <tbody>
                              {consultant.fieldOfficers.map((officer) => (
                                <tr key={officer.id} className="border-t border-slate-200">
                                  <td className="p-2"><ScoreBadge score={officer.score} /></td>
                                  <td className="p-2 font-bold text-[#173b2a]">{officer.name}</td>
                                  <td className="p-2">{officer.totalAssigned}</td>
                                  <td className="p-2">{officer.verificationRate === null ? "—" : `${officer.verificationRate}%`}</td>
                                  <td className="p-2">{officer.gpsComplianceRate === null ? "—" : `${officer.gpsComplianceRate}%`}</td>
                                  <td className="p-2">{officer.avgTurnaroundHours === null ? "—" : `${officer.avgTurnaroundHours}h`}</td>
                                  <td className="p-2">
                                    <button
                                      disabled={officer.score === null}
                                      onClick={() => setInsightTarget({ entityType: "field_officer", entityId: officer.id })}
                                      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 font-bold text-slate-600 disabled:opacity-40"
                                    >
                                      <Sparkles className="h-3 w-3 text-[#08733f]" />Insight
                                    </button>
                                  </td>
                                </tr>
                              ))}
                              {!consultant.fieldOfficers.length && <tr><td colSpan={7} className="p-3 text-slate-400">No field officers on this roster yet.</td></tr>}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {!consultants.length && <tr><td colSpan={6} className="p-4 text-slate-400">No consultants found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h3 className="font-bold text-[#173b2a]">REA staff efficiency</h3>
            <p className="text-xs text-slate-500">Rated on review turnaround from Approved to Verified. Re-inspections sent back are shown for context, not scored.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr><th className="p-3">Score</th><th className="p-3">Staff</th><th className="p-3">Reviews completed</th><th className="p-3">Avg. review time</th><th className="p-3">Re-inspections sent</th><th className="p-3"></th></tr>
              </thead>
              <tbody>
                {reaStaff.map((staff) => (
                  <tr key={staff.id} className="border-t border-slate-100">
                    <td className="p-3"><ScoreBadge score={staff.score} /></td>
                    <td className="p-3 flex items-center gap-2 font-bold text-[#173b2a]"><ShieldCheck className="h-3.5 w-3.5 text-[#08733f]" />{staff.name}</td>
                    <td className="p-3">{staff.verifiedReviews}</td>
                    <td className="p-3 flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" />{staff.avgReviewTurnaroundHours === null ? "—" : `${staff.avgReviewTurnaroundHours}h`}</td>
                    <td className="p-3">{staff.reinspectionsSent}</td>
                    <td className="p-3">
                      <button
                        disabled={staff.score === null}
                        onClick={() => setInsightTarget({ entityType: "rea_staff", entityId: staff.id })}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-bold text-slate-600 disabled:opacity-40"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[#08733f]" />AI insight
                      </button>
                    </td>
                  </tr>
                ))}
                {!reaStaff.length && <tr><td colSpan={6} className="p-4 text-slate-400">No REA staff review activity yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {insightTarget && <InsightPanel entityType={insightTarget.entityType} entityId={insightTarget.entityId} onClose={() => setInsightTarget(null)} />}
    </div>
  );
}
