import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { getAssignmentDisplayStatus, useInspectionWorkflow } from "../lib/inspection-workflow";
import { FIELD_SYNC_PENDING_EVENT, FIELD_SYNC_PENDING_KEY } from "./FieldOfficerSyncPendingBridge";

const KPI_LABELS = [
  "Assigned Projects",
  "Inspections Due",
  "Approved",
  "Draft Reports",
  "Sync Pending",
] as const;

function initialSharedSyncPending() {
  if (typeof window === "undefined") return 4;
  const stored = Number(localStorage.getItem(FIELD_SYNC_PENDING_KEY));
  return Number.isFinite(stored) && stored >= 0 ? stored : 4;
}

export default function FieldOfficerKpiDataBridge() {
  const location = useLocation();
  const { session } = useAuth();
  const { assignments } = useInspectionWorkflow();
  const [sharedSyncPending, setSharedSyncPending] = useState(initialSharedSyncPending);

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
    const workflowSyncPending = mine.filter((item) => item.syncStatus === "queued").length;

    return {
      "Assigned Projects": assigned,
      "Inspections Due": due,
      Approved: approved,
      "Draft Reports": drafts,
      "Sync Pending": workflowSyncPending > 0 ? workflowSyncPending : sharedSyncPending,
    } as Record<(typeof KPI_LABELS)[number], number>;
  }, [assignments, session?.name, sharedSyncPending]);

  useEffect(() => {
    const onSharedSyncPending = (event: Event) => {
      const count = Number((event as CustomEvent<number>).detail);
      if (Number.isFinite(count) && count >= 0) setSharedSyncPending(count);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== FIELD_SYNC_PENDING_KEY) return;
      const count = Number(event.newValue);
      if (Number.isFinite(count) && count >= 0) setSharedSyncPending(count);
    };

    window.addEventListener(FIELD_SYNC_PENDING_EVENT, onSharedSyncPending as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(FIELD_SYNC_PENDING_EVENT, onSharedSyncPending as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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
