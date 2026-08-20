import { type DocumentData, type Transaction } from "firebase-admin/firestore";
import { db } from "./firebase.js";
import { ApiError } from "./http.js";
import { toSessionUser } from "./auth.js";
import type { Actor, UserProfile } from "./types.js";

export { distanceMeters } from "./geo.js";

export function now() {
  return new Date().toISOString();
}

export function auditRecord(
  actor: Actor,
  assignmentId: string | null,
  action: string,
  deviceId = "",
  deviceType = "",
  metadata: Record<string, unknown> = {},
) {
  return {
    id: crypto.randomUUID(),
    assignmentId,
    actorUserId: actor.id,
    actorName: actor.name,
    action,
    deviceId,
    deviceType,
    metadata,
    createdAt: now(),
  };
}

export async function writeAudit(
  actor: Actor,
  assignmentId: string | null,
  action: string,
  deviceId = "",
  deviceType = "",
  metadata: Record<string, unknown> = {},
) {
  const record = auditRecord(
    actor,
    assignmentId,
    action,
    deviceId,
    deviceType,
    metadata,
  );
  await db.collection("auditEvents").doc(record.id).set(record);
}

export function setAudit(
  transaction: Transaction,
  actor: Actor,
  assignmentId: string | null,
  action: string,
  deviceId = "",
  deviceType = "",
  metadata: Record<string, unknown> = {},
) {
  const record = auditRecord(
    actor,
    assignmentId,
    action,
    deviceId,
    deviceType,
    metadata,
  );
  transaction.set(db.collection("auditEvents").doc(record.id), record);
}

export async function assignmentAccess(actor: Actor, assignmentId: string) {
  const assignmentSnapshot = await db
    .collection("assignments")
    .doc(assignmentId)
    .get();
  if (!assignmentSnapshot.exists)
    throw new ApiError(
      404,
      "ASSIGNMENT_NOT_FOUND",
      "Assignment was not found.",
    );
  const assignment = assignmentSnapshot.data()!;
  if (actor.role === "field" && assignment.officerUserId !== actor.id) {
    throw new ApiError(
      403,
      "ASSIGNMENT_FORBIDDEN",
      "This assignment is not assigned to you.",
    );
  }
  const projectSnapshot = await db
    .collection("projects")
    .doc(String(assignment.projectId))
    .get();
  if (!projectSnapshot.exists)
    throw new ApiError(404, "PROJECT_NOT_FOUND", "Project was not found.");
  return {
    ref: assignmentSnapshot.ref,
    assignment,
    project: projectSnapshot.data()!,
  };
}

function chunks<T>(items: T[], size = 30) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    result.push(items.slice(index, index + size));
  return result;
}

async function recordsForAssignments(
  collection: string,
  assignmentIds: string[],
) {
  if (!assignmentIds.length) return [] as DocumentData[];
  const snapshots = await Promise.all(
    chunks(assignmentIds).map((ids) =>
      db.collection(collection).where("assignmentId", "in", ids).get(),
    ),
  );
  return snapshots.flatMap((snapshot) =>
    snapshot.docs.map((doc) => doc.data()),
  );
}

