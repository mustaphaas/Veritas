(() => {
  const STORAGE_KEY = "rea-inspection-workflow-v4";
  const WORKSPACE_ID = "rea-verification-workspace";

  function readAssignments() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function writeAssignments(assignments) {
    const oldValue = window.localStorage.getItem(STORAGE_KEY);
    const newValue = JSON.stringify(assignments);
    window.localStorage.setItem(STORAGE_KEY, newValue);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        oldValue,
        newValue,
        storageArea: window.localStorage,
        url: window.location.href,
      }),
    );
    window.dispatchEvent(new CustomEvent("veritas:workflow-updated"));
  }

  function auditEvent(action) {
    return {
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      at: new Date().toISOString(),
      actor: "REA Administrator",
      action,
      deviceId: "REA-WEB-DEVICE",
      deviceType: "Desktop computer",
    };
  }

  function updateAssignment(id, decision, note) {
    const assignments = readAssignments();
    const next = assignments.map((assignment) => {
      if (assignment.id !== id || assignment.status !== "Approved") return assignment;

      if (decision === "Verified") {
        return {
          ...assignment,
          status: "Verified",
          report: assignment.report
            ? {
                ...assignment.report,
                reviewNote:
                  note.trim() ||
                  assignment.report.reviewNote ||
                  "Verified by REA after consultant QA approval.",
              }
            : assignment.report,
          audit: [
            ...(assignment.audit || []),
            auditEvent("Report verified by REA after consultant QA approval"),
          ],
        };
      }

      return {
        ...assignment,
        status: "Re-inspection",
        arrival: undefined,
        routeStartedAt: undefined,
        report: assignment.report
          ? {
              ...assignment.report,
              reviewNote:
                note.trim() ||
                "REA rejected the verification submission and requested re-inspection.",
            }
          : assignment.report,
        audit: [
          ...(assignment.audit || []),
          auditEvent("REA rejected verification and returned the assignment for re-inspection"),
        ],
      };
    });
    writeAssignments(next);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function statusBadge(status) {
    const label = status === "Approved" ? "Awaiting REA" : status;
    return `<span class="rea-v-status rea-v-status-${String(status).toLowerCase().replace(/[^a-z]+/g, "-")}">${escapeHtml(label)}</span>`;
  }

  function summary(assignments) {
    return {
      approved: assignments.filter((item) => item.status === "Approved").length,
      submitted: assignments.filter((item) => item.status === "Submitted").length,
      verified: assignments.filter((item) => item.status === "Verified").length,
      reinspection: assignments.filter((item) => item.status === "Re-inspection").length,
    };
  }

  function activeRows(assignments) {
    return assignments
      .filter((item) => ["Submitted", "Approved", "Verified", "Re-inspection"].includes(item.status))
      .sort((a, b) => {
        const rank = { Approved: 0, Submitted: 1, "Re-inspection": 2, Verified: 3 };
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      });
  }

  function buildWorkspace() {
    let workspace = document.getElementById(WORKSPACE_ID);
    if (workspace) return workspace;

    const main = document.querySelector("main");
    const header = main?.querySelector(":scope > header");
    if (!main || !header) return null;

    workspace = document.createElement("section");
    workspace.id = WORKSPACE_ID;
    workspace.className = "rea-v-workspace";
    workspace.hidden = true;
    header.insertAdjacentElement("afterend", workspace);
    return workspace;
  }

  function renderWorkspace() {
    const workspace = buildWorkspace();
    if (!workspace) return;
    const assignments = readAssignments();
    const counts = summary(assignments);
    const rows = activeRows(assignments);

    workspace.innerHTML = `
      <div class="rea-v-shell">
        <div class="rea-v-heading">
          <div>
            <p class="rea-v-kicker">REA final verification</p>
            <h2>Verification Queue</h2>
            <p>Field Officer submission → Consultant Admin QA → REA approval or rejection. Only Consultant-approved reports can be verified by REA.</p>
          </div>
          <div class="rea-v-flow" aria-label="Verification workflow">
            <span>Field Officer</span><b>→</b><span>Consultant Admin</span><b>→</b><span class="rea-v-flow-active">REA</span><b>→</b><span>Verified</span>
          </div>
        </div>

        <div class="rea-v-summary">
          <article><span class="rea-v-icon">✓</span><strong>${counts.approved}</strong><small>Awaiting REA</small></article>
          <article><span class="rea-v-icon">↗</span><strong>${counts.submitted}</strong><small>With Consultant QA</small></article>
          <article><span class="rea-v-icon">●</span><strong>${counts.verified}</strong><small>Verified</small></article>
          <article><span class="rea-v-icon rea-v-icon-warn">↺</span><strong>${counts.reinspection}</strong><small>Re-inspection</small></article>
        </div>

        <div class="rea-v-table-wrap">
          <div class="rea-v-table-head">
            <div>
              <h3>Inspection reports</h3>
              <p>${rows.length} workflow records visible</p>
            </div>
            <button type="button" data-rea-refresh>Refresh queue</button>
          </div>
          <div class="rea-v-table-scroll">
            <table class="rea-v-table">
              <thead><tr><th>Project</th><th>Officer</th><th>Consultant stage</th><th>Location</th><th>Evidence</th><th>REA decision</th></tr></thead>
              <tbody>
                ${rows.length ? rows.map((item) => {
                  const actionable = item.status === "Approved";
                  const evidence = item.report?.evidence?.length ?? 0;
                  return `<tr>
                    <td><strong>${escapeHtml(item.projectName)}</strong><small>${escapeHtml(item.id)} · ${escapeHtml(item.programme)} · ${escapeHtml(item.component)}</small></td>
                    <td>${escapeHtml(item.officer)}</td>
                    <td>${statusBadge(item.status)}${item.report?.reviewNote ? `<small class="rea-v-note">${escapeHtml(item.report.reviewNote)}</small>` : ""}</td>
                    <td>${escapeHtml(item.community)}, ${escapeHtml(item.state)}</td>
                    <td><strong>${evidence}</strong> file${evidence === 1 ? "" : "s"}</td>
                    <td>
                      ${actionable ? `<div class="rea-v-actions">
                        <button type="button" class="rea-v-approve" data-rea-decision="Verified" data-assignment-id="${escapeHtml(item.id)}">Approve & Verify</button>
                        <button type="button" class="rea-v-reject" data-rea-decision="Re-inspection" data-assignment-id="${escapeHtml(item.id)}">Reject</button>
                      </div>` : `<span class="rea-v-readonly">${item.status === "Submitted" ? "Waiting for Consultant Admin" : item.status === "Verified" ? "Finalised" : "Returned to Field Officer"}</span>`}
                    </td>
                  </tr>`;
                }).join("") : `<tr><td colspan="6" class="rea-v-empty">No submitted, approved, verified or re-inspection records are available.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  function setVerificationView(open) {
    const workspace = buildWorkspace();
    const main = document.querySelector("main");
    const body = main?.querySelector(":scope > div.mx-auto");
    if (!workspace || !body) return;
    workspace.hidden = !open;
    body.hidden = open;
    if (open) renderWorkspace();
  }

  function isVerificationButton(button) {
    return button?.textContent?.trim() === "Verification";
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const navButton = target?.closest("nav button");
    if (navButton) {
      setVerificationView(isVerificationButton(navButton));
      return;
    }

    const refresh = target?.closest("[data-rea-refresh]");
    if (refresh) {
      renderWorkspace();
      return;
    }

    const decision = target?.closest("[data-rea-decision]");
    if (!decision) return;
    const id = decision.getAttribute("data-assignment-id");
    const nextStatus = decision.getAttribute("data-rea-decision");
    if (!id || !nextStatus) return;

    if (nextStatus === "Verified") {
      const note = window.prompt(
        "Optional REA verification note",
        "Verified by REA after consultant QA approval.",
      );
      if (note === null) return;
      updateAssignment(id, "Verified", note);
    } else {
      const note = window.prompt(
        "Reason for rejection / re-inspection (required)",
        "",
      );
      if (!note?.trim()) return;
      updateAssignment(id, "Re-inspection", note);
    }
    renderWorkspace();
  });

  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) renderWorkspace();
  });
  window.addEventListener("veritas:workflow-updated", renderWorkspace);

  const observer = new MutationObserver(() => buildWorkspace());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      buildWorkspace();
      renderWorkspace();
    }, { once: true });
  } else {
    buildWorkspace();
    renderWorkspace();
  }
})();
