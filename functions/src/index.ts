import Busboy from "busboy";
import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response } from "express";
import {
  defineBoolean,
  defineInt,
  defineSecret,
  defineString,
} from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { auth, db, storage } from "./firebase.js";
import {
  clearSessionCookie,
  profileById,
  requireRole,
  requireUser,
  setSessionCookie,
  toSessionUser,
} from "./auth.js";
import {
  assignmentAccess,
  distanceMeters,
  listWorkflow,
  now,
  setAudit,
  writeAudit,
} from "./data.js";
import {
  ApiError,
  asyncRoute,
  errorHandler,
  parseBody,
  sameOrigin,
  sendJson,
  verifyAppCheck,
} from "./http.js";
import { answerReaQuestion, type ReaAiRequest } from "./rea-ai.js";
import {
  arrivalSchema,
  assignmentSchema,
  bootstrapSchema,
  contractorSchema,
  createUserSchema,
  evidenceUploadMetadataSchema,
  projectSchema,
  reaReviewSchema,
  reportSchema,
  reviewSchema,
  sessionLoginSchema,
  userStatusSchema,
} from "./schemas.js";
import type { AssignmentStatus, UserProfile } from "./types.js";

const BOOTSTRAP_TOKEN = defineSecret("BOOTSTRAP_TOKEN");
const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const ENFORCE_APP_CHECK = defineBoolean("ENFORCE_APP_CHECK", {
  default: false,
});
const SESSION_TTL_HOURS = defineInt("SESSION_TTL_HOURS", { default: 8 });
const MAX_UPLOAD_BYTES = defineInt("MAX_UPLOAD_BYTES", { default: 10_485_760 });
const OPENAI_MODEL = defineString("OPENAI_MODEL", { default: "gpt-4.1-mini" });

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "6mb" }));
app.use((request, response, next) => {
  response.locals.requestId = crypto.randomUUID();
  response.setHeader("X-Request-Id", response.locals.requestId);
  next();
});
app.use((request, response, next) => {
  Promise.resolve()
    .then(async () => {
      sameOrigin(request);
      const appCheckOptional =
        request.path === "/api/health" ||
        request.path === "/api/setup/bootstrap" ||
        (request.method === "GET" &&
          (request.path.startsWith("/api/evidence/") ||
            request.path.startsWith("/api/signatures/")));
      if (!appCheckOptional)
        await verifyAppCheck(request, ENFORCE_APP_CHECK.value());
      response.locals.appCheckVerified = !appCheckOptional;
      next();
    })
    .catch(next);
});

function jsonRoute(
  handler: (request: Request, response: Response) => Promise<unknown>,
  status = 200,
) {
  return asyncRoute(async (request, response) => {
    const value = await handler(request, response);
    if (!response.headersSent) sendJson(response, status, value);
  });
}

function publicProfile(input: UserProfile) {
  return toSessionUser(input);
}

app.get(
  "/api/health",
  jsonRoute(async () => ({
    ok: true,
    service: "veritas",
    platform: "firebase",
  })),
);

