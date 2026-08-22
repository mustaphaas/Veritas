const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function latestQuestion(messages = []) {
  return [...messages]
    .reverse()
    .find((message) => message && message.role === "user")?.content?.trim() || "";
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function percent(value) {
  return `${Number(value || 0).toLocaleString()}%`;
}

function topRows(rows = [], key, limit = 5) {
  return [...rows]
    .sort((a, b) => Number(b?.[key] || 0) - Number(a?.[key] || 0))
    .slice(0, limit);
}

function demoAnswer(question, ctx = {}) {
  const q = question.toLowerCase();
  const portfolio = ctx.portfolio || {};
  const workflow = ctx.inspectionWorkflow || {};
  const officers = ctx.fieldOfficers || {};
  const programmes = ctx.programmePerformance || [];
  const contractors = ctx.contractorPerformance || [];
  const states = ctx.statePerformance || [];
  const assignments = workflow.assignments || [];
  const schema = ctx.inspectionFormSchema || {};
  const projects = ctx.projects || [];
  const submittedProjects = projects.filter((project) => project.status === "Submitted").length;
  const capacityMw = Number(portfolio.installedCapacityKw || 0) / 1000;

  if (q.includes("field officer") || q.includes("officers")) {
    const active = officers.active ?? 0;
    const total = officers.total ?? 0;
    const assigned = assignments.length;
    return `The current Veritas dataset contains ${number(total)} field officers, including ${number(active)} active officers, with ${number(assigned)} inspection assignments in the shared workflow. Field Officers can view assignments, verify arrival, complete component-specific inspection forms, capture evidence, save drafts and submit reports.`;
  }

  if (q.includes("consultant") || q.includes("approve") || q.includes("qa")) {
    const submitted = (workflow.consultantReviewQueue || []).length;
    const approved = (workflow.approvedForVerification || []).length;
    return `Consultant Admin provides the QA review stage between Field Officer submission and REA verification. There are currently ${number(submitted)} assignment(s) in the consultant review queue and ${number(approved)} assignment(s) approved for REA verification. Consultant Admin can manage field officers and assignments, review submitted reports, approve QA or request re-inspection, and monitor reporting status.`;
  }

  if (q.includes("workflow") || q.includes("process") || q.includes("verification flow")) {
    const steps = ctx.workflowDefinition || [];
    return steps.length
      ? `The Veritas workflow is:\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
      : "The workflow is Field Officer assignment and inspection, report submission, Consultant Admin QA approval or re-inspection, followed by REA verification.";
  }

  const component = Object.keys(schema).find((name) => q.includes(name.toLowerCase()));
  if (component && (q.includes("form") || q.includes("field") || q.includes("section"))) {
    const sections = schema[component] || [];
    return `${component} uses ${number(sections.length)} inspection sections:\n${sections
      .map((section) => `• ${section.section}: ${(section.fields || []).join(", ")}`)
      .join("\n")}`;
  }

  if (q.includes("pending") || q.includes("awaiting verification")) {
    const pendingProjects = portfolio.pendingProjects ?? 0;
    const pendingAssignments = assignments.filter((item) =>
      ["Submitted", "Approved", "Re-inspection"].includes(item.status),
    );
    const statesWithPending = topRows(
      states.map((state) => ({ ...state, pending: state.pending || 0 })),
      "pending",
      5,
    );
    const stateText = statesWithPending
      .filter((state) => state.pending)
      .map((state) => `${state.state} (${state.pending})`)
      .join(", ");
    return `There are ${number(pendingProjects)} portfolio projects awaiting verification. The inspection workflow also has ${number(pendingAssignments.length)} assignment(s) at submitted, approved or re-inspection stages.${stateText ? ` The highest pending state totals are ${stateText}.` : ""}`;
  }

  if (q.includes("verified") || q.includes("verification rate")) {
    return `The current portfolio contains ${number(portfolio.totalProjects)} projects. ${number(portfolio.verifiedProjects)} are verified and ${number(portfolio.pendingProjects)} are awaiting verification, giving a ${percent(portfolio.verificationRatePercent)} verification rate. ${number(submittedProjects)} project reports are in Submitted status.`;
  }

  if (q.includes("programme") || q.includes("program")) {
    if (!programmes.length) return "No programme rows are available in the current dashboard snapshot.";
    const ranked = topRows(programmes, "projects", programmes.length);
    return `Programme performance:\n${ranked
      .map(
        (row) =>
          `• ${row.programme}: ${number(row.projects)} projects, ${(Number(row.installedCapacityKw || 0) / 1000).toFixed(1)} MW, ${number(row.households)} households, ${number(row.verified)} verified and ${number(row.pending)} awaiting verification.`,
      )
      .join("\n")}`;
  }

  if (q.includes("contractor")) {
    const ranked = topRows(contractors, "projects", 6);
    return ranked.length
      ? `Contractor coverage:\n${ranked
          .map(
            (row) =>
              `• ${row.contractor}: ${number(row.projects)} projects, ${number(row.verified)} verified and ${number(row.pending)} awaiting verification.`,
          )
          .join("\n")}`
      : "No contractor performance rows are available in the current dashboard snapshot.";
  }

  if (q.includes("state") || q.includes("location")) {
    const ranked = topRows(states, "projects", 6);
    return ranked.length
      ? `The states with the largest project counts are ${ranked
          .map((row) => `${row.state} (${number(row.projects)})`)
          .join(", ")}. The Nigeria map also contains coordinate-backed sample project markers for presentation drill-downs; those points are explicitly labelled as demo coordinates rather than verified site coordinates.`
      : "No state summary is available in the current dashboard snapshot.";
  }

  if (q.includes("household")) {
    return `The current portfolio reports ${number(portfolio.householdsReached)} households reached across ${number(portfolio.totalProjects)} projects.`;
  }

  if (q.includes("capacity") || q.includes("mw")) {
    return `The current project dataset contains ${capacityMw.toFixed(1)} MW of modelled installed capacity across ${number(portfolio.totalProjects)} projects. The dashboard keeps this as the second KPI and uses the solar-style icon for visual consistency.`;
  }

  if (q.includes("report") || q.includes("insight") || q.includes("summary") || q.includes("management")) {
    return `Veritas management summary:\n• Portfolio: ${number(portfolio.totalProjects)} projects, ${capacityMw.toFixed(1)} MW installed capacity and ${number(portfolio.householdsReached)} households reached.\n• Verification: ${number(portfolio.verifiedProjects)} verified, ${number(portfolio.pendingProjects)} awaiting verification and ${percent(portfolio.verificationRatePercent)} verification rate.\n• Submitted: ${number(submittedProjects)} project reports.\n• Field operations: ${number(workflow.totalAssignments)} assignments and ${number(workflow.submittedReports)} submitted inspection report(s).\n• Field officers: ${number(officers.total)} registered, ${number(officers.active)} active.\n• Workflow: Field Officer inspection → Consultant Admin QA → REA verification.`;
  }

  return `Ask Veritas about any part of the current dashboard data and workflow. The portfolio currently shows ${number(portfolio.totalProjects)} projects, ${capacityMw.toFixed(1)} MW installed capacity, ${number(portfolio.verifiedProjects)} verified, ${number(portfolio.pendingProjects)} awaiting verification, ${number(submittedProjects)} submitted and a ${percent(portfolio.verificationRatePercent)} verification rate. I can compare programmes, states and contractors; explain Field Officer assignments and component inspection forms; review Consultant Admin QA queues; or summarise reports and verification. Try “Which states have the most pending verification?” or “Summarise the consultant QA queue.”`;
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/auth/veritas-session") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(event.request.clone());
          if (response.ok) return response;
        } catch {
          // Frontend fallback below.
        }
        return json({ ok: true, mode: "frontend-demo" });
      })(),
    );
    return;
  }

  if (url.pathname !== "/api/veritas" || event.request.method !== "POST") return;

  event.respondWith(
    (async () => {
      const requestCopy = event.request.clone();
      try {
        const response = await fetch(event.request.clone());
        if (response.ok) return response;
      } catch {
        // Use the presentation-safe frontend responder below.
      }

      try {
        const body = await requestCopy.json();
        const question = latestQuestion(body.messages);
        return json({
          answer: demoAnswer(question, body.databaseContext || {}),
          sources: [],
          mode: "frontend-demo",
        });
      } catch {
        return json(
          {
            answer:
              "Veritas is ready for the dashboard presentation. Ask about projects, programmes, states, contractors, assignments, inspection forms, QA or verification and I’ll answer from the loaded dashboard data.",
            sources: [],
          },
          200,
        );
      }
    })(),
  );
});
