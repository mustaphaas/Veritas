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

  if (q.includes("mini grid") && (q.includes("deployed") || q.includes("176"))) {
    return "For this presentation, the NEP headline metric is 176 mini grids deployed across Nigeria. This figure is presented as an impact KPI alongside the Veritas portfolio and verification indicators.";
  }

  if (q.includes("field officer") || q.includes("officers")) {
    const active = officers.active ?? 0;
    const total = officers.total ?? 0;
    const assigned = assignments.length;
    return `The demo contains ${number(total)} field officers, including ${number(active)} active officers, with ${number(assigned)} inspection assignments in the shared workflow. Field Officers can view assignments, verify arrival, complete component-specific inspection forms, capture evidence, save drafts and submit reports.`;
  }

  if (q.includes("consultant") || q.includes("approve") || q.includes("qa")) {
    const submitted = (workflow.consultantReviewQueue || []).length;
    const approved = (workflow.approvedForVerification || []).length;
    return `Consultant Admin provides the QA review stage between Field Officer submission and REA verification. In the current demo, ${number(submitted)} assignment(s) are in the consultant review queue and ${number(approved)} assignment(s) are approved for REA verification. The Consultant Admin can manage field officers and assignments, review submitted reports, approve QA or request re-inspection, and monitor reporting status.`;
  }

  if (q.includes("workflow") || q.includes("process") || q.includes("verification flow")) {
    const steps = ctx.workflowDefinition || [];
    return steps.length
      ? `The Veritas demo workflow is:\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
      : "The workflow is Field Officer assignment and inspection, report submission, Consultant Admin QA approval or re-inspection, followed by REA verification.";
  }

  const component = Object.keys(schema).find((name) => q.includes(name.toLowerCase()));
  if (component && (q.includes("form") || q.includes("field") || q.includes("section"))) {
    const sections = schema[component] || [];
    return `${component} uses ${number(sections.length)} inspection sections in the demo:\n${sections
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
    return `There are ${number(pendingProjects)} portfolio projects pending verification. The inspection workflow also has ${number(pendingAssignments.length)} assignment(s) at submitted, approved or re-inspection stages.${stateText ? ` The highest pending state totals are ${stateText}.` : ""}`;
  }

  if (q.includes("verified") || q.includes("verification rate")) {
    return `The filtered demo portfolio contains ${number(portfolio.totalProjects)} projects. ${number(portfolio.verifiedProjects)} are verified and ${number(portfolio.pendingProjects)} are pending, giving a verification rate of ${percent(portfolio.verificationRatePercent)}.`;
  }

  if (q.includes("programme") || q.includes("program")) {
    if (!programmes.length) return "No programme rows are available in the current demo snapshot.";
    const ranked = topRows(programmes, "projects", programmes.length);
    return `Programme performance in the demo:\n${ranked
      .map(
        (row) =>
          `• ${row.programme}: ${number(row.projects)} projects, ${(Number(row.installedCapacityKw || 0) / 1000).toFixed(1)} MW, ${number(row.households)} households, ${number(row.verified)} verified and ${number(row.pending)} pending.`,
      )
      .join("\n")}`;
  }

  if (q.includes("contractor")) {
    const ranked = topRows(contractors, "projects", 6);
    return ranked.length
      ? `Top contractor coverage in the demo:\n${ranked
          .map(
            (row) =>
              `• ${row.contractor}: ${number(row.projects)} projects, ${number(row.verified)} verified, ${number(row.pending)} pending.`,
          )
          .join("\n")}`
      : "No contractor performance rows are available in the current demo snapshot.";
  }

  if (q.includes("state") || q.includes("location")) {
    const ranked = topRows(states, "projects", 6);
    return ranked.length
      ? `The states with the largest project counts in the current demo are ${ranked
          .map((row) => `${row.state} (${number(row.projects)})`)
          .join(", ")}. You can also ask Veritas for pending verification, capacity or household reach by state.`
      : "No state summary is available in the current demo snapshot.";
  }

  if (q.includes("household")) {
    return `The current demo portfolio reports ${number(portfolio.householdsReached)} households reached across ${number(portfolio.totalProjects)} projects.`;
  }

  if (q.includes("capacity") || q.includes("mw")) {
    return `The underlying demo project dataset contains ${(Number(portfolio.installedCapacityKw || 0) / 1000).toFixed(1)} MW of modelled installed capacity. For the dashboard presentation KPI, the second card now follows the NEP public impact metric and displays 176 mini grids deployed across Nigeria.`;
  }

  if (q.includes("report") || q.includes("insight") || q.includes("summary") || q.includes("management")) {
    return `Veritas demo management summary:\n• Portfolio: ${number(portfolio.totalProjects)} projects and ${number(portfolio.householdsReached)} households reached.\n• Verification: ${number(portfolio.verifiedProjects)} verified, ${number(portfolio.pendingProjects)} pending, ${percent(portfolio.verificationRatePercent)} verification rate.\n• Field operations: ${number(workflow.totalAssignments)} assignments and ${number(workflow.submittedReports)} submitted report(s).\n• Field officers: ${number(officers.total)} registered, ${number(officers.active)} active.\n• Workflow: Field Officer inspection → Consultant Admin QA → REA verification.\n• Public NEP presentation metric: 176 mini grids deployed across Nigeria.`;
  }

  return `I can answer questions from the Veritas frontend demo about the REA portfolio, programmes, states, contractors, Field Officers, assignments, component inspection forms, Consultant Admin QA, reports and verification. Current headline figures include ${number(portfolio.totalProjects)} projects, ${number(portfolio.verifiedProjects)} verified, ${number(portfolio.pendingProjects)} pending and a ${percent(portfolio.verificationRatePercent)} verification rate. You can ask a more specific question about any of those areas.`;
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
          // Frontend demo fallback below.
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
          { answer: "Veritas frontend demo is available, but this question could not be parsed. Please try again.", sources: [] },
          200,
        );
      }
    })(),
  );
});
