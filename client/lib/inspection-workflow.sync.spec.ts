// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import {
  createComponentFormValues,
  isSupportedAssignmentComponent,
} from "./component-inspection-form";
import {
  InspectionWorkflowProvider,
  getDeviceId,
  getDeviceType,
  useInspectionWorkflow,
  type InspectionAssignment,
  type InspectionReport,
} from "./inspection-workflow";

function setNavigatorOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

function buildDraftReport(assignment: InspectionAssignment): InspectionReport {
  if (!isSupportedAssignmentComponent(assignment.component)) {
    throw new Error("Test fixture assignment has an unsupported component.");
  }
  return {
    assignmentId: assignment.id,
    assignedComponent: assignment.component,
    componentValues: createComponentFormValues(
      assignment.component,
      assignment,
    ),
    projectId: assignment.id,
    contractor: assignment.contractor,
    state: assignment.state,
    lga: assignment.lga,
    community: assignment.community,
    inspectedAt: new Date().toISOString(),
    latitude: assignment.latitude,
    longitude: assignment.longitude,
    inspector: assignment.officer,
    deviceId: getDeviceId(),
    deviceType: getDeviceType(),
    assetCode: "",
    evidence: [],
  };
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(InspectionWorkflowProvider, { children });

describe("offline sync scoping", () => {
  beforeEach(() => {
    window.localStorage.clear();
    setNavigatorOnline(false);
  });

  afterEach(() => {
    setNavigatorOnline(true);
  });

  it("queues a report while offline and only syncs the assignment that was asked for", () => {
    const { result } = renderHook(() => useInspectionWorkflow(), { wrapper });

    const [first, second] = result.current.assignments.filter(
      (assignment) =>
        assignment.officer === "Amina Yusuf" &&
        assignment.status === "Assigned",
    );
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    // Arrive on-site (required before a draft can be edited) and save a
    // draft for both assignments while offline.
    act(() => {
      result.current.verifyArrival(first.id, first.latitude, first.longitude);
      result.current.verifyArrival(
        second.id,
        second.latitude,
        second.longitude,
      );
    });
    act(() => {
      result.current.saveReport(first.id, buildDraftReport(first));
      result.current.saveReport(second.id, buildDraftReport(second));
    });

    const queuedFirst = result.current.assignments.find(
      (assignment) => assignment.id === first.id,
    );
    const queuedSecond = result.current.assignments.find(
      (assignment) => assignment.id === second.id,
    );
    expect(queuedFirst?.syncStatus).toBe("queued");
    expect(queuedSecond?.syncStatus).toBe("queued");

    // Sync only the first record - this is what the Sync Queue's animated
    // "complete this upload" step calls per item.
    act(() => {
      result.current.syncAssignment(first.id);
    });

    const afterSyncFirst = result.current.assignments.find(
      (assignment) => assignment.id === first.id,
    );
    const afterSyncSecond = result.current.assignments.find(
      (assignment) => assignment.id === second.id,
    );
    expect(afterSyncFirst?.syncStatus).toBe("synced");
    // The second assignment must remain untouched - this is the behavior
    // that the old blanket syncNow() got wrong (it marked every assignment
    // in the system as synced, not just the one the officer finished).
    expect(afterSyncSecond?.syncStatus).toBe("queued");
  });

  it("syncNow, by contrast, marks every queued assignment as synced", () => {
    const { result } = renderHook(() => useInspectionWorkflow(), { wrapper });

    const [first, second] = result.current.assignments.filter(
      (assignment) =>
        assignment.officer === "Amina Yusuf" &&
        assignment.status === "Assigned",
    );

    act(() => {
      result.current.verifyArrival(first.id, first.latitude, first.longitude);
      result.current.verifyArrival(
        second.id,
        second.latitude,
        second.longitude,
      );
    });
    act(() => {
      result.current.saveReport(first.id, buildDraftReport(first));
      result.current.saveReport(second.id, buildDraftReport(second));
    });

    act(() => {
      setNavigatorOnline(true);
    });
    act(() => {
      result.current.syncNow();
    });

    const assignments = result.current.assignments;
    expect(
      assignments.find((assignment) => assignment.id === first.id)
        ?.syncStatus,
    ).toBe("synced");
    expect(
      assignments.find((assignment) => assignment.id === second.id)
        ?.syncStatus,
    ).toBe("synced");
  });
});