app.post(
  "/api/setup/bootstrap",
  jsonRoute(async (request) => {
    const configured = BOOTSTRAP_TOKEN.value();
    const supplied = request.get("x-bootstrap-token") ?? "";
    if (!configured || configured.length < 32)
      throw new ApiError(
        503,
        "BOOTSTRAP_DISABLED",
        "Bootstrap is not configured.",
      );
    const suppliedBytes = Buffer.from(supplied);
    const configuredBytes = Buffer.from(configured);
    if (
      suppliedBytes.length !== configuredBytes.length ||
      !timingSafeEqual(suppliedBytes, configuredBytes)
    ) {
      throw new ApiError(
        401,
        "BOOTSTRAP_TOKEN_INVALID",
        "Bootstrap token is invalid.",
      );
    }
    const input = parseBody(request, bootstrapSchema);
    const stateRef = db.collection("system").doc("bootstrap");
    const operationId = crypto.randomUUID();
    await db.runTransaction(async (transaction) => {
      const state = await transaction.get(stateRef);
      if (state.exists)
        throw new ApiError(
          409,
          "BOOTSTRAP_ALREADY_COMPLETE",
          "The first administrator already exists.",
        );
      transaction.create(stateRef, {
        status: "reserved",
        operationId,
        createdAt: now(),
      });
    });
    let createdUid: string | undefined;
    try {
      const record = await auth.createUser({
        email: input.email,
        password: input.password,
        displayName: input.name,
      });
      createdUid = record.uid;
      await auth.setCustomUserClaims(record.uid, { role: "rea" });
      const timestamp = now();
      const profile: UserProfile = {
        id: record.uid,
        email: input.email,
        role: "rea",
        name: input.name,
        phone: "",
        zone: "",
        device: "",
        status: "Active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const batch = db.batch();
      batch.create(db.collection("users").doc(record.uid), profile);
      batch.set(stateRef, {
        status: "complete",
        operationId,
        userId: record.uid,
        completedAt: timestamp,
      });
      await batch.commit();
      return { user: publicProfile(profile) };
    } catch (error) {
      if (createdUid) await auth.deleteUser(createdUid).catch(() => undefined);
      const state = await stateRef.get();
      if (state.data()?.operationId === operationId)
        await stateRef.delete().catch(() => undefined);
      throw error;
    }
  }, 201),
);

app.post(
  "/api/auth/session-login",
  jsonRoute(async (request, response) => {
    const { idToken } = parseBody(request, sessionLoginSchema);
    let decoded;
    try {
      decoded = await auth.verifyIdToken(idToken, true);
    } catch {
      throw new ApiError(401, "INVALID_CREDENTIALS", "Authentication failed.");
    }
    if (Math.floor(Date.now() / 1000) - decoded.auth_time > 5 * 60) {
      throw new ApiError(
        401,
        "RECENT_LOGIN_REQUIRED",
        "Sign in again before creating a session.",
      );
    }
    const profile = await profileById(decoded.uid);
    if (!profile || profile.status !== "Active")
      throw new ApiError(
        403,
        "ACCOUNT_DISABLED",
        "This account is unavailable.",
      );
    const hours = Math.max(1, Math.min(SESSION_TTL_HOURS.value(), 24 * 14));
    const expiresIn = hours * 60 * 60 * 1000;
    const cookie = await auth.createSessionCookie(idToken, { expiresIn });
    setSessionCookie(response, cookie, expiresIn);
    return { user: publicProfile(profile) };
  }),
);

app.get(
  "/api/auth/session",
  jsonRoute(async (request) => ({ user: await requireUser(request) })),
);
app.post(
  "/api/auth/logout",
  jsonRoute(async (_request, response) => {
    clearSessionCookie(response);
    return { ok: true };
  }),
);

app.get(
  "/api/users",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea", "consultant"]);
    let query: FirebaseFirestore.Query = db.collection("users");
    if (actor.role === "consultant") query = query.where("role", "==", "field");
    const snapshot = await query.get();
    return {
      users: snapshot.docs
        .map((doc) => publicProfile(doc.data() as UserProfile))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }),
);

app.post(
  "/api/users",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea", "consultant"]);
    const input = parseBody(request, createUserSchema);
    if (actor.role === "consultant" && input.role !== "field") {
      throw new ApiError(
        403,
        "ROLE_FORBIDDEN",
        "Consultant administrators can only create field officers.",
      );
    }
    let uid: string | undefined;
    try {
      const record = await auth.createUser({
        email: input.email,
        password: input.password,
        displayName: input.name,
      });
      uid = record.uid;
      await auth.setCustomUserClaims(uid, { role: input.role });
      const timestamp = now();
      const profile: UserProfile = {
        id: uid,
        email: input.email,
        role: input.role,
        name: input.name,
        phone: input.phone,
        zone: input.zone,
        device: input.device,
        status: "Active",
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await db.collection("users").doc(uid).create(profile);
      await writeAudit(
        actor,
        null,
        `Created ${input.role} account for ${input.name}`,
      );
      return { user: publicProfile(profile) };
    } catch (error) {
      if (uid) await auth.deleteUser(uid).catch(() => undefined);
      if (String(error).includes("email-already-exists"))
        throw new ApiError(
          409,
          "EMAIL_EXISTS",
          "A user with this email already exists.",
        );
      throw error;
    }
  }, 201),
);

