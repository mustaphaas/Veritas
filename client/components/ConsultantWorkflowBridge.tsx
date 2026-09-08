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
const UNASSIGNED_PANEL_ID = "veritas-consultant-unassigned-projects";

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
    const ownerId = assignments
      .filter((assignment) => assignment.officer === officer.name)
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

function removeContractorPerformance() {
  const heading = Array.from(document.querySelectorAll("h2")).find(
    (node) => node.textContent?.trim() === "Contractor Performance",
  );
  heading?.closest("section")?.remove();
}

function fixConsultantStatusLabels(assignments: InspectionAssignment[]) {
  for (const assignment of assignments) {
    if (assignment.status === "Draft") continue;
    const nodes = Array.from(document.querySelectorAll("button, div"));
    const container = nodes.find((node) =>
      node.textContent?.includes(assignment.projectName),
    );
    if (!container) continue;
    for (const span of Array.from(container.querySelectorAll("span"))) {
      if (span.textContent?.trim() === "Draft") {
        span.textContent = assignment.status;
      }
    }
  }
}

function enhanceMap(assignments: InspectionAssignment[]) {
  const iframe = document.querySelector<HTMLIFrameElement>(
    'iframe[title="Consultant project map"]',
  );
  if (!iframe || !assignments.length) return;

  const selectedButton = Array.from(document.querySelectorAll("button")).find(
    (button) =>
      button.className.includes("border-[#8bcba0]") &&
      assignments.some((assignment) =>
        button.textContent?.includes(assignment.projectName),
      ),
  );
  const selected =
    assignments.find((assignment) =>
      selectedButton?.textContent?.includes(assignment.projectName),
    ) ?? assignments[0];

  if (
    Number.isFinite(selected.latitude) &&
    Number.isFinite(selected.longitude)
  ) {
    const mapUrl = `https://maps.google.com/maps?q=${selected.latitude},${selected.longitude}&z=16&output=embed`;
    if (iframe.getAttribute("src") !== mapUrl) iframe.setAttribute("src", mapUrl);
    iframe.style.border = "0";
  }

  const label = Array.from(document.querySelectorAll("p")).find(
    (node) => node.textContent?.trim() === "Filtered assignments",
  );
  if (label) label.textContent = "Assigned to field officers";
}

function renderUnassignedProjects(
  consultant: ConsultantRecord,
  masterAssignments: InspectionAssignment[],
) {
  const mapSection = Array.from(document.querySelectorAll("h2"))
    .find((node) => node.textContent?.trim() === "Interactive Project Map")
    ?.closest("section");
  const existing = document.getElementById(UNASSIGNED_PANEL_ID);
  if (!mapSection) {
    existing?.remove();
    return;
  }

  const assignedNames = new Set(masterAssignments.map((item) => item.projectName));
  const unassigned = projects
    .filter(
      (project) =>
        consultant.states.includes(project.state) &&
        !assignedNames.has(project.name),
    )
    .slice(0, 12);
  const signature = unassigned.map((item) => item.name).join("|");

  let panel = existing;
  if (!panel) {
    panel = document.createElement("section");
    panel.id = UNASSIGNED_PANEL_ID;
    panel.className = "mt-3 rounded-lg border border-slate-200 bg-white";
    mapSection.insertAdjacentElement("afterend", panel);
  }
  if (panel.dataset.signature === signature) return;
  panel.dataset.signature = signature;
  panel.innerHTML = `
    <div class="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
      <div>
        <h2 class="text-sm font-bold text-[#173b2a]">REA Assigned · Awaiting Field Officer</h2>
        <p class="mt-1 text-[10px] text-slate-500">Projects allocated to ${consultant.firmName} by REA but not yet assigned to a field officer.</p>
      </div>
      <span class="rounded-full bg-[#fff7df] px-2.5 py-1 text-[9px] font-bold text-[#9a6800]">${unassigned.length}</span>
    </div>
    <div class="divide-y divide-slate-100">
      ${
        unassigned.length
          ? unassigned
              .map(
                (project) => `
          <div class="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p class="text-xs font-bold text-[#173b2a]">${project.name}</p>
              <p class="mt-1 text-[9px] text-slate-500">${project.programme} · ${project.component} · ${project.state}</p>
            </div>
            <span class="rounded-full border border-[#f0d88d] bg-[#fff8e5] px-2.5 py-1 text-[9px] font-bold text-[#956300]">Not assigned</span>
          </div>`,
              )
              .join("")
          : '<p class="p-6 text-center text-xs text-slate-500">All REA-assigned projects have been allocated to field officers.</p>'
      }
    </div>`;
}

function applyUi(
  consultant: ConsultantRecord,
  scopedAssignments: InspectionAssignment[],
  masterAssignments: InspectionAssignment[],
) {
  replaceVisibleConsultantIdentity(consultant);
  removeContractorPerformance();
  fixConsultantStatusLabels(scopedAssignments);
  enhanceMap(scopedAssignments);
  renderUnassignedProjects(consultant, masterAssignments);
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
        writeJson(MASTER_ASSIGNMENTS_KEY, mergeById(masterAssignments, assignments));
        writeJson(MASTER_OFFICERS_KEY, mergeById(masterOfficers, fieldOfficers));
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

    const ownership = readConsultantOwnership();
    const scopedOfficers = masterOfficers.filter(
      (officer) =>
        ownership.officerOwners[officer.email.trim().toLowerCase()] === consultant.id,
    );
    const scopedOfficerNames = new Set(scopedOfficers.map((officer) => officer.name));
    const scopedAssignments = masterAssignments.filter((assignment) => {
      const belongs =
        ownership.assignmentOwners[assignment.id] === consultant.id ||
        (!ownership.assignmentOwners[assignment.id] &&
          scopedOfficerNames.has(assignment.officer));
      if (!belongs || assignment.status === "Draft") return false;
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

    const enhance = () => applyUi(consultant, scopedAssignments, masterAssignments);
    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    const filterProjectOptions = () => {
      for (const select of Array.from(document.querySelectorAll("select"))) {
        const projectOptions = Array.from(select.options).filter((option) =>
          projects.some((project) => project.name === option.value),
        );
        if (!projectOptions.length) continue;
        for (const option of projectOptions) {
          const project = projects.find((item) => item.name === option.value);
          option.hidden = Boolean(project && !consultant.states.includes(project.state));
          option.disabled = option.hidden;
        }
      }
    };
    filterProjectOptions();
    const modalObserver = new MutationObserver(filterProjectOptions);
    modalObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      modalObserver.disconnect();
      document.getElementById(UNASSIGNED_PANEL_ID)?.remove();
    };
  }, [assignments, consultant, fieldOfficers, session?.role]);

  return null;
}
