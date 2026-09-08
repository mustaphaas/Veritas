import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { useInspectionWorkflow } from "../lib/inspection-workflow";

export default function FieldOfficerDraftNormalizer() {
  const { session } = useAuth();
  const { assignments, saveReport } = useInspectionWorkflow();

  useEffect(() => {
    if (session?.role !== "field") return;
    const officerName = session.name ?? "Amina Yusuf";

    assignments.forEach((assignment) => {
      if (assignment.officer !== officerName) return;
      if (!assignment.report) return;
      if (["Draft", "Submitted", "Approved", "Verified"].includes(assignment.status)) {
        return;
      }

      saveReport(assignment.id, assignment.report);
    });
  }, [assignments, saveReport, session?.name, session?.role]);

  return null;
}
