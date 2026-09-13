import { describe, expect, it } from "vitest";
import * as analytics from "./analytics.js";
import { compileAnalyticsPlan, validateAnalyticsPlan } from "./analytics.js";

describe("Veritas user analytics", () => {
  it("translates the REA Staff label into the database classification", () => {
    const plan = validateAnalyticsPlan({
      mode: "analytics",
      dataset: "users",
      dimensions: [],
      measures: ["userCount"],
      filters: [{ field: "role", op: "eq", value: "REA Staff" }],
      limit: 100,
    });

    expect(plan).not.toBeNull();
    expect(plan!.filters).toEqual([
      { field: "classification", op: "eq", value: "REA Staff" },
    ]);
    expect(compileAnalyticsPlan(plan!)).toEqual({
      sql: `SELECT COUNT(*) AS "userCount" FROM users u WHERE CASE WHEN u.role LIKE 'rea_%' THEN 'REA Staff' WHEN u.role='consultant_admin' THEN 'Consultant Admin' WHEN u.role='field_officer' THEN 'Field Officer' ELSE 'Other' END = ? LIMIT 100`,
      params: ["REA Staff"],
    });
  });

  it("builds an exact plan for a direct REA staff count question", () => {
    const plan = (analytics as typeof analytics & {
      deterministicAnalyticsPlan: (question: string) => unknown;
    }).deterministicAnalyticsPlan("How many REA staff are on the platform?");

    expect(plan).toEqual({
      dataset: "users",
      dimensions: [],
      measures: ["userCount"],
      filters: [{ field: "classification", op: "eq", value: "REA Staff" }],
      orderBy: [],
      limit: 100,
    });
  });
});
