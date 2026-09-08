export type ConsultantOwnership = {
  officerOwners: Record<string, string>;
  assignmentOwners: Record<string, string>;
};

const STORAGE_KEY = "veritas-consultant-ownership-v1";
const EVENT_NAME = "veritas-consultant-ownership-updated";

const emptyOwnership = (): ConsultantOwnership => ({
  officerOwners: {},
  assignmentOwners: {},
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

export function getOfficerConsultant(email: string) {
  return readConsultantOwnership().officerOwners[officerOwnerKey(email)] ?? null;
}

export function getAssignmentConsultant(assignmentId: string) {
  return readConsultantOwnership().assignmentOwners[assignmentId] ?? null;
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
