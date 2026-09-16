import assert from "node:assert/strict";
import test from "node:test";
import { fieldOfficerPerformance, consultantPerformance, reaStaffPerformance } from "../worker/performance.js";

// A minimal fake D1 database: matches on a keyword found in the SQL text so
// each test can stub only the queries it cares about, in any order.
function fakeDb(routes) {
  return {
    prepare(sql) {
      const route = routes.find((entry) => sql.includes(entry.match));
      let boundArgs = [];
      return {
        bind(...args) {
          boundArgs = args;
          return this;
        },
        async first() {
          return route ? route.first?.(boundArgs) ?? null : null;
        },
        async all() {
          return { results: route ? route.all?.(boundArgs) ?? [] : [] };
        },
        async run() {
          route?.run?.(boundArgs);
          return { success: true };
        },
      };
    },
  };
}

function makeAuthEnv(sessionUser, extraRoutes = []) {
  return {
    GEMINI_API_KEY: "test-key",
    DB: fakeDb([{ match: "FROM sessions", first: () => sessionUser }, ...extraRoutes]),
  };
}

test("field officer score rewards high verification, on-time speed, GPS compliance and low revisits", async () => {
  const env = {
    DB: fakeDb([
      {
        match: "FROM users u WHERE u.role='field_officer'",
        all: () => [{ officerId: "fo-1", officerName: "Amina Yusuf", consultantFirm: "Supreme Way", status: "active" }],
      },
      {
        match: "FROM assignments WHERE created_at",
        all: () => [
          { officerId: "fo-1", totalAssigned: 10, submittedCount: 10, verifiedCount: 9, gpsCount: 10, avgTurnaroundHours: 20 },
        ],
      },
      { match: "FROM audit_events e JOIN assignments a", all: () => [{ officerId: "fo-1", reinspectionCount: 1 }] },
    ]),
  };
  const [officer] = await fieldOfficerPerformance(env, { sinceDays: 90 });
  assert.equal(officer.id, "fo-1");
  // verification 90%, speed maxed (20h <= 48h target), gps 100%, revisit 10%
  // 0.4*90 + 0.25*100 + 0.2*100 + 0.15*90 = 36+25+20+13.5 = 94.5 -> 95 (rounds)
  assert.equal(officer.score, 95);
  assert.equal(officer.verificationRate, 90);
  assert.equal(officer.gpsComplianceRate, 100);
});

test("field officer with no assignments gets a null score, not zero", async () => {
  const env = {
    DB: fakeDb([
      { match: "FROM users u WHERE u.role='field_officer'", all: () => [{ officerId: "fo-2", officerName: "New Officer", consultantFirm: "Supreme Way", status: "active" }] },
      { match: "FROM assignments WHERE created_at", all: () => [] },
      { match: "FROM audit_events e JOIN assignments a", all: () => [] },
    ]),
  };
  const [officer] = await fieldOfficerPerformance(env, { sinceDays: 90 });
  assert.equal(officer.score, null);
});

test("consultant score rolls up its own field officers plus its own approval speed", async () => {
  const env = {
    DB: fakeDb([
      { match: "FROM consultants", all: () => [{ firmName: "Supreme Way", status: "Active" }] },
      {
        match: "FROM assignments a JOIN users u ON u.id=a.officer_id",
        all: () => [{ consultantFirm: "Supreme Way", approvedCount: 5, avgApprovalTurnaroundHours: 10, submittedCount: 10, verifiedCount: 8 }],
      },
      { match: "FROM users u WHERE u.role='field_officer'", all: () => [{ officerId: "fo-1", officerName: "Amina Yusuf", consultantFirm: "Supreme Way", status: "active" }] },
      { match: "FROM assignments WHERE created_at", all: () => [{ officerId: "fo-1", totalAssigned: 10, submittedCount: 10, verifiedCount: 9, gpsCount: 10, avgTurnaroundHours: 20 }] },
      { match: "FROM audit_events e JOIN assignments a", all: () => [] },
    ]),
  };
  const [consultant] = await consultantPerformance(env, { sinceDays: 90 });
  assert.equal(consultant.firmName, "Supreme Way");
  assert.equal(consultant.fieldOfficerCount, 1);
  assert.ok(consultant.score > 0 && consultant.score <= 100);
  assert.equal(consultant.avgApprovalTurnaroundHours, 10);
});