export async function listWorkflow(actor: Actor) {
  let assignmentQuery: FirebaseFirestore.Query = db.collection("assignments");
  if (actor.role === "field")
    assignmentQuery = assignmentQuery.where("officerUserId", "==", actor.id);
  const assignmentSnapshot = await assignmentQuery.get();
  const assignmentRows = assignmentSnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
  const assignmentIds = assignmentRows.map((item) => item.id);
  const projectIds = [
    ...new Set(assignmentRows.map((item) => String(item.projectId))),
  ];
  const officerIds = [
    ...new Set(assignmentRows.map((item) => String(item.officerUserId))),
  ];

  const [
    projectSnapshots,
    officerSnapshots,
    reportSnapshots,
    evidenceRows,
    auditRows,
  ] = await Promise.all([
    projectIds.length
      ? db.getAll(...projectIds.map((id) => db.collection("projects").doc(id)))
      : [],
    officerIds.length
      ? db.getAll(...officerIds.map((id) => db.collection("users").doc(id)))
      : [],
    assignmentIds.length
      ? db.getAll(
          ...assignmentIds.map((id) => db.collection("reports").doc(id)),
        )
      : [],
    recordsForAssignments("evidence", assignmentIds),
    recordsForAssignments("auditEvents", assignmentIds),
  ]);
  const projects = new Map(
    projectSnapshots
      .filter((doc) => doc.exists)
      .map((doc) => [doc.id, doc.data()!]),
  );
  const officers = new Map(
    officerSnapshots
      .filter((doc) => doc.exists)
      .map((doc) => [doc.id, doc.data() as UserProfile]),
  );
  const reports = new Map(
    reportSnapshots
      .filter((doc) => doc.exists)
      .map((doc) => [doc.id, doc.data()!]),
  );

  const assignments = assignmentRows
    .map((assignment) => {
      const project = projects.get(String(assignment.projectId)) ?? {};
      const officer = officers.get(String(assignment.officerUserId));
      const storedReport = reports.get(assignment.id);
      const report = storedReport
        ? {
            ...(storedReport.data as Record<string, unknown>),
            communitySignature: storedReport.signaturePaths?.community
              ? `/api/signatures/${assignment.id}/community`
              : undefined,
            contractorSignature: storedReport.signaturePaths?.contractor
              ? `/api/signatures/${assignment.id}/contractor`
              : undefined,
            submittedAt: storedReport.submittedAt ?? undefined,
            reviewNote: storedReport.consultantReviewNote ?? undefined,
            reaReviewNote: storedReport.reaReviewNote ?? undefined,
            reaReviewedAt: storedReport.reaReviewedAt ?? undefined,
            evidence: evidenceRows
              .filter((item) => item.assignmentId === assignment.id)
              .sort((a, b) =>
                String(a.createdAt).localeCompare(String(b.createdAt)),
              )
              .map((item) => ({
                ...item.metadata,
                id: item.id,
                name: item.fileName,
                type: item.mediaType,
                previewUrl: `/api/evidence/${item.id}`,
              })),
          }
        : undefined;
      return {
        id: assignment.id,
        projectName: project.name ?? "",
        programme: project.programme ?? "",
        component: project.component ?? "",
        contractor: project.contractor ?? "",
        state: project.state ?? "",
        lga: project.lga ?? "",
        community: project.community ?? "",
        officer: officer?.name ?? "",
        dueDate: assignment.dueDate,
        latitude: project.latitude,
        longitude: project.longitude,
        geofenceRadius: assignment.geofenceRadius,
        routeStartedAt: assignment.routeStartedAt,
        status: assignment.status,
        arrival: assignment.arrival,
        report,
        syncStatus: assignment.syncStatus ?? "synced",
        audit: auditRows
          .filter((item) => item.assignmentId === assignment.id)
          .sort((a, b) =>
            String(a.createdAt).localeCompare(String(b.createdAt)),
          )
          .map((item) => ({
            id: item.id,
            at: item.createdAt,
            actor: item.actorName,
            action: item.action,
            deviceId: item.deviceId,
            deviceType: item.deviceType,
          })),
      };
    })
    .sort((a, b) => String(b.dueDate).localeCompare(String(a.dueDate)));

  const fieldOfficers =
    actor.role === "field"
      ? []
      : (await db.collection("users").where("role", "==", "field").get()).docs
          .map((doc) => {
            const profile = doc.data() as UserProfile;
            const session = toSessionUser(profile);
            return {
              id: session.id,
              name: session.name,
              email: session.email,
              phone: session.phone,
              zone: session.zone,
              device: session.device,
              status: session.status,
              createdAt: session.createdAt,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

  return { assignments, fieldOfficers };
}