app.patch(
  "/api/users/:id/status",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea", "consultant"]);
    const target = await profileById(request.params.id);
    if (!target)
      throw new ApiError(404, "USER_NOT_FOUND", "User was not found.");
    if (actor.role === "consultant" && target.role !== "field")
      throw new ApiError(
        403,
        "ROLE_FORBIDDEN",
        "Consultants can only manage field officers.",
      );
    if (actor.id === target.id)
      throw new ApiError(
        409,
        "SELF_SUSPENSION",
        "You cannot suspend your own account.",
      );
    const input = parseBody(request, userStatusSchema);
    await Promise.all([
      auth.updateUser(target.id, { disabled: input.status === "Suspended" }),
      db
        .collection("users")
        .doc(target.id)
        .update({ status: input.status, updatedAt: now() }),
      ...(input.status === "Suspended"
        ? [auth.revokeRefreshTokens(target.id)]
        : []),
    ]);
    await writeAudit(
      actor,
      null,
      `${input.status === "Active" ? "Activated" : "Suspended"} ${target.name}`,
    );
    return { ok: true };
  }),
);

app.get(
  "/api/contractors",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea", "consultant"]);
    const snapshot = await db.collection("contractors").get();
    return {
      contractors: snapshot.docs
        .map((doc) => doc.data())
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    };
  }),
);

app.post(
  "/api/contractors",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea", "consultant"]);
    const input = parseBody(request, contractorSchema);
    const id = input.id ?? crypto.randomUUID();
    const timestamp = now();
    const existing = await db
      .collection("contractors")
      .where("normalizedName", "==", input.name.toLowerCase())
      .limit(1)
      .get();
    if (!existing.empty)
      throw new ApiError(
        409,
        "CONTRACTOR_EXISTS",
        "A contractor with this name already exists.",
      );
    await db
      .collection("contractors")
      .doc(id)
      .create({
        id,
        ...input,
        normalizedName: input.name.toLowerCase(),
        status: "Active",
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    await writeAudit(actor, null, `Created contractor ${input.name}`);
    return { id };
  }, 201),
);

app.get(
  "/api/projects",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    let snapshot;
    if (actor.role === "field") {
      const assigned = await db
        .collection("assignments")
        .where("officerUserId", "==", actor.id)
        .get();
      const ids = [
        ...new Set(assigned.docs.map((doc) => String(doc.data().projectId))),
      ];
      const docs = ids.length
        ? await db.getAll(...ids.map((id) => db.collection("projects").doc(id)))
        : [];
      return {
        projects: docs.filter((doc) => doc.exists).map((doc) => doc.data()),
      };
    }
    snapshot = await db.collection("projects").get();
    return {
      projects: snapshot.docs
        .map((doc) => doc.data())
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    };
  }),
);

app.post(
  "/api/projects",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea", "consultant"]);
    const input = parseBody(request, projectSchema);
    const id = input.id ?? `REA-${crypto.randomUUID()}`;
    const timestamp = now();
    const ref = db.collection("projects").doc(id);
    const existing = await ref.get();
    await ref.set(
      {
        id,
        ...input,
        verified: existing.data()?.verified ?? false,
        createdBy: existing.data()?.createdBy ?? actor.id,
        createdAt: existing.data()?.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
      { merge: true },
    );
    await writeAudit(
      actor,
      null,
      `${existing.exists ? "Updated" : "Created"} project ${input.name}`,
    );
    return { id };
  }, 201),
);

app.post(
  "/api/assignments",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea", "consultant"]);
    const input = parseBody(request, assignmentSchema);
    const [project, officer] = await Promise.all([
      db.collection("projects").doc(input.projectId).get(),
      profileById(input.officerUserId),
    ]);
    if (!project.exists)
      throw new ApiError(404, "PROJECT_NOT_FOUND", "Project was not found.");
    if (!officer || officer.role !== "field" || officer.status !== "Active")
      throw new ApiError(
        400,
        "OFFICER_INVALID",
        "Choose an active field officer.",
      );
    const id = input.id ?? `assignment-${crypto.randomUUID()}`;
    const timestamp = now();
    await db
      .collection("assignments")
      .doc(id)
      .create({
        id,
        ...input,
        status: "Assigned",
        syncStatus: "synced",
        createdBy: actor.id,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    await writeAudit(
      actor,
      id,
      `Assigned ${project.data()?.name ?? "project"} to ${officer.name}`,
    );
    return { id };
  }, 201),
);

app.get(
  "/api/workflow",
  jsonRoute(async (request) => listWorkflow(await requireUser(request))),
);

