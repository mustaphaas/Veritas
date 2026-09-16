// Performance & ratings engine.
//
// Design principle: every numeric score here is computed live from the
// existing workflow tables (assignments, audit_events, users) - nothing is
// hand-entered or independently stored, so a score can always be explained
// by re-running the same query. AI (see performance-ai-insights below) is
// only used to narrate a score in plain language, never to produce the
// score itself, so ratings stay auditable and appealable.
//
// Field Officer -> Consultant Admin -> REA Admin is the same workflow used
// by worker/field-api.js: Assigned -> (arrival/draft) -> Submitted
// (submitted_at) -> Approved (approved_at, by consultant_admin) -> Verified
// (verified_at, by rea_admin), with either reviewer able to bounce a
// submission back to "Re-inspection".

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round1 = (value) => Math.round(value * 10) / 10;

function hoursBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return null;
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Number.isFinite(ms) ? ms / 3_600_000 : null;
}

// Turns a turnaround time into a 0-100 score: full marks at/under the
// target, degrading linearly to 0 once it is `target + window` hours late.
function speedScore(hours, targetHours, windowHours) {
  if (hours === null || !Number.isFinite(hours)) return null;
  if (hours <= targetHours) return 100;
  return clamp(100 - ((hours - targetHours) * 100) / windowHours, 0, 100);
}

