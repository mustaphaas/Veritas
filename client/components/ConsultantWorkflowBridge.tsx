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
      ? consultants.find((record) => record.status === "Active") ?? consultants[0]
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

  // The historical demo Consultant Admin and Amina Yusuf belong together.
  const demoOfficer = officers.find(
    (officer) => officer.email.toLowerCase() === "field.officer@demo.ng",
  );
  if (demoOfficer && !getOfficerConsultant(demoOfficer.email)) {
    setOfficerConsultant(demoOfficer.email, consultant.id);
  }
}

function replaceVisibleConsultantName(name: string) {
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const replacements: Text[] = [];
  while (walk.nextNode()) {
    const node = walk.currentNode as Text;
    if (node.nodeValue?.includes("Ibrahim Musa · Consultant Admin")) {
      replacements.push(node);
    }
  }
  for (const node of replacements) {
    node.nodeValue = node.nodeValue!.replace(
      "Ibrahim Musa · Consultant Admin",
      `${name} · Consultant Admin`,
    );
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

    if (currentLooksScoped) {
      masterAssignments = mergeById(masterAssignments, assignments);
      masterOfficers = mergeById(masterOfficers, fieldOfficers);
      writeJson(MASTER_ASSIGNMENTS_KEY, masterAssignments);
      writeJson(MASTER_OFFICERS_KEY, masterOfficers);
    } else {
      // Capture any portfolio-wide changes REA made before this consultant session.
      masterAssignments = mergeById(masterAssignments, assignments);
      masterOfficers = mergeById(masterOfficers, fieldOfficers);
      writeJson(MASTER_ASSIGNMENTS_KEY, masterAssignments);
      writeJson(MASTER_OFFICERS_KEY, masterOfficers);
    }

    seedOwnership(
      consultant,
      allConsultants,
      masterOfficers,
      masterAssignments,
    );

    // Any new officer created while this consultant is signed in belongs to it.
    for (const officer of fieldOfficers) {
      if (!masterOfficers.some((item) => item.id === officer.id)) continue;
      if (!getOfficerConsultant(officer.email) && currentLooksScoped) {
        setOfficerConsultant(officer.email, consultant.id);
      }
    }

    // Any newly assigned project inherits ownership from the selected officer.
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
    const scopedOfficerNames = new Set(scopedOfficers.map((officer) => officer.name));
    const scopedAssignments = masterAssignments.filter(
      (assignment) =>
        ownership.assignmentOwners[assignment.id] === consultant.id ||
        (!ownership.assignmentOwners[assignment.id] &&
          scopedOfficerNames.has(assignment.officer)),
    );

    const signature = JSON.stringify({
      consultant: consultant.id,
      officers: scopedOfficers.map((item) => item.id),
      assignments: scopedAssignments.map((item) => `${item.id}:${item.status}`),
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

    replaceVisibleConsultantName(consultant.adminName);
    const observer = new MutationObserver(() =>
      replaceVisibleConsultantName(consultant.adminName),
    );
    observer.observe(document.body, { childList: true, subtree: true });

    // Keep the existing Assign Project modal design, but hide projects outside
    // the consultant's REA-approved state coverage.
    const filterProjectOptions = () => {
      const selects = Array.from(document.querySelectorAll("select"));
      for (const select of selects) {
        const projectOptions = Array.from(select.options).filter((option) =>
          projects.some((project) => project.name === option.value),
        );
        if (!projectOptions.length) continue;
        for (const option of projectOptions) {
          const project = projects.find((item) => item.name === option.value);
          option.hidden = Boolean(project && !consultant.states.includes(project.state));
          option.disabled = Boolean(project && !consultant.states.includes(project.state));
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
  }, [assignments, consultant, fieldOfficers]);

  return null;
}