app.post(
  "/api/assignments/:id/route",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["field"]);
    const { ref } = await assignmentAccess(actor, request.params.id);
    const timestamp = now();
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const status = snapshot.data()?.status as AssignmentStatus;
      if (!["Assigned", "Draft", "Re-inspection"].includes(status))
        throw new ApiError(
          409,
          "INVALID_TRANSITION",
          "Navigation cannot start from the current status.",
        );
      transaction.update(ref, {
        routeStartedAt: timestamp,
        status: "En route",
        updatedAt: timestamp,
      });
      setAudit(transaction, actor, request.params.id, "Navigation started");
    });
    return { ok: true, routeStartedAt: timestamp };
  }),
);

app.post(
  "/api/assignments/:id/arrival",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["field"]);
    const { ref, assignment, project } = await assignmentAccess(
      actor,
      request.params.id,
    );
    const input = parseBody(request, arrivalSchema);
    const distance = distanceMeters(input, {
      latitude: Number(project.latitude),
      longitude: Number(project.longitude),
    });
    const allowed = distance <= Number(assignment.geofenceRadius);
    await db.runTransaction(async (transaction) => {
      const fresh = await transaction.get(ref);
      const status = fresh.data()?.status as AssignmentStatus;
      if (!["Assigned", "En route", "Draft", "Re-inspection"].includes(status))
        throw new ApiError(
          409,
          "INVALID_TRANSITION",
          "Arrival cannot be verified from the current status.",
        );
      if (allowed)
        transaction.update(ref, {
          arrival: {
            latitude: input.latitude,
            longitude: input.longitude,
            at: now(),
            distance,
          },
          status: "Arrived",
          updatedAt: now(),
        });
      setAudit(
        transaction,
        actor,
        request.params.id,
        allowed
          ? `Arrival verified within geofence (${distance} m)`
          : `Arrival blocked outside geofence (${distance} m)`,
        input.deviceId,
        input.deviceType,
        { ...input, distance, allowed },
      );
    });
    return { allowed, distance };
  }),
);