function since(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ---------------------------------------------------------------------------
// Field officers
// ---------------------------------------------------------------------------

const FO_WEIGHTS = { verification: 0.4, speed: 0.25, gps: 0.2, revisit: 0.15 };
const FO_TARGET_HOURS = 48; // time from assignment creation to field submission
const FO_WINDOW_HOURS = 96;

function fieldOfficerScore(metrics) {
  if (metrics.totalAssigned === 0) return null;
  const verificationRate = metrics.submittedCount > 0 ? metrics.verifiedCount / metrics.submittedCount : 0;
  const gpsRate = metrics.totalAssigned > 0 ? metrics.gpsCount / metrics.totalAssigned : 0;
  const revisitRate = metrics.submittedCount > 0 ? metrics.reinspectionCount / metrics.submittedCount : 0;
  const speed = speedScore(metrics.avgTurnaroundHours, FO_TARGET_HOURS, FO_WINDOW_HOURS);
  const score =
    FO_WEIGHTS.verification * verificationRate * 100 +
    FO_WEIGHTS.speed * (speed ?? 50) +
    FO_WEIGHTS.gps * gpsRate * 100 +
    FO_WEIGHTS.revisit * (100 - Math.min(100, revisitRate * 100));
  return {
    score: Math.round(clamp(score, 0, 100)),
    verificationRate: round1(verificationRate * 100),
    gpsComplianceRate: round1(gpsRate * 100),
    revisitRate: round1(revisitRate * 100),
    avgTurnaroundHours: metrics.avgTurnaroundHours === null ? null : round1(metrics.avgTurnaroundHours),
  };
}

export async function fieldOfficerPerformance(env, { consultantFirm = null, sinceDays = 90 } = {}) {
  const sinceIso = since(sinceDays);
  const officersResult = await env.DB.prepare(
    `SELECT u.id AS officerId, u.name AS officerName, u.consultant_firm AS consultantFirm, u.status
     FROM users u WHERE u.role='field_officer' ${consultantFirm ? "AND u.consultant_firm=?" : ""}
     ORDER BY u.name COLLATE NOCASE`,
  )
    .bind(...(consultantFirm ? [consultantFirm] : []))
    .all();

  const metricsResult = await env.DB.prepare(
    `SELECT officer_id AS officerId,
       COUNT(*) AS totalAssigned,
       SUM(CASE WHEN submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submittedCount,
       SUM(CASE WHEN status='Verified' THEN 1 ELSE 0 END) AS verifiedCount,
       SUM(CASE WHEN arrival_json IS NOT NULL THEN 1 ELSE 0 END) AS gpsCount,
       AVG(CASE WHEN submitted_at IS NOT NULL THEN (julianday(submitted_at)-julianday(created_at))*24 END) AS avgTurnaroundHours
     FROM assignments WHERE created_at>=? GROUP BY officer_id`,
  )
    .bind(sinceIso)
    .all();

  const revisitResult = await env.DB.prepare(
    `SELECT a.officer_id AS officerId, COUNT(*) AS reinspectionCount
     FROM audit_events e JOIN assignments a ON a.id=e.assignment_id
     WHERE e.action='inspection-re-inspection' AND e.created_at>=?
     GROUP BY a.officer_id`,
  )
    .bind(sinceIso)
    .all();

  const metricsById = new Map((metricsResult.results || []).map((row) => [row.officerId, row]));
  const revisitById = new Map((revisitResult.results || []).map((row) => [row.officerId, row.reinspectionCount]));

  return (officersResult.results || []).map((officer) => {
    const raw = metricsById.get(officer.officerId) || { totalAssigned: 0, submittedCount: 0, verifiedCount: 0, gpsCount: 0, avgTurnaroundHours: null };
    const metrics = {
      totalAssigned: Number(raw.totalAssigned || 0),
      submittedCount: Number(raw.submittedCount || 0),
      verifiedCount: Number(raw.verifiedCount || 0),
      gpsCount: Number(raw.gpsCount || 0),
      avgTurnaroundHours: raw.avgTurnaroundHours === null || raw.avgTurnaroundHours === undefined ? null : Number(raw.avgTurnaroundHours),
      reinspectionCount: Number(revisitById.get(officer.officerId) || 0),
    };
    const rating = fieldOfficerScore(metrics);
    return {
      id: officer.officerId,
      name: officer.officerName,
      consultantFirm: officer.consultantFirm,
      status: String(officer.status).toLowerCase() === "active" ? "Active" : "Suspended",
      totalAssigned: metrics.totalAssigned,
      submittedCount: metrics.submittedCount,
      verifiedCount: metrics.verifiedCount,
      score: rating?.score ?? null,
      verificationRate: rating?.verificationRate ?? null,
      gpsComplianceRate: rating?.gpsComplianceRate ?? null,
      revisitRate: rating?.revisitRate ?? null,
      avgTurnaroundHours: rating?.avgTurnaroundHours ?? null,
    };
  });
}

// ---------------------------------------------------------------------------
// Consultants (rolled up from their own field officers + their own review speed)
// ---------------------------------------------------------------------------

const CONSULTANT_WEIGHTS = { roster: 0.55, approvalSpeed: 0.25, firmVerification: 0.2 };
const CONSULTANT_APPROVAL_TARGET_HOURS = 24;
const CONSULTANT_APPROVAL_WINDOW_HOURS = 72;

export async function consultantPerformance(env, { sinceDays = 90 } = {}) {
  const sinceIso = since(sinceDays);

  const consultantsResult = await env.DB.prepare(
    `SELECT firm_name AS firmName, status FROM consultants ORDER BY firm_name COLLATE NOCASE`,
  ).all();

  const approvalResult = await env.DB.prepare(
    `SELECT u.consultant_firm AS consultantFirm,
       SUM(CASE WHEN a.approved_at IS NOT NULL THEN 1 ELSE 0 END) AS approvedCount,
       AVG(CASE WHEN a.approved_at IS NOT NULL THEN (julianday(a.approved_at)-julianday(a.submitted_at))*24 END) AS avgApprovalTurnaroundHours,
       SUM(CASE WHEN a.submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submittedCount,
       SUM(CASE WHEN a.status='Verified' THEN 1 ELSE 0 END) AS verifiedCount
     FROM assignments a JOIN users u ON u.id=a.officer_id
     WHERE u.consultant_firm IS NOT NULL AND a.created_at>=?
     GROUP BY u.consultant_firm`,
  )
    .bind(sinceIso)
    .all();

  const approvalByFirm = new Map((approvalResult.results || []).map((row) => [row.consultantFirm, row]));
  const officers = await fieldOfficerPerformance(env, { sinceDays });
  const officersByFirm = new Map();
  for (const officer of officers) {
    if (!officer.consultantFirm) continue;
    if (!officersByFirm.has(officer.consultantFirm)) officersByFirm.set(officer.consultantFirm, []);
    officersByFirm.get(officer.consultantFirm).push(officer);
  }

  return (consultantsResult.results || []).map((consultant) => {
    const firm = consultant.firmName;
    const roster = officersByFirm.get(firm) || [];
    const rated = roster.filter((officer) => officer.score !== null);
    const totalSubmitted = rated.reduce((sum, officer) => sum + officer.submittedCount, 0);
    const rosterScore =
      totalSubmitted > 0
        ? rated.reduce((sum, officer) => sum + officer.score * officer.submittedCount, 0) / totalSubmitted
        : rated.length > 0
          ? rated.reduce((sum, officer) => sum + officer.score, 0) / rated.length
          : null;

    const approval = approvalByFirm.get(firm);
    const approvalTurnaroundHours = approval?.avgApprovalTurnaroundHours ?? null;
    const approvalSpeed = speedScore(approvalTurnaroundHours, CONSULTANT_APPROVAL_TARGET_HOURS, CONSULTANT_APPROVAL_WINDOW_HOURS);
    const firmVerificationRate = approval && Number(approval.submittedCount) > 0 ? Number(approval.verifiedCount) / Number(approval.submittedCount) : null;

    const hasData = rosterScore !== null || approvalSpeed !== null;
    const score = hasData
      ? Math.round(
          clamp(
            CONSULTANT_WEIGHTS.roster * (rosterScore ?? 50) +
              CONSULTANT_WEIGHTS.approvalSpeed * (approvalSpeed ?? 50) +
              CONSULTANT_WEIGHTS.firmVerification * (firmVerificationRate ?? 0.5) * 100,
            0,
            100,
          ),
        )
      : null;

    return {
      firmName: firm,
      status: consultant.status,
      fieldOfficerCount: roster.length,
      score,
      rosterScore: rosterScore === null ? null : Math.round(rosterScore),
      avgApprovalTurnaroundHours: approvalTurnaroundHours === null ? null : round1(approvalTurnaroundHours),
      firmVerificationRate: firmVerificationRate === null ? null : round1(firmVerificationRate * 100),
      fieldOfficers: roster,
    };
  });
}

// ---------------------------------------------------------------------------
// REA staff (individual rea_admin users, scored on their own review turnaround)
// ---------------------------------------------------------------------------

const REA_REVIEW_TARGET_HOURS = 24;
const REA_REVIEW_WINDOW_HOURS = 72;

export async function reaStaffPerformance(env, { sinceDays = 90 } = {}) {
  const sinceIso = since(sinceDays);

  const staffResult = await env.DB.prepare(
    `SELECT id, name, status FROM users WHERE role='rea_admin' ORDER BY name COLLATE NOCASE`,
  ).all();

  const reviewResult = await env.DB.prepare(
    `SELECT e.actor_id AS staffId,
       SUM(CASE WHEN e.action='inspection-verified' THEN 1 ELSE 0 END) AS verifiedReviews,
       SUM(CASE WHEN e.action='inspection-re-inspection' THEN 1 ELSE 0 END) AS reinspectionsSent,
       AVG(CASE WHEN e.action='inspection-verified' THEN (julianday(e.created_at)-julianday(a.approved_at))*24 END) AS avgReviewTurnaroundHours
     FROM audit_events e
     JOIN assignments a ON a.id=e.assignment_id
     JOIN users u ON u.id=e.actor_id AND u.role='rea_admin'
     WHERE e.action IN ('inspection-verified','inspection-re-inspection') AND e.created_at>=?
     GROUP BY e.actor_id`,
  )
    .bind(sinceIso)
    .all();

  const reviewByStaff = new Map((reviewResult.results || []).map((row) => [row.staffId, row]));

  return (staffResult.results || []).map((staff) => {
    const review = reviewByStaff.get(staff.id);
    const verifiedReviews = Number(review?.verifiedReviews || 0);
    const reinspectionsSent = Number(review?.reinspectionsSent || 0);
    const avgReviewTurnaroundHours = review?.avgReviewTurnaroundHours ?? null;
    const speed = speedScore(avgReviewTurnaroundHours, REA_REVIEW_TARGET_HOURS, REA_REVIEW_WINDOW_HOURS);
    const totalActions = verifiedReviews + reinspectionsSent;
    return {
      id: staff.id,
      name: staff.name,
      status: String(staff.status).toLowerCase() === "active" ? "Active" : "Suspended",
      // Score reflects review-turnaround speed only. Re-inspections sent
      // back are shown for context, not scored, since a high or low rate
      // more often reflects upstream submission/consultant quality than
      // this reviewer's own efficiency.
      score: totalActions > 0 ? Math.round(speed ?? 50) : null,
      totalReviewActions: totalActions,
      verifiedReviews,
      reinspectionsSent,
      avgReviewTurnaroundHours: avgReviewTurnaroundHours === null ? null : round1(avgReviewTurnaroundHours),
    };
  });
}
