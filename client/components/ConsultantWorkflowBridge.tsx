import { useEffect, useMemo, useRef } from "react";
import { projects } from "../lib/dashboard-data";
import { useAuth } from "../lib/auth";
import { readConsultants, type ConsultantRecord } from "../lib/consultants";
import {
  FIELD_OFFICERS_STORAGE_KEY,
  useInspectionWorkflow,
  type FieldOfficerAccount,
  type InspectionAssignment,
} from "../lib/inspection-workflow";
import {
  getAssignmentConsultant,
  getOfficerConsultant,
  readConsultantOwnership,
  setAssignmentConsultant,
  setOfficerConsultant,
} from "../lib/consultant-tenancy";

const ASSIGNMENTS_STORAGE_KEY = "rea-inspection-workflow-v4";
const MASTER_ASSIGNMENTS_KEY = "veritas-master-inspection-workflow-v1";
const MASTER_OFFICERS_KEY = "veritas-master-field-officers-v1";
const DEFAULT_CONSULTANT_ID = "con-001";
const DEMO_FIELD_OFFICER_EMAIL = "field.officer@demo.ng";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function mergeById<T extends { id: string }>(master: T[], scoped: T[]) {
  const next = new Map(master.map((item) => [item.id, item]));
  for (const item of scoped) next.set(item.id, item);
  return Array.from(next.values());
}

function fireStorage(key: string, value: unknown) {
  const serialized = JSON.stringify(value);
  window.localStorage.setItem(key, serialized);
  window.dispatchEvent(
    new StorageEvent("storage", {
      key,
      newValue: serialized,
      storageArea: window.localStorage,
    }),
  );
}

function resolveConsultant(email: string): ConsultantRecord | null {
  const consultants = readConsultants();
  const normalized = email.trim().toLowerCase();
  return (
    consultants.find(
      (record) => record.adminEmail.trim().toLowerCase() === normalized,
    ) ??
    (normalized === "consultant.admin@demo.ng"
      ? consultants.find((record) => record.id === DEFAULT_CONSULTANT_ID) ??
        consultants.find((record) => record.status === "Active") ??
        consultants[0]
      : null) ??
    null
  );
}

function seedOwnership(
  consultant: ConsultantRecord,
  allConsultants: ConsultantRecord[],
  officers: FieldOfficerAccount[],
  assignments: InspectionAssignment[],
) {
  const defaultConsultant =
    allConsultants.find((record) => record.id === DEFAULT_CONSULTANT_ID) ??
    consultant;
  const demoOfficer = officers.find(
    (officer) => officer.email.toLowerCase() === DEMO_FIELD_OFFICER_EMAIL,
  );

  if (demoOfficer) {
    setOfficerConsultant(demoOfficer.email, defaultConsultant.id);
    for (const assignment of assignments) {
      if (assignment.officer === demoOfficer.name) {
        setAssignmentConsultant(assignment.id, defaultConsultant.id);
      }
    }
  }

  for (const assignment of assignments) {
    if (getAssignmentConsultant(assignment.id)) continue;
    const owner =
      allConsultants.find(
        (record) =>
          record.status === "Active" && record.states.includes(assignment.state),
      ) ?? null;
    if (owner) setAssignmentConsultant(assignment.id, owner.id);
  }

  for (const officer of officers) {
    if (getOfficerConsultant(officer.email)) continue;
    const officerAssignments = assignments.filter(
      (assignment) => assignment.officer === officer.name,
    );
    const ownerId = officerAssignments
      .map((assignment) => getAssignmentConsultant(assignment.id))
      .find(Boolean);
    if (ownerId) setOfficerConsultant(officer.email, ownerId);
  }
}

function replaceVisibleConsultantIdentity(consultant: ConsultantRecord) {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const replacements: Text[] = [];
  while (walk.nextNode()) {
    const node = walk.currentNode as Text;
    const value = node.nodeValue ?? "";
    if (
      value.includes("Ibrahim Musa · Consultant Admin") ||
      value.includes("Consultant Admin Dashboard") ||
      value.includes(
        "Assign field work, review inspection evidence and monitor programme assurance.",
      )
    ) {
      replacements.push(node);
    }
  }

  for (const node of replacements) {
    let value = node.nodeValue ?? "";
    value = value.replace(
      "Ibrahim Musa · Consultant Admin",
      `${consultant.adminName} · Consultant Admin`,
    );
    value = value.replace("Consultant Admin Dashboard", consultant.firmName);
    value = value.replace(
      "Assign field work, review inspection evidence and monitor programme assurance.",
      `Welcome to ${consultant.firmName}. Manage your field officers, assigned projects and inspection assurance.`,
    );
    node.nodeValue = value;
  }
}