async function saveReport(request: Request, submit: boolean) {
  const actor = await requireUser(request);
  requireRole(actor, ["field"]);
  const assignmentId = request.params.id;
  const { ref, assignment, project } = await assignmentAccess(
    actor,
    assignmentId,
  );
  const input = parseBody(request, reportSchema);
  if (
    input.assignmentId !== assignmentId ||
    input.projectId !== assignment.projectId
  )
    throw new ApiError(
      400,
      "REPORT_ASSIGNMENT_MISMATCH",
      "Report does not match this assignment.",
    );
  if (input.assignedComponent !== project.component)
    throw new ApiError(
      400,
      "REPORT_COMPONENT_MISMATCH",
      "Report component does not match the assigned component.",
    );
  const reportRef = db.collection("reports").doc(assignmentId);
  const existingReport = await reportRef.get();
  const existingSignaturePaths = existingReport.data()?.signaturePaths as
    | { community?: string; contractor?: string }
    | undefined;
  if (submit) {
    if (!input.communitySignature || !input.contractorSignature)
      throw new ApiError(
        400,
        "SIGNATURES_REQUIRED",
        "Both signatures are required before submission.",
      );
    const evidence = await db
      .collection("evidence")
      .where("assignmentId", "==", assignmentId)
      .limit(1)
      .get();
    if (!existingReport.exists)
      throw new ApiError(
        409,
        "REPORT_REQUIRED",
        "Save a report draft before submission.",
      );
    if (evidence.empty)
      throw new ApiError(
        400,
        "EVIDENCE_REQUIRED",
        "Upload at least one evidence file before submission.",
      );
  }
  const storeSignature = async (
    kind: "community" | "contractor",
    value?: string,
  ) => {
    const existingPath = existingSignaturePaths?.[kind];
    if (!value) return existingPath;
    if (value === `/api/signatures/${assignmentId}/${kind}`)
      return existingPath;
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
    if (!match)
      throw new ApiError(
        400,
        "SIGNATURE_INVALID",
        "Signatures must be PNG images.",
      );
    const buffer = Buffer.from(match[1], "base64");
    if (!buffer.length || buffer.length > 500_000)
      throw new ApiError(
        413,
        "SIGNATURE_TOO_LARGE",
        "Each signature must be 500 KB or smaller.",
      );
    const objectPath = `signatures/${assignmentId}/${kind}.png`;
    await storage
      .bucket()
      .file(objectPath)
      .save(buffer, {
        resumable: false,
        validation: "md5",
        metadata: {
          contentType: "image/png",
          cacheControl: "private,no-store",
        },
      });
    return objectPath;
  };
  const [communityPath, contractorPath] = await Promise.all([
    storeSignature("community", input.communitySignature),
    storeSignature("contractor", input.contractorSignature),
  ]);
  if (submit && (!communityPath || !contractorPath)) {
    throw new ApiError(
      400,
      "SIGNATURES_REQUIRED",
      "Both signatures are required before submission.",
    );
  }
  const {
    evidence: _evidence,
    communitySignature: _communitySignature,
    contractorSignature: _contractorSignature,
    ...data
  } = input;
  if (Buffer.byteLength(JSON.stringify(data), "utf8") > 800_000) {
    throw new ApiError(
      413,
      "REPORT_TOO_LARGE",
      "The report is too large to save.",
    );
  }
  const timestamp = now();
  await db.runTransaction(async (transaction) => {
    const fresh = await transaction.get(ref);
    const status = fresh.data()?.status as AssignmentStatus;
    if (["Submitted", "Approved", "Verified", "Rejected"].includes(status))
      throw new ApiError(
        409,
        "REPORT_LOCKED",
        "This report is locked for review.",
      );
    const arrivalAt = Date.parse(String(fresh.data()?.arrival?.at ?? ""));
    if (!arrivalAt || Date.now() - arrivalAt > 15 * 60 * 1000)
      throw new ApiError(
        409,
        "ARRIVAL_REQUIRED",
        "Verify arrival again before saving the report.",
      );
    transaction.set(
      reportRef,
      {
        id: assignmentId,
        assignmentId,
        officerUserId: actor.id,
        data: { ...data, evidence: [] },
        signaturePaths: {
          community: communityPath ?? null,
          contractor: contractorPath ?? null,
        },
        submittedAt: submit ? timestamp : null,
        createdAt: existingReport.data()?.createdAt ?? timestamp,
        updatedAt: timestamp,
      },
      { merge: true },
    );
    transaction.update(ref, {
      status: submit ? "Submitted" : "Draft",
      syncStatus: "synced",
      updatedAt: timestamp,
    });
    setAudit(
      transaction,
      actor,
      assignmentId,
      submit ? "Inspection submitted for QA" : "Inspection draft saved",
      input.deviceId,
      input.deviceType,
    );
  });
  return {
    ok: true,
    reportId: assignmentId,
    status: submit ? "Submitted" : "Draft",
  };
}

app.put(
  "/api/assignments/:id/report",
  jsonRoute(async (request) => saveReport(request, false)),
);
app.post(
  "/api/assignments/:id/submit",
  jsonRoute(async (request) => saveReport(request, true)),
);

app.post(
  "/api/assignments/:id/consultant-review",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["consultant"]);
    const { ref } = await assignmentAccess(actor, request.params.id);
    const input = parseBody(request, reviewSchema);
    if (input.decision === "Re-inspection" && !input.note)
      throw new ApiError(
        400,
        "REVIEW_NOTE_REQUIRED",
        "A re-inspection reason is required.",
      );
    const timestamp = now();
    const reportRef = db.collection("reports").doc(request.params.id);
    await db.runTransaction(async (transaction) => {
      const assignment = await transaction.get(ref);
      if (assignment.data()?.status !== "Submitted")
        throw new ApiError(
          409,
          "INVALID_TRANSITION",
          "Only submitted reports can be reviewed.",
        );
      transaction.update(ref, {
        status: input.decision,
        ...(input.decision === "Re-inspection"
          ? { arrival: null, routeStartedAt: null }
          : {}),
        updatedAt: timestamp,
      });
      transaction.set(
        reportRef,
        {
          consultantReviewNote: input.note,
          consultantReviewedAt: timestamp,
          updatedAt: timestamp,
        },
        { merge: true },
      );
      setAudit(
        transaction,
        actor,
        request.params.id,
        input.decision === "Approved"
          ? "Report approved after QA"
          : "Returned for re-inspection",
      );
    });
    return { ok: true, status: input.decision };
  }),
);

