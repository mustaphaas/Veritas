import type { Project } from "./dashboard-data";
import type {
  FieldOfficerAccount,
  InspectionAssignment,
} from "./inspection-workflow";

export type ConsultantOwnership = {
  officerOwners: Record<string, string>;
  assignmentOwners: Record<string, string>;
  projectOwners: Record<string, string>;
};

const STORAGE_KEY = "veritas-consultant-ownership-v1";
const EVENT_NAME = "veritas-consultant-ownership-updated";

const emptyOwnership = (): ConsultantOwnership => ({
  officerOwners: {},
  assignmentOwners: {},
  projectOwners: {},
});

export function readConsultantOwnership(): ConsultantOwnership {
  if (typeof window === "undefined") return emptyOwnership();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyOwnership();
    const parsed = JSON.parse(raw) as Partial<ConsultantOwnership>;
    return {
      officerOwners:
        parsed.officerOwners && typeof parsed.officerOwners === "object"
          ? parsed.officerOwners
          : {},
      assignmentOwners:
        parsed.assignmentOwners && typeof parsed.assignmentOwners === "object"
          ? parsed.assignmentOwners
          : {},
      projectOwners:
        parsed.projectOwners && typeof parsed.projectOwners === "object"
          ? parsed.projectOwners
          : {},
    };
  } catch {
    return emptyOwnership();
  }
}

function writeOwnership(next: ConsultantOwnership) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function replaceConsultantOwnership(next: ConsultantOwnership) {
  const current = readConsultantOwnership();
  if (JSON.stringify(current) !== JSON.stringify(next)) writeOwnership(next);
}

export function officerOwnerKey(email: string) {
  return email.trim().toLowerCase();
}

export function setOfficerConsultant(email: string, consultantId: string) {
  const current = readConsultantOwnership();
  writeOwnership({
    ...current,
    officerOwners: {
      ...current.officerOwners,
      [officerOwnerKey(email)]: consultantId,
    },
  });
}

export function setAssignmentConsultant(
  assignmentId: string,
  consultantId: string,
) {
  const current = readConsultantOwnership();
  writeOwnership({
    ...current,
    assignmentOwners: {
      ...current.assignmentOwners,
      [assignmentId]: consultantId,
    },
  });
}

export function setProjectConsultant(projectName: string, consultantId: string) {
  const current = readConsultantOwnership();
  writeOwnership({
    ...current,
    projectOwners: {
      ...current.projectOwners,
      [projectName]: consultantId,
    },
  });
}

export function getOfficerConsultant(email: string) {
  return readConsultantOwnership().officerOwners[officerOwnerKey(email)] ?? null;
}

export function getAssignmentConsultant(assignmentId: string) {
  return readConsultantOwnership().assignmentOwners[assignmentId] ?? null;
}

export function getProjectConsultant(projectName: string) {
  return readConsultantOwnership().projectOwners[projectName] ?? null;
}

export function assignmentBelongsToConsultant(
  assignment: InspectionAssignment,
  consultantId: string,
  officers: FieldOfficerAccount[],
  ownership: ConsultantOwnership,
) {
  const explicitOwner = ownership.assignmentOwners[assignment.id];
  if (explicitOwner) return explicitOwner === consultantId;
  const matchingOfficers = officers.filter(
    (officer) => officer.name === assignment.officer,
  );
  if (matchingOfficers.length !== 1) return false;
  return (
    ownership.officerOwners[officerOwnerKey(matchingOfficers[0].email)] ===
    consultantId
  );
}

export function isConsultantVisibleAssignment(
  assignment: InspectionAssignment,
) {
  if (assignment.status === "Draft") return false;
  return !(
    assignment.status === "Submitted" && assignment.syncStatus === "queued"
  );
}

export function selectConsultantScope(
  consultantId: string,
  officers: FieldOfficerAccount[],
  assignments: InspectionAssignment[],
  allProjects: Project[],
  ownership: ConsultantOwnership,
) {
  const fieldOfficers = officers.filter(
    (officer) =>
      ownership.officerOwners[officerOwnerKey(officer.email)] === consultantId,
  );
  const ownedAssignments = assignments.filter((assignment) =>
    assignmentBelongsToConsultant(
      assignment,
      consultantId,
      officers,
      ownership,
    ),
  );
  const visibleAssignments = ownedAssignments.filter(
    isConsultantVisibleAssignment,
  );
  const projects = allProjects.filter(
    (project) => ownership.projectOwners[project.name] === consultantId,
  );
  const allocatedProjectNames = new Set(
    assignments.map((assignment) => assignment.projectName),
  );
  const unallocatedProjects = projects.filter(
    (project) => !allocatedProjectNames.has(project.name),
  );
  return {
    fieldOfficers,
    ownedAssignments,
    visibleAssignments,
    projects,
    unallocatedProjects,
  };
}

export function subscribeConsultantOwnership(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const storageListener = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener(EVENT_NAME, listener);
  window.addEventListener("storage", storageListener);
  return () => {
    window.removeEventListener(EVENT_NAME, listener);
    window.removeEventListener("storage", storageListener);
  };
}

export function ensureDefaultConsultantOwnership(
  consultantId: string,
  officerEmails: string[],
) {
  const current = readConsultantOwnership();
  let changed = false;
  const officerOwners = { ...current.officerOwners };
  for (const email of officerEmails) {
    const key = officerOwnerKey(email);
    if (!officerOwners[key]) {
      officerOwners[key] = consultantId;
      changed = true;
    }
  }
  if (changed) writeOwnership({ ...current, officerOwners });
}
