import type { Request, Response } from "express";
import { auth, db } from "./firebase.js";
import { ApiError } from "./http.js";
import type { Actor, SessionUser, UserProfile, UserRole } from "./types.js";

export const SESSION_COOKIE = "__session";

function cookieValue(request: Request, name = SESSION_COOKIE) {
  const raw = request.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function toSessionUser(profile: UserProfile): SessionUser {
  const roleLabel = {
    rea: "REA Dashboard",
    consultant: "Consultant Admin",
    field: "Field Officer",
  }[profile.role];
  const path = {
    rea: "/",
    consultant: "/consultant-admin",
    field: "/field-officer",
  }[profile.role];
  return {
    ...profile,
    roleLabel,
    path,
    initials: profile.name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join(""),
  };
}

export async function profileById(uid: string) {
  const snapshot = await db.collection("users").doc(uid).get();
  return snapshot.exists ? (snapshot.data() as UserProfile) : undefined;
}

export async function requireUser(request: Request): Promise<Actor> {
  const cookie = cookieValue(request);
  if (!cookie)
    throw new ApiError(401, "AUTH_REQUIRED", "Authentication is required.");
  let claims;
  try {
    claims = await auth.verifySessionCookie(cookie, true);
  } catch {
    throw new ApiError(401, "SESSION_EXPIRED", "Your session has expired.");
  }
  const profile = await profileById(claims.uid);
  if (!profile || profile.status !== "Active") {
    throw new ApiError(401, "SESSION_EXPIRED", "Your session has expired.");
  }
  return { ...toSessionUser(profile), uid: claims.uid };
}

export function requireRole(actor: Actor, allowed: UserRole[]) {
  if (!allowed.includes(actor.role)) {
    throw new ApiError(
      403,
      "ROLE_FORBIDDEN",
      "Your role cannot perform this action.",
    );
  }
}

export function setSessionCookie(
  response: Response,
  value: string,
  maxAgeMs: number,
) {
  const secure = process.env.FUNCTIONS_EMULATOR === "true" ? "" : " Secure;";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  );
}

export function clearSessionCookie(response: Response) {
  const secure = process.env.FUNCTIONS_EMULATOR === "true" ? "" : " Secure;";
  response.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=0`,
  );
}