export default function ConsultantWorkflowBridge() {
  const { session } = useAuth();
  const { assignments, fieldOfficers } = useInspectionWorkflow();
  const lastApplied = useRef("");
  const consultant = useMemo(
    () =>
      session?.role === "consultant" ? resolveConsultant(session.email) : null,
    [session?.email, session?.role],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.localStorage.getItem(MASTER_ASSIGNMENTS_KEY)) {
      writeJson(MASTER_ASSIGNMENTS_KEY, assignments);
    }
    if (!window.localStorage.getItem(MASTER_OFFICERS_KEY)) {
      writeJson(MASTER_OFFICERS_KEY, fieldOfficers);
    }

    if (!consultant) {
      const masterAssignments = readJson<InspectionAssignment[]>(
        MASTER_ASSIGNMENTS_KEY,
        assignments,
      );
      const masterOfficers = readJson<FieldOfficerAccount[]>(
        MASTER_OFFICERS_KEY,
        fieldOfficers,
      );

      if (session?.role === "field") {
        const nextAssignments = mergeById(masterAssignments, assignments);
        const nextOfficers = mergeById(masterOfficers, fieldOfficers);
        writeJson(MASTER_ASSIGNMENTS_KEY, nextAssignments);
        writeJson(MASTER_OFFICERS_KEY, nextOfficers);
        lastApplied.current = "";
        return;
      }

      if (JSON.stringify(assignments) !== JSON.stringify(masterAssignments)) {
        fireStorage(ASSIGNMENTS_STORAGE_KEY, masterAssignments);
      }
      if (JSON.stringify(fieldOfficers) !== JSON.stringify(masterOfficers)) {
        fireStorage(FIELD_OFFICERS_STORAGE_KEY, masterOfficers);
      }
      lastApplied.current = "";
      return;
    }

    const allConsultants = readConsultants();
    let masterAssignments = readJson<InspectionAssignment[]>(
      MASTER_ASSIGNMENTS_KEY,
      assignments,
    );
    let masterOfficers = readJson<FieldOfficerAccount[]>(
      MASTER_OFFICERS_KEY,
      fieldOfficers,
    );

    const currentLooksScoped =
      fieldOfficers.every(
        (officer) => getOfficerConsultant(officer.email) === consultant.id,
      ) &&
      assignments.every(
        (assignment) => getAssignmentConsultant(assignment.id) === consultant.id,
      );

    masterAssignments = mergeById(masterAssignments, assignments);
    masterOfficers = mergeById(masterOfficers, fieldOfficers);
    writeJson(MASTER_ASSIGNMENTS_KEY, masterAssignments);
    writeJson(MASTER_OFFICERS_KEY, masterOfficers);

    seedOwnership(
      consultant,
      allConsultants,
      masterOfficers,
      masterAssignments,
    );

    for (const officer of fieldOfficers) {
      if (!masterOfficers.some((item) => item.id === officer.id)) continue;
      if (!getOfficerConsultant(officer.email) && currentLooksScoped) {
        setOfficerConsultant(officer.email, consultant.id);
      }
    }

    for (const assignment of assignments) {
      if (getAssignmentConsultant(assignment.id)) continue;
      const officer = fieldOfficers.find(
        (item) => item.name === assignment.officer,
      );
      const owner = officer ? getOfficerConsultant(officer.email) : null;
      if (owner) setAssignmentConsultant(assignment.id, owner);
    }

    const ownership = readConsultantOwnership();
    const scopedOfficers = masterOfficers.filter(
      (officer) =>
        ownership.officerOwners[officer.email.trim().toLowerCase()] ===
        consultant.id,
    );
    const scopedOfficerNames = new Set(
      scopedOfficers.map((officer) => officer.name),
    );
    const scopedAssignments = masterAssignments.filter((assignment) => {
      const belongsToConsultant =
        ownership.assignmentOwners[assignment.id] === consultant.id ||
        (!ownership.assignmentOwners[assignment.id] &&
          scopedOfficerNames.has(assignment.officer));
      if (!belongsToConsultant) return false;

      // Drafts are private working copies belonging only to the field officer.
      // They must never appear in the consultant workspace until submitted.
      if (assignment.status === "Draft") return false;

      // Offline submissions stay only in the Field Officer Sync queue until
      // upload completes. Once syncNow marks them synced, they immediately
      // become available to Consultant Admin for QA review.
      if (assignment.status === "Submitted" && assignment.syncStatus === "queued") {
        return false;
      }
      return true;
    });

    const signature = JSON.stringify({
      consultant: consultant.id,
      officers: scopedOfficers.map((item) => item.id),
      assignments: scopedAssignments.map(
        (item) => `${item.id}:${item.status}:${item.syncStatus}`,
      ),
    });
    if (lastApplied.current !== signature) {
      lastApplied.current = signature;
      if (JSON.stringify(fieldOfficers) !== JSON.stringify(scopedOfficers)) {
        fireStorage(FIELD_OFFICERS_STORAGE_KEY, scopedOfficers);
      }
      if (JSON.stringify(assignments) !== JSON.stringify(scopedAssignments)) {
        fireStorage(ASSIGNMENTS_STORAGE_KEY, scopedAssignments);
      }
    }

    replaceVisibleConsultantIdentity(consultant);
    const observer = new MutationObserver(() =>
      replaceVisibleConsultantIdentity(consultant),
    );
    observer.observe(document.body, { childList: true, subtree: true });

    const filterProjectOptions = () => {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const select of selects) {
        const projectOptions = Array.from(select.options).filter((option) =>
          projects.some((project) => project.name === option.value),
        );
        if (!projectOptions.length) continue;
        for (const option of projectOptions) {
          const project = projects.find((item) => item.name === option.value);
          option.hidden = Boolean(
            project && !consultant.states.includes(project.state),
          );
          option.disabled = Boolean(
            project && !consultant.states.includes(project.state),
          );
        }
        const selectedProject = projects.find(
          (project) => project.name === select.value,
        );
        if (selectedProject && !consultant.states.includes(selectedProject.state)) {
          const firstAllowed = projectOptions.find((option) => !option.disabled);
          if (firstAllowed) {
            select.value = firstAllowed.value;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }
    };
    filterProjectOptions();
    const modalObserver = new MutationObserver(filterProjectOptions);
    modalObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      modalObserver.disconnect();
    };
  }, [assignments, consultant, fieldOfficers, session?.role]);

  return null;
}
