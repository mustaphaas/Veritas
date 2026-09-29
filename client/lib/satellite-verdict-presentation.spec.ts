import { describe, expect, it } from "vitest";
import { presentVerdict } from "./satellite-verdict-presentation";

describe("presentVerdict", () => {
  it("labels household-scale limits as not verifiable rather than inconclusive", () => {
    expect(presentVerdict({ status: "inconclusive", limitation: { code: "distributed_systems", message: "x" } }).label).toBe(
      "Not verifiable from imagery",
    );
  });
  it("keeps the ordinary labels otherwise", () => {
    expect(presentVerdict({ status: "present" }).label).toBe("Infrastructure detected");
    expect(presentVerdict({ status: "absent" }).label).toBe("No qualifying infrastructure detected");
    expect(presentVerdict({ status: "inconclusive", limitation: { code: "evidence_elsewhere", message: "x" } }).label).toBe("Inconclusive");
  });
});