app.post(
  "/api/assignments/:id/rea-review",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea"]);
    const { ref, assignment } = await assignmentAccess(
      actor,
      request.params.id,
    );
    const input = parseBody(request, reaReviewSchema);
    if (input.decision === "Rejected" && !input.note)
      throw new ApiError(
        400,
        "REVIEW_NOTE_REQUIRED",
        "A rejection reason is required.",
      );
    const timestamp = now();
    const reportRef = db.collection("reports").doc(request.params.id);
    const projectRef = db
      .collection("projects")
      .doc(String(assignment.projectId));
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      if (current.data()?.status !== "Approved")
        throw new ApiError(
          409,
          "INVALID_TRANSITION",
          "Only consultant-approved reports can be verified.",
        );
      transaction.update(ref, { status: input.decision, updatedAt: timestamp });
      transaction.set(
        reportRef,
        {
          reaReviewNote: input.note,
          reaReviewedAt: timestamp,
          updatedAt: timestamp,
        },
        { merge: true },
      );
      transaction.update(projectRef, {
        verified: input.decision === "Verified",
        status: input.decision,
        updatedAt: timestamp,
      });
      setAudit(
        transaction,
        actor,
        request.params.id,
        input.decision === "Verified"
          ? "Report verified by REA"
          : "Report rejected by REA",
      );
    });
    return { ok: true, status: input.decision };
  }),
);

function safeFileName(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .slice(0, 120) || "evidence"
  );
}

async function multipartEvidence(request: Request) {
  const maximum = Math.max(
    1_000_000,
    Math.min(MAX_UPLOAD_BYTES.value(), 25_000_000),
  );
  return new Promise<{
    buffer: Buffer;
    fileName: string;
    contentType: string;
    metadataText: string;
  }>((resolve, reject) => {
    const busboy = Busboy({
      headers: request.headers,
      limits: { files: 1, fileSize: maximum, fields: 2 },
    });
    const chunks: Buffer[] = [];
    let fileName = "";
    let contentType = "";
    let metadataText = "";
    let limited = false;
    busboy.on("file", (_name, stream, info) => {
      fileName = info.filename;
      contentType = info.mimeType;
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        limited = true;
      });
    });
    busboy.on("field", (name, value) => {
      if (name === "metadata") metadataText = value;
    });
    busboy.on("error", reject);
    busboy.on("finish", () => {
      if (limited)
        return reject(
          new ApiError(413, "FILE_TOO_LARGE", "Evidence file is too large."),
        );
      const buffer = Buffer.concat(chunks);
      if (!buffer.length || !fileName || !metadataText)
        return reject(
          new ApiError(
            400,
            "EVIDENCE_INVALID",
            "Evidence file and metadata are required.",
          ),
        );
      resolve({ buffer, fileName, contentType, metadataText });
    });
    busboy.end((request as Request & { rawBody: Buffer }).rawBody);
  });
}

app.post(
  "/api/assignments/:id/evidence",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["field"]);
    const assignmentId = request.params.id;
    const { assignment } = await assignmentAccess(actor, assignmentId);
    if (
      ["Submitted", "Approved", "Verified", "Rejected"].includes(
        String(assignment.status),
      )
    )
      throw new ApiError(
        409,
        "REPORT_LOCKED",
        "Evidence cannot be changed after submission.",
      );
    const report = await db.collection("reports").doc(assignmentId).get();
    if (!report.exists)
      throw new ApiError(
        409,
        "REPORT_REQUIRED",
        "Save the report draft before uploading evidence.",
      );
    const upload = await multipartEvidence(request);
    if (
      !upload.contentType.startsWith("image/") &&
      !upload.contentType.startsWith("video/")
    )
      throw new ApiError(
        415,
        "EVIDENCE_TYPE_INVALID",
        "Only image and video evidence is accepted.",
      );
    let metadataValue: unknown;
    try {
      metadataValue = JSON.parse(upload.metadataText);
    } catch {
      throw new ApiError(
        400,
        "EVIDENCE_METADATA_INVALID",
        "Evidence metadata is invalid.",
      );
    }
    const parsed = evidenceUploadMetadataSchema.safeParse(metadataValue);
    if (!parsed.success)
      throw new ApiError(
        400,
        "EVIDENCE_METADATA_INVALID",
        "Evidence metadata is invalid.",
      );
    const metadata = parsed.data;
    const id = crypto.randomUUID();
    const objectPath = `evidence/${assignmentId}/${id}-${safeFileName(upload.fileName)}`;
    const file = storage.bucket().file(objectPath);
    await file.save(upload.buffer, {
      resumable: false,
      validation: "md5",
      metadata: {
        contentType: upload.contentType,
        cacheControl: "private,no-store",
        metadata: { assignmentId, evidenceId: id, uploadedBy: actor.id },
      },
    });
    try {
      const timestamp = now();
      await db
        .collection("evidence")
        .doc(id)
        .create({
          id,
          assignmentId,
          reportId: assignmentId,
          officerUserId: actor.id,
          objectPath,
          fileName: upload.fileName,
          mediaType: upload.contentType.startsWith("video/")
            ? "video"
            : "photo",
          contentType: upload.contentType,
          sizeBytes: upload.buffer.length,
          metadata,
          createdAt: timestamp,
        });
      await writeAudit(
        actor,
        assignmentId,
        `Uploaded evidence ${upload.fileName}`,
        metadata.deviceId,
        metadata.deviceType,
        { evidenceId: id, size: upload.buffer.length },
      );
    } catch (error) {
      await file.delete({ ignoreNotFound: true });
      throw error;
    }
    return {
      evidence: {
        ...metadata,
        id,
        name: upload.fileName,
        type: upload.contentType.startsWith("video/") ? "video" : "photo",
        previewUrl: `/api/evidence/${id}`,
      },
    };
  }, 201),
);

