import { describe, expect, it } from "vitest";
import { createComponentTestAssignments } from "../lib/inspection-workflow";
import { shouldNormalizeFieldDraft } from "./FieldOfficerDraftNormalizer";

describe("field officer draft normalization", () => {
  it("attempts a stale report only once when the workflow rejects the update", () => {
    const stale = {
      ...createComponentTestAssignments().find(
        (assignment) => assignment.status === "Draft",
      )!,
      status: "Assigned" as const,
    };
    const attempted = new Map();

    expect(shouldNormalizeFieldDraft(stale, "Amina Yusuf", attempted)).toBe(
      true,
    );
    attempted.set(stale.id, stale.report!);
    expect(shouldNormalizeFieldDraft(stale, "Amina Yusuf", attempted)).toBe(
      false,
    );
  });
});
