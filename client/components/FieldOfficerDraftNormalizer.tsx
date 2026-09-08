import { useEffect, useRef } from "react";
import { useAuth } from "../lib/auth";
import {
  useInspectionWorkflow,
  type InspectionAssignment,
  type InspectionReport,
} from "../lib/inspection-workflow";

export function shouldNormalizeFieldDraft(
  assignment: InspectionAssignment,
  officerName: string,
  attemptedReports: ReadonlyMap<string, InspectionReport>,
) {
  return (
    assignment.officer === officerName &&
    Boolean(assignment.report) &&
    !["Draft", "Submitted", "Approved", "Verified"].includes(
      assignment.status,
    ) &&
    attemptedReports.get(assignment.id) !== assignment.report
  );
}

export default function FieldOfficerDraftNormalizer() {
  const { session } = useAuth();
  const { assignments, saveReport } = useInspectionWorkflow();
  const attemptedReports = useRef(new Map<string, InspectionReport>());

  useEffect(() => {
    if (session?.role !== "field") return;
    const officerName = session.name ?? "Amina Yusuf";

    assignments.forEach((assignment) => {
      if (
        !shouldNormalizeFieldDraft(
          assignment,
          officerName,
          attemptedReports.current,
        )
      ) {
        if (["Draft", "Submitted", "Approved", "Verified"].includes(assignment.status)) {
          attemptedReports.current.delete(assignment.id);
        }
        return;
      }

      attemptedReports.current.set(assignment.id, assignment.report!);
      saveReport(assignment.id, assignment.report);
    });
  }, [assignments, saveReport, session?.name, session?.role]);

  return null;
}
