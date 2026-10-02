import { useMemo, useState } from "react";
import { BadgeCheck, ClipboardCheck, Eye, FileDown, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { COMPONENT_FORM_SECTIONS, isSupportedAssignmentComponent } from "../lib/component-inspection-form";
import { useInspectionWorkflow, type InspectionAssignment } from "../lib/inspection-workflow";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function reportValue(assignment: InspectionAssignment, keys: string[]) {
  const values = assignment.report?.componentValues || {};
  for (const key of keys) {
    const value = values[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return "";
}

function capacityLabel(assignment: InspectionAssignment) {
  const raw = reportValue(assignment, ["capacityKw", "installedCapacityKw", "totalCapacityKw", "capacity", "systemCapacityKw"])
    || assignment.report?.capacity
    || "";
  if (!raw) return "—";
  return /kw|mw|kva/i.test(raw) ? raw : `${raw} kW`;
}

function beneficiariesLabel(assignment: InspectionAssignment) {
  return reportValue(assignment, ["beneficiaries", "numberOfBeneficiaries", "householdsReached", "households", "connections"])
    || assignment.report?.beneficiaries
    || "—";
}

function gpsVerified(assignment: InspectionAssignment) {
  return Boolean(assignment.arrival && assignment.arrival.distance <= assignment.geofenceRadius);
}

function verifiedAt(assignment: InspectionAssignment) {
  const event = [...assignment.audit].reverse().find((item) => /verified by rea|rea verified|verified/i.test(item.action));
  return event?.at || assignment.report?.submittedAt || assignment.report?.inspectedAt;
}

function awaitingAt(assignment: InspectionAssignment) {
  const event = [...assignment.audit].reverse().find((item) => /approved|consultant/i.test(item.action));
  return event?.at || assignment.report?.submittedAt || assignment.report?.inspectedAt;
}

function reinspectionAt(assignment: InspectionAssignment) {
  const event = [...assignment.audit].reverse().find((item) => /re-inspection|reinspection|reject/i.test(item.action));
  return event?.at || assignment.report?.submittedAt || assignment.report?.inspectedAt;
}

function reportHtml(assignment: InspectionAssignment, autoPrint = false) {
  const report = assignment.report;
  if (!report) return "";
  const logoUrl = typeof window !== "undefined" ? `${window.location.origin}/rea-brand-mark.svg` : "/rea-brand-mark.svg";
  const supported = isSupportedAssignmentComponent(report.assignedComponent);
  const formSections = supported
    ? COMPONENT_FORM_SECTIONS[report.assignedComponent].map((section, index) => {
        const rows = section.items.flatMap((item) => item.type === "group" ? item.fields : [item]).map((field) => `
          <div class="field"><span>${escapeHtml(field.label)}</span><strong>${escapeHtml(report.componentValues?.[field.key] || "Not provided")}</strong></div>`).join("");
        return `<section><h2>${index + 4}. ${escapeHtml(section.title)}</h2><div class="grid">${rows}</div></section>`;
      }).join("")
    : `<section><h2>4. INSPECTION FORM</h2><p>Component form details are unavailable for this assignment.</p></section>`;

  const evidence = report.evidence.length
    ? report.evidence.map((item, index) => {
        const media = item.previewUrl
          ? item.type === "video"
            ? `<video src="${escapeHtml(item.previewUrl)}" controls></video>`
            : `<img src="${escapeHtml(item.previewUrl)}" alt="Inspection evidence ${index + 1}" />`
          : `<div class="media-placeholder">${escapeHtml(item.name)}</div>`;
        return `<article class="plate">${media}<p><b>Plate ${index + 1}</b> · ${escapeHtml(item.latitude.toFixed(6))}, ${escapeHtml(item.longitude.toFixed(6))} · ${escapeHtml(formatDate(item.capturedAt))}</p><small>Project: ${escapeHtml(item.projectId)} · Inspector: ${escapeHtml(item.inspector)} · Device: ${escapeHtml(item.deviceId)}</small></article>`;
      }).join("")
    : `<p>No photographic evidence was recorded.</p>`;

  const signature = (label:string, value?:string) => {
    if (!value) return `<div class="signature"><div class="signature-box">Not captured</div><b>${escapeHtml(label)}</b></div>`;
    const visual = value.startsWith("data:image") ? `<img src="${escapeHtml(value)}" alt="${escapeHtml(label)} signature" />` : `<div class="signature-name">${escapeHtml(value)}</div>`;
    return `<div class="signature">${visual}<b>${escapeHtml(label)}</b></div>`;
  };

  const qaAudit = [...assignment.audit].reverse().find((event) => /approved|consultant/i.test(event.action));
  const reaAudit = [...assignment.audit].reverse().find((event) => /verified by rea|rea verified|verified/i.test(event.action));
  const generated = new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  const stateLabel = assignment.status === "Verified" ? "VERIFIED" : assignment.status === "Re-inspection" ? "RE-INSPECTION" : "AWAITING REA";

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Inspection Report ${escapeHtml(assignment.id)}</title><style>
    @page{size:A4;margin:13mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#25332d;background:#eef2ef}main{width:210mm;max-width:100%;margin:20px auto;background:#fff;padding:16mm;box-shadow:0 10px 30px #0001}.toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;margin:-16mm -16mm 12mm;padding:10px 16mm;background:#173b2a}.toolbar button{border:0;border-radius:6px;padding:9px 13px;font-weight:700;cursor:pointer}.toolbar .primary{background:#fff;color:#08733f}.header{display:flex;align-items:center;gap:18px;border-bottom:3px solid #08733f;padding-bottom:16px;margin-bottom:20px}.logo{width:78px;height:78px;object-fit:contain}.title h1{margin:0;font-size:23px;letter-spacing:.4px}.title p{margin:4px 0 0;color:#64746c;font-size:12px}.status{margin-left:auto;border:2px solid #08733f;color:#08733f;padding:7px 10px;border-radius:999px;font-size:10px;font-weight:800}section{break-inside:avoid;margin:0 0 18px}h2{font-size:13px;color:#08733f;margin:0 0 9px;padding-bottom:5px;border-bottom:1px solid #dce6df;letter-spacing:.3px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0 22px}.field{display:grid;grid-template-columns:46% 54%;gap:8px;padding:7px 0;border-bottom:1px solid #edf1ee;font-size:10px}.field span{color:#68756f}.field strong{color:#25332d}.notice{padding:10px 12px;background:#edf8f1;border-left:4px solid #08733f;font-size:10px}.plates{display:grid;grid-template-columns:1fr 1fr;gap:14px}.plate{break-inside:avoid}.plate img,.plate video,.media-placeholder{width:100%;height:260px;object-fit:cover;background:#111;border-radius:3px}.media-placeholder{display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px}.plate p{font-size:9px;margin:6px 0 2px}.plate small{font-size:8px;color:#6c7772}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:18px}.signature{font-size:9px}.signature img,.signature-box,.signature-name{height:72px;width:100%;object-fit:contain;border-bottom:1px solid #65736b;display:flex;align-items:flex-end;justify-content:center;padding:8px;font-family:cursive;font-size:18px}.signature b{display:block;margin-top:5px}.footer{margin-top:24px;padding-top:10px;border-top:1px solid #dce6df;font-size:8px;color:#6b756f}.verified-block{border:1px solid #b8dbc5;background:#f2faf5;padding:12px}.verified-block strong{color:#08733f}@media(max-width:700px){main{width:100%;margin:0;padding:18px;box-shadow:none}.toolbar{margin:-18px -18px 20px;padding:10px 18px}.header{align-items:flex-start;flex-wrap:wrap}.status{margin-left:0}.grid,.plates,.signatures{grid-template-columns:1fr}}@media print{body{background:#fff}main{width:auto;margin:0;padding:0;box-shadow:none}.toolbar{display:none}.plate img,.plate video,.media-placeholder{height:245px}}
  </style></head><body><main><div class="toolbar"><button onclick="window.close()">Close</button><button class="primary" onclick="window.print()">Print / Save PDF</button></div>
  <header class="header"><img class="logo" src="${escapeHtml(logoUrl)}" alt="REA logo"><div class="title"><h1>RURAL ELECTRIFICATION AGENCY</h1><p>Field Inspection & Verification Report · Veritas</p></div><div class="status">${stateLabel}</div></header>
  <section><h2>1. PROJECT IDENTIFICATION</h2><div class="grid">
    <div class="field"><span>Project ID</span><strong>${escapeHtml(assignment.id)}</strong></div><div class="field"><span>Inspection date</span><strong>${escapeHtml(formatDate(report.inspectedAt))}</strong></div>
    <div class="field"><span>Project title</span><strong>${escapeHtml(assignment.projectName)}</strong></div><div class="field"><span>Programme</span><strong>${escapeHtml(assignment.programme)}</strong></div>
    <div class="field"><span>Contractor</span><strong>${escapeHtml(report.contractor || assignment.contractor)}</strong></div><div class="field"><span>Project type / component</span><strong>${escapeHtml(report.assignedComponent || assignment.component)}</strong></div>
    <div class="field"><span>State</span><strong>${escapeHtml(assignment.state)}</strong></div><div class="field"><span>LGA</span><strong>${escapeHtml(assignment.lga)}</strong></div>
    <div class="field"><span>Community</span><strong>${escapeHtml(assignment.community)}</strong></div><div class="field"><span>Report status</span><strong>${stateLabel}</strong></div>
  </div></section>
  <section><h2>2. LOCATION VERIFICATION</h2><div class="grid">
    <div class="field"><span>Approved site coordinates</span><strong>${assignment.latitude.toFixed(6)}, ${assignment.longitude.toFixed(6)}</strong></div><div class="field"><span>Captured GPS at arrival</span><strong>${assignment.arrival ? `${assignment.arrival.latitude.toFixed(6)}, ${assignment.arrival.longitude.toFixed(6)}` : `${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`}</strong></div>
    <div class="field"><span>Distance from site centre</span><strong>${assignment.arrival ? `${Math.round(assignment.arrival.distance)} m` : "Not recorded"}</strong></div><div class="field"><span>Approved geofence radius</span><strong>${assignment.geofenceRadius} m</strong></div>
    <div class="field"><span>Geofence result</span><strong>${assignment.arrival && assignment.arrival.distance <= assignment.geofenceRadius ? "VERIFIED — inside approved project area" : "Not verified"}</strong></div><div class="field"><span>Arrival timestamp</span><strong>${escapeHtml(formatDate(assignment.arrival?.at))}</strong></div>
  </div></section>
  <section><h2>3. INSPECTOR & DEVICE</h2><div class="grid"><div class="field"><span>Name</span><strong>${escapeHtml(report.inspector || assignment.officer)}</strong></div><div class="field"><span>Device type</span><strong>${escapeHtml(report.deviceType)}</strong></div><div class="field"><span>Device ID</span><strong>${escapeHtml(report.deviceId)}</strong></div><div class="field"><span>Submitted at</span><strong>${escapeHtml(formatDate(report.submittedAt))}</strong></div></div></section>
  ${formSections}
  <section><h2>PHOTOGRAPHIC / VIDEO EVIDENCE</h2><p class="notice">Evidence captured in Veritas is shown with its project ID, GPS position, timestamp, inspector and device metadata.</p><div class="plates">${evidence}</div></section>
  <section><h2>ATTESTATIONS</h2><div class="signatures">${signature("Community Representative", report.communitySignature)}${signature("Contractor Representative", report.contractorSignature)}</div><div class="field" style="margin-top:12px"><span>Inspecting officer</span><strong>${escapeHtml(report.inspector || assignment.officer)}</strong></div></section>
  <section><h2>QUALITY ASSURANCE</h2><div class="grid"><div class="field"><span>Consultant outcome</span><strong>${assignment.status === "Submitted" ? "Awaiting Consultant QA" : assignment.status === "Re-inspection" ? "Re-inspection requested" : "Approved"}</strong></div><div class="field"><span>Reviewed at</span><strong>${escapeHtml(formatDate(qaAudit?.at))}</strong></div><div class="field"><span>Reviewed by</span><strong>${escapeHtml(qaAudit?.actor || "Consultant Admin")}</strong></div><div class="field"><span>Notes</span><strong>${escapeHtml(report.reviewNote || "—")}</strong></div></div></section>
  <section class="verified-block"><h2>REA FINAL VERIFICATION</h2><div class="grid"><div class="field"><span>REA status</span><strong>${stateLabel}</strong></div><div class="field"><span>Verified at</span><strong>${assignment.status === "Verified" ? escapeHtml(formatDate(reaAudit?.at)) : "Pending REA decision"}</strong></div><div class="field"><span>Verified by</span><strong>${assignment.status === "Verified" ? escapeHtml(reaAudit?.actor || "REA Admin") : "—"}</strong></div><div class="field"><span>Audit events</span><strong>${assignment.audit.length}</strong></div></div></section>
  <footer class="footer">Report ${escapeHtml(assignment.id)} · Captured ${escapeHtml(formatDate(report.inspectedAt))} · Generated ${escapeHtml(generated)} · Every workflow action remains recorded in the Veritas audit trail.</footer>
  </main>${autoPrint ? `<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script>` : ""}</body></html>`;
}

function openReport(assignment: InspectionAssignment, print = false) {
  if (!assignment.report) {
    window.alert("No inspection report is attached to this record yet.");
    return;
  }
  try {
    const html = reportHtml(assignment, print);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const popup = window.open(url, "_blank");
    if (!popup) {
      URL.revokeObjectURL(url);
      window.alert("Please allow pop-ups to view the inspection report.");
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    console.error("Unable to open REA inspection report", error);
    window.alert("The inspection report could not be opened. Please refresh and try again.");
  }
}

type VerificationTab = "awaiting" | "verified" | "reinspection";

export default function ReaVerificationManagement(){
  const {assignments,reaReviewReport}=useInspectionWorkflow();
  const [tab,setTab]=useState<VerificationTab>("awaiting");
  const [,refresh]=useState(0);
  const awaiting=useMemo(()=>assignments.filter((item)=>item.status==="Approved"),[assignments]);
  const verified=useMemo(()=>assignments.filter((item)=>item.status==="Verified"),[assignments]);
  const reinspection=useMemo(()=>assignments.filter((item)=>item.status==="Re-inspection"),[assignments]);
  const rows=tab==="awaiting"?awaiting:tab==="verified"?verified:reinspection;
  const decide=(id:string,decision:"Verified"|"Re-inspection")=>{
    const note=window.prompt(decision==="Verified"?"Optional REA verification note":"Reason for rejection / re-inspection (required)",decision==="Verified"?"Verified by REA after consultant QA approval.":"");
    if(note===null||decision==="Re-inspection"&&!note.trim())return;
    reaReviewReport(id,decision,note);
  };

  const heading = tab === "awaiting" ? "Awaiting REA" : tab === "verified" ? "Verified inspection reports" : "Re-inspection reports";
  const dateHeading = tab === "verified" ? "Verified" : "Returned";
  const rowDate = (item: InspectionAssignment) => tab === "verified" ? verifiedAt(item) : reinspectionAt(item);

  return (
    <section className="veritas-module-shell veritas-verification-module veritas-verification-modern rea-v-workspace">
      <div className="rea-v-shell">
        <header className="veritas-page-header rea-v-heading rea-v-heading-modern">
          <div className="rea-v-heading-copy">
            <div className="rea-v-title-row">
              <span className="rea-v-title-icon" aria-hidden="true"><ShieldCheck /></span>
              <div>
                <p className="rea-v-kicker">REA final verification</p>
                <h2>Verification</h2>
              </div>
            </div>
            <p>
              Review consultant-approved field inspection reports, confirm compliant records,
              and return exceptions for re-inspection with a complete audit trail.
            </p>
          </div>

          <div className="rea-v-flow-panel" aria-label="Verification workflow">
            <p>Verification chain</p>
            <div className="rea-v-flow">
              <span>Field Officer</span>
              <b aria-hidden="true">→</b>
              <span>Consultant QA</span>
              <b aria-hidden="true">→</b>
              <span className="rea-v-flow-active">REA Review</span>
              <b aria-hidden="true">→</b>
              <span>Decision</span>
            </div>
          </div>
        </header>

        <section className="rea-v-summary veritas-verification-summary" aria-label="Verification status summary">
          <article className="rea-v-summary-card rea-v-summary-awaiting">
            <span className="rea-v-icon"><ClipboardCheck aria-hidden="true"/></span>
            <div className="rea-v-summary-copy">
              <small>Awaiting REA</small>
              <strong>{awaiting.length}</strong>
              <p>Consultant-approved reports ready for final review</p>
            </div>
          </article>

          <article className="rea-v-summary-card rea-v-summary-verified">
            <span className="rea-v-icon"><BadgeCheck aria-hidden="true"/></span>
            <div className="rea-v-summary-copy">
              <small>Verified</small>
              <strong>{verified.length}</strong>
              <p>Reports cleared through REA final verification</p>
            </div>
          </article>

          <article className="rea-v-summary-card rea-v-summary-reinspection">
            <span className="rea-v-icon rea-v-icon-warn"><RotateCcw aria-hidden="true"/></span>
            <div className="rea-v-summary-copy">
              <small>Re-inspection</small>
              <strong>{reinspection.length}</strong>
              <p>Reports returned for corrective field action</p>
            </div>
          </article>
        </section>

        <section className="rea-v-register">
          <div className="rea-v-register-bar">
            <div>
              <p className="rea-v-register-kicker">Verification register</p>
              <h3>{heading}</h3>
              <p>{rows.length} report{rows.length===1?"":"s"} in this classification</p>
            </div>

            <div className="rea-v-register-actions">
              <div className="rea-v-tabs veritas-segmented-tabs" role="tablist" aria-label="Verification registers">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab==="awaiting"}
                  onClick={()=>setTab("awaiting")}
                  className={tab==="awaiting"?"is-active":""}
                >
                  Awaiting REA <span>{awaiting.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab==="verified"}
                  onClick={()=>setTab("verified")}
                  className={tab==="verified"?"is-active":""}
                >
                  Verified <span>{verified.length}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab==="reinspection"}
                  onClick={()=>setTab("reinspection")}
                  className={tab==="reinspection"?"is-active is-warning":""}
                >
                  Re-inspection <span>{reinspection.length}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={()=>refresh((value)=>value+1)}
                className="rea-v-refresh"
                aria-label="Refresh verification register"
              >
                <RefreshCw aria-hidden="true" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="rea-v-table-wrap veritas-data-panel">
            <div className="rea-v-table-scroll">
              {tab === "awaiting" ? (
                <table className="rea-v-table veritas-data-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Location</th>
                      <th>Contractor</th>
                      <th>Capacity</th>
                      <th>Beneficiaries</th>
                      <th>GPS</th>
                      <th>Awaiting since</th>
                      <th>Review actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaiting.length ? awaiting.map((item)=>(
                      <tr key={item.id}>
                        <td className="min-w-[205px]">
                          <strong>{item.id}</strong>
                          <small>{item.projectName}</small>
                        </td>
                        <td className="min-w-[180px]">{item.community}, {item.lga}, {item.state}</td>
                        <td className="min-w-[155px]">{item.report?.contractor || item.contractor}</td>
                        <td><strong>{capacityLabel(item)}</strong></td>
                        <td><strong>{beneficiariesLabel(item)}</strong></td>
                        <td>
                          <span className={`rea-v-gps-status ${gpsVerified(item)?"is-verified":"is-unverified"}`}>
                            <span aria-hidden="true" />
                            {gpsVerified(item)?"Verified":"Not verified"}
                          </span>
                        </td>
                        <td className="min-w-[150px]">{formatDate(awaitingAt(item))}</td>
                        <td className="min-w-[245px]">
                          <div className="rea-v-action-stack">
                            <div className="rea-v-action-row">
                              <button type="button" onClick={()=>openReport(item)} className="rea-v-action-button rea-v-action-secondary">
                                <Eye aria-hidden="true"/>View report
                              </button>
                              <button type="button" onClick={()=>openReport(item,true)} className="rea-v-action-button rea-v-action-secondary">
                                <FileDown aria-hidden="true"/>PDF
                              </button>
                            </div>
                            <div className="rea-v-action-row">
                              <button type="button" onClick={()=>decide(item.id,"Verified")} className="rea-v-action-button rea-v-action-primary">
                                <BadgeCheck aria-hidden="true"/>Verify
                              </button>
                              <button type="button" onClick={()=>decide(item.id,"Re-inspection")} className="rea-v-action-button rea-v-action-warning">
                                <RotateCcw aria-hidden="true"/>Re-inspect
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={8} className="rea-v-empty">No reports are currently awaiting REA verification.</td></tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="rea-v-table veritas-data-table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Location</th>
                      <th>Contractor</th>
                      <th>Capacity</th>
                      <th>Beneficiaries</th>
                      <th>GPS</th>
                      <th>{dateHeading}</th>
                      <th>Report</th>
                      {tab==="reinspection"&&<th>Reason</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length ? rows.map((item)=>(
                      <tr key={item.id}>
                        <td className="min-w-[205px]">
                          <strong>{item.id}</strong>
                          <small>{item.projectName}</small>
                        </td>
                        <td className="min-w-[180px]">{item.community}, {item.lga}, {item.state}</td>
                        <td className="min-w-[155px]">{item.report?.contractor || item.contractor}</td>
                        <td><strong>{capacityLabel(item)}</strong></td>
                        <td><strong>{beneficiariesLabel(item)}</strong></td>
                        <td>
                          <span className={`rea-v-gps-status ${gpsVerified(item)?"is-verified":"is-unverified"}`}>
                            <span aria-hidden="true" />
                            {gpsVerified(item)?"Verified":"Not verified"}
                          </span>
                        </td>
                        <td className="min-w-[150px]">{formatDate(rowDate(item))}</td>
                        <td>
                          <div className="rea-v-action-row rea-v-action-row-compact">
                            <button type="button" onClick={()=>openReport(item)} className="rea-v-action-button rea-v-action-secondary">
                              <Eye aria-hidden="true"/>View
                            </button>
                            <button type="button" onClick={()=>openReport(item,true)} className="rea-v-action-button rea-v-action-primary">
                              <FileDown aria-hidden="true"/>PDF
                            </button>
                          </div>
                        </td>
                        {tab==="reinspection"&&(
                          <td className="min-w-[220px]">
                            <small className="rea-v-note">{item.report?.reviewNote || "Re-inspection requested"}</small>
                          </td>
                        )}
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={tab==="reinspection"?9:8} className="rea-v-empty">
                          No {tab==="verified"?"verified reports are available":"re-inspection reports are available"}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        <aside className="rea-v-assurance">
          <span aria-hidden="true"><ShieldCheck /></span>
          <div>
            <strong>Audit assurance</strong>
            <p>REA verification decisions, review notes and re-inspection actions remain recorded in the Veritas audit trail.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}}
