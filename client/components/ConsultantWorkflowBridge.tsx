import { useEffect, useMemo } from "react";
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
  officerOwnerKey,
  readConsultantOwnership,
  replaceConsultantOwnership,
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

  const current = readConsultantOwnership();
  const activeConsultants = allConsultants.filter((record) => record.status === "Active");
  const activeIds = new Set(activeConsultants.map((record) => record.id));
  const next = {
    officerOwners: Object.fromEntries(Object.entries(current.officerOwners).filter(([, owner]) => activeIds.has(owner))),
    assignmentOwners: Object.fromEntries(Object.entries(current.assignmentOwners).filter(([, owner]) => activeIds.has(owner))),
    projectOwners: Object.fromEntries(Object.entries(current.projectOwners).filter(([, owner]) => activeIds.has(owner))),
  };
  if (demoOfficer) next.officerOwners[officerOwnerKey(demoOfficer.email)] = defaultConsultant.id;
  for (const project of projects) {
    const eligible = activeConsultants.filter((record) => record.states.includes(project.state));
    const existing = next.projectOwners[project.name];
    if (existing && eligible.some((record) => record.id === existing)) continue;
    if (eligible.length === 1) next.projectOwners[project.name] = eligible[0].id;
    else delete next.projectOwners[project.name];
  }
  for (const assignment of assignments) {
    const projectOwner = next.projectOwners[assignment.projectName];
    if (projectOwner) { next.assignmentOwners[assignment.id] = projectOwner; continue; }
    if (next.assignmentOwners[assignment.id]) continue;
  }
  for (const officer of officers) {
    const key = officerOwnerKey(officer.email);
    if (next.officerOwners[key]) continue;
    const owners = new Set(assignments.filter((assignment) => assignment.officer === officer.name).map((assignment) => next.assignmentOwners[assignment.id]).filter(Boolean));
    if (owners.size === 1) next.officerOwners[key] = [...owners][0];
  }
  for (const assignment of assignments) {
    if (next.assignmentOwners[assignment.id]) continue;
    const matchingOfficers = officers.filter((officer) => officer.name === assignment.officer);
    if (matchingOfficers.length !== 1) continue;
    const owner = next.officerOwners[officerOwnerKey(matchingOfficers[0].email)];
    if (owner) next.assignmentOwners[assignment.id] = owner;
  }
  replaceConsultantOwnership(next);
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

function removeContractorPerformance() {
  const heading = Array.from(document.querySelectorAll("h2")).find(
    (node) => node.textContent?.trim() === "Contractor Performance",
  );
  heading?.closest("section")?.remove();
}

function applyUi(
  consultant: ConsultantRecord,
) {
  replaceVisibleConsultantIdentity(consultant);
  removeContractorPerformance();
}

export default function ConsultantWorkflowBridge() {
  const { session } = useAuth();
  const { assignments, fieldOfficers } = useInspectionWorkflow();
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
        writeJson(MASTER_ASSIGNMENTS_KEY, mergeById(masterAssignments, assignments));
        writeJson(MASTER_OFFICERS_KEY, mergeById(masterOfficers, fieldOfficers));
        return;
      }
      if (JSON.stringify(assignments) !== JSON.stringify(masterAssignments)) {
        fireStorage(ASSIGNMENTS_STORAGE_KEY, masterAssignments);
      }
      if (JSON.stringify(fieldOfficers) !== JSON.stringify(masterOfficers)) {
        fireStorage(FIELD_OFFICERS_STORAGE_KEY, masterOfficers);
      }
      return;
    }

    const allConsultants = readConsultants();
    let masterAssignments = mergeById(
      readJson<InspectionAssignment[]>(MASTER_ASSIGNMENTS_KEY, assignments),
      assignments,
    );
    let masterOfficers = mergeById(
      readJson<FieldOfficerAccount[]>(MASTER_OFFICERS_KEY, fieldOfficers),
      fieldOfficers,
    );
    writeJson(MASTER_ASSIGNMENTS_KEY, masterAssignments);
    writeJson(MASTER_OFFICERS_KEY, masterOfficers);
    seedOwnership(consultant, allConsultants, masterOfficers, masterAssignments);

    if (JSON.stringify(assignments) !== JSON.stringify(masterAssignments)) {
      fireStorage(ASSIGNMENTS_STORAGE_KEY, masterAssignments);
    }
    if (JSON.stringify(fieldOfficers) !== JSON.stringify(masterOfficers)) {
      fireStorage(FIELD_OFFICERS_STORAGE_KEY, masterOfficers);
    }

    const enhance = () => applyUi(consultant);
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
    };
  }, [assignments, consultant, fieldOfficers, session?.email, session?.role]);

  return null;
}
