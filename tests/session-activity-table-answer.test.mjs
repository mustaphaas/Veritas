import assert from "node:assert/strict";
import test from "node:test";

const activityModule = await import("../worker/session-activity-answer.js").catch(() => ({}));

const context = {
  sessionActivity: {
    perUser: [
      {
        name: "REA Administrator",
        role: "rea_admin",
        consultantFirm: "",
        latestLogin: "2026-09-16T09:30:00.000Z",
        lastAuthenticatedActivity: "2026-09-16T10:31:05.000Z",
        latestObservedDurationSeconds: 3665,
        latestDevice: "Desktop",
        latestBrowser: "Chrome",
        latestOs: "Windows",
        inactivityClassification: "Active session",
      },
      {
        name: "Amina Yusuf",
        role: "field_officer",
        consultantFirm: "Supreme Way Nigeria Limited",
        latestLogin: null,
        lastAuthenticatedActivity: null,
        latestObservedDurationSeconds: null,
        latestDevice: null,
        latestBrowser: null,
        latestOs: null,
        inactivityClassification: "Never recorded",
      },
    ],
  },
};

test("every-user activity request returns a complete reference table", () => {
  const build = activityModule.buildSessionActivityAnswer;
  const result = typeof build === "function"
    ? build("Show every user's latest login, last activity, session duration, device and inactivity classification.", context)
    : null;

  assert.ok(result, "expected a deterministic session-activity response");
  assert.match(result.answer, /1 of 2 registered users has recorded login history/i);
  assert.deepEqual(result.table.columns, [
    "User",
    "Role / Consultant",
    "Latest login (WAT)",
    "Last activity (WAT)",
    "Observed duration",
    "Device",
    "Inactivity",
  ]);
  assert.equal(result.table.rows.length, 2);
  assert.deepEqual(result.table.rows[0], [
    "REA Administrator",
    "REA Administrator — REA",
    "16 Sep 2026, 10:30 WAT",
    "16 Sep 2026, 11:31 WAT",
    "1h 1m",
    "Desktop · Chrome · Windows",
    "Active session",
  ]);
  assert.deepEqual(result.table.rows[1].slice(2), [
    "Not recorded",
    "Not recorded",
    "Not recorded",
    "Not recorded",
    "Never recorded",
  ]);
  assert.match(result.note, /does not prove continuous work/i);
});

test("unrelated questions stay on the normal Veritas response path", () => {
  const build = activityModule.buildSessionActivityAnswer;
  const result = typeof build === "function"
    ? build("Which projects are pending verification?", context)
    : null;
  assert.equal(result, null);
});
