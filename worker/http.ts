import { z, type ZodType } from "zod";
import type { ApiErrorBody } from "../shared/backend";

export const SESSION_COOKIE = "veritas_session";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: ApiError, requestId: string) {
  const body: ApiErrorBody = {
    error: error.message,
    code: error.code,
    requestId,
    details: error.details,
  };
  return json(body, { status: error.status });
}

export function validationError(error: z.ZodError) {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "body";
    details[key] = [...(details[key] ?? []), issue.message];
  }
  return new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", details);
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
  maximumBytes = 1_000_000,
) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Expected JSON request body.");
  }
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maximumBytes) {
    throw new ApiError(413, "BODY_TOO_LARGE", "Request body is too large.");
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON.");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function cookieValue(request: Request, name = SESSION_COOKIE) {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [candidate, ...value] = part.trim().split("=");
    if (candidate === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function sessionCookie(
  request: Request,
  token: string,
  maxAgeSeconds: number,
) {
  const secure = new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:";
  return `${SESSION_COOKIE}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=0`;
}

export function enforceSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "ORIGIN_MISMATCH", "Cross-origin request rejected.");
  }
}

export function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function routeMatch(pathname: string, pattern: RegExp) {
  return pathname.match(pattern);
}

export function requestMetadata(request: Request) {
  return {
    ip: request.headers.get("cf-connecting-ip") ?? "unknown",
    userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 512),
  };
}