test("REA staff score reflects review turnaround only, not the volume of re-inspections sent back", async () => {
  const env = {
    DB: fakeDb([
      { match: "FROM users WHERE role='rea_admin'", all: () => [{ id: "rea-1", name: "REA Administrator", status: "active" }] },
      {
        match: "FROM audit_events e",
        all: () => [{ staffId: "rea-1", verifiedReviews: 20, reinspectionsSent: 15, avgReviewTurnaroundHours: 10 }],
      },
    ]),
  };
  const [staff] = await reaStaffPerformance(env, { sinceDays: 90 });
  assert.equal(staff.score, 100); // 10h turnaround is under the 24h target -> full marks
  assert.equal(staff.reinspectionsSent, 15); // shown for context
});

test("an unauthenticated request to /api/rea/performance is rejected with 401", async () => {
  const env = makeAuthEnv(null);
  const { default: worker } = await import(`../worker/index.js?perfauth1=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/rea/performance"), env);
  assert.equal(response.status, 401);
});

test("a consultant_admin cannot reach /api/rea/performance", async () => {
  const env = makeAuthEnv({ id: "u-1", name: "Consultant", role: "consultant_admin", consultantFirm: "Supreme Way" });
  const { default: worker } = await import(`../worker/index.js?perfauth2=${Date.now()}`);
  const response = await worker.fetch(new Request("https://example.com/api/rea/performance"), {
    ...env,
    DB: fakeDb([{ match: "FROM sessions", first: () => ({ id: "u-1", name: "Consultant", role: "consultant_admin", consultantFirm: "Supreme Way" }) }]),
  });
  const requestWithAuth = new Request("https://example.com/api/rea/performance", { headers: { Authorization: "Bearer token" } });
  const response2 = await worker.fetch(requestWithAuth, env);
  assert.equal(response2.status, 403);
  void response;
});

test("a consultant_admin's own consultantFirm is used even if a different one is requested via query param", async () => {
  const sessionUser = { id: "u-1", name: "Consultant", role: "consultant_admin", consultantFirm: "Supreme Way" };
  const env = makeAuthEnv(sessionUser, [
    { match: "FROM consultants", all: () => [{ firmName: "Supreme Way", status: "Active" }, { firmName: "Other Firm", status: "Active" }] },
    { match: "FROM assignments a JOIN users u ON u.id=a.officer_id", all: () => [] },
    { match: "FROM users u WHERE u.role='field_officer'", all: () => [] },
    { match: "FROM assignments WHERE created_at", all: () => [] },
    { match: "FROM audit_events e JOIN assignments a", all: () => [] },
  ]);
  const { default: worker } = await import(`../worker/index.js?perfauth3=${Date.now()}`);
  const response = await worker.fetch(
    new Request("https://example.com/api/consultant/performance?consultantFirm=Other%20Firm", {
      headers: { Authorization: "Bearer token" },
    }),
    env,
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.consultantFirm, "Supreme Way"); // query param ignored for a consultant_admin caller
});

test("a field_officer cannot reach /api/rea/performance or /api/consultant/performance", async () => {
  const sessionUser = { id: "u-2", name: "Officer", role: "field_officer", consultantFirm: null };
  const env = makeAuthEnv(sessionUser);
  const { default: worker } = await import(`../worker/index.js?perfauth4=${Date.now()}`);
  const r1 = await worker.fetch(new Request("https://example.com/api/rea/performance", { headers: { Authorization: "Bearer token" } }), env);
  assert.equal(r1.status, 403);
  const r2 = await worker.fetch(new Request("https://example.com/api/consultant/performance", { headers: { Authorization: "Bearer token" } }), env);
  assert.equal(r2.status, 403);
});
