import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getAssignmentDisplayStatus, useInspectionWorkflow } from "../lib/inspection-workflow";

const KPI_LABELS = [
  "Assigned Projects",
  "Inspections Due",
  "Approved",
  "Draft Reports",
  "Sync Pending",
] as const;

export default function FieldOfficerKpiDataBridge() {
  const location = useLocation();
  const { session } = useAuth();
  const { assignments } = useInspectionWorkflow();

  const counts = useMemo(() => {
    const officerName = session?.name ?? "Amina Yusuf";
    const mine = assignments.filter((item) => item.officer === officerName);

    const assigned = mine.filter((item) => {
      const status = getAssignmentDisplayStatus(item.status);
      return status === "Assigned" || status === "Draft";
    }).length;

    const due = mine.filter(
      (item) => !["Submitted", "Approved", "Verified"].includes(item.status),
    ).length;

    const approved = mine.filter((item) => item.status === "Approved").length;
    const drafts = mine.filter(
      (item) => getAssignmentDisplayStatus(item.status) === "Draft",
    ).length;
    const syncPending = mine.filter((item) => item.syncStatus === "queued").length;

    return {
      "Assigned Projects": assigned,
      "Inspections Due": due,
      Approved: approved,
      "Draft Reports": drafts,
      "Sync Pending": syncPending,
    } as Record<(typeof KPI_LABELS)[number], number>;
  }, [assignments, session?.name]);

  useEffect(() => {
    if (!location.pathname.startsWith("/field-officer")) return;

    let observer: MutationObserver | null = null;

    const applyCounts = () => {
      let updated = 0;
      const labels = Array.from(document.querySelectorAll("p"));

      KPI_LABELS.forEach((label) => {
        const labelNode = labels.find((node) => node.textContent?.trim() === label);
        const card = labelNode?.closest("article");
        if (!card) return;

        const valueNode = Array.from(card.querySelectorAll("p")).find(
          (node) => node !== labelNode && /^\d+$/.test(node.textContent?.trim() ?? ""),
        );
        if (!valueNode) return;

        const nextValue = String(counts[label]);
        if (valueNode.textContent !== nextValue) valueNode.textContent = nextValue;
        updated += 1;
      });

      return updated === KPI_LABELS.length;
    };

    if (!applyCounts()) {
      observer = new MutationObserver(() => {
        if (applyCounts()) observer?.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => observer?.disconnect();
  }, [counts, location.pathname]);

  return null;
}