app.get(
  "/api/evidence/:id",
  asyncRoute(async (request, response) => {
    const actor = await requireUser(request);
    const snapshot = await db
      .collection("evidence")
      .doc(request.params.id)
      .get();
    if (!snapshot.exists)
      throw new ApiError(404, "EVIDENCE_NOT_FOUND", "Evidence was not found.");
    const evidence = snapshot.data()!;
    if (actor.role === "field" && evidence.officerUserId !== actor.id)
      throw new ApiError(
        403,
        "EVIDENCE_FORBIDDEN",
        "You cannot access this evidence.",
      );
    response.set({
      "Content-Type": evidence.contentType,
      "Content-Disposition": `inline; filename="${safeFileName(evidence.fileName)}"`,
      "Cache-Control": "private,no-store",
      "X-Content-Type-Options": "nosniff",
    });
    await new Promise<void>((resolve, reject) => {
      storage
        .bucket()
        .file(evidence.objectPath)
        .createReadStream()
        .on("error", reject)
        .on("end", resolve)
        .pipe(response);
    });
  }),
);

app.get(
  "/api/signatures/:assignmentId/:kind",
  asyncRoute(async (request, response) => {
    const actor = await requireUser(request);
    await assignmentAccess(actor, request.params.assignmentId);
    if (!["community", "contractor"].includes(request.params.kind)) {
      throw new ApiError(
        404,
        "SIGNATURE_NOT_FOUND",
        "Signature was not found.",
      );
    }
    const report = await db
      .collection("reports")
      .doc(request.params.assignmentId)
      .get();
    const objectPath = report.data()?.signaturePaths?.[request.params.kind];
    if (!objectPath)
      throw new ApiError(
        404,
        "SIGNATURE_NOT_FOUND",
        "Signature was not found.",
      );
    response.set({
      "Content-Type": "image/png",
      "Cache-Control": "private,no-store",
      "X-Content-Type-Options": "nosniff",
    });
    await new Promise<void>((resolve, reject) => {
      storage
        .bucket()
        .file(objectPath)
        .createReadStream()
        .on("error", reject)
        .on("end", resolve)
        .pipe(response);
    });
  }),
);

app.post(
  "/api/rea-assistant",
  jsonRoute(async (request) => {
    const actor = await requireUser(request);
    requireRole(actor, ["rea"]);
    const result = await answerReaQuestion(request.body as ReaAiRequest, {
      OPENAI_API_KEY: OPENAI_API_KEY.value(),
      OPENAI_MODEL: OPENAI_MODEL.value(),
    });
    if (result.status >= 400)
      throw new ApiError(
        result.status,
        "REA_AI_ERROR",
        String(result.body.error ?? "REA AI request failed."),
      );
    return result.body;
  }),
);

app.use((_request, response) =>
  sendJson(response, 404, {
    error: "API route was not found.",
    code: "ROUTE_NOT_FOUND",
  }),
);
app.use(errorHandler);

export const api = onRequest(
  {
    region: "europe-west1",
    cors: false,
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 20,
    secrets: [BOOTSTRAP_TOKEN, OPENAI_API_KEY],
  },
  app,
);
