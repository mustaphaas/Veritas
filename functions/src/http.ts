import type { NextFunction, Request, Response } from "express";
import { z, type ZodType } from "zod";
import { appCheck } from "./firebase.js";

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

export function sendJson(res: Response, status: number, data: unknown) {
  res
    .status(status)
    .set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    })
    .json(data);
}

export function parseBody<T>(request: Request, schema: ZodType<T>): T {
  const result = schema.safeParse(request.body);
  if (result.success) return result.data;
  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "body";
    details[key] = [...(details[key] ?? []), issue.message];
  }
  throw new ApiError(
    400,
    "VALIDATION_ERROR",
    "Request validation failed.",
    details,
  );
}

export function sameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.get("origin");
  if (!origin) return;
  const forwardedHost = request.get("x-forwarded-host") ?? request.get("host");
  const forwardedProto = request.get("x-forwarded-proto") ?? request.protocol;
  if (origin !== `${forwardedProto}://${forwardedHost}`) {
    throw new ApiError(
      403,
      "ORIGIN_MISMATCH",
      "Cross-origin request rejected.",
    );
  }
}

export async function verifyAppCheck(request: Request, enforce: boolean) {
  const token = request.get("X-Firebase-AppCheck");
  if (!token && !enforce) return;
  if (!token)
    throw new ApiError(401, "APP_CHECK_REQUIRED", "App Check is required.");
  try {
    await appCheck.verifyToken(token);
  } catch {
    throw new ApiError(401, "APP_CHECK_INVALID", "App Check token is invalid.");
  }
}

export function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    Promise.resolve(handler(request, response)).catch(next);
  };
}

export function errorHandler(
  error: unknown,
  request: Request,
  response: Response,
  _next: NextFunction,
) {
  const requestId = response.locals.requestId as string;
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  console.error(
    JSON.stringify({
      severity: apiError.status >= 500 ? "ERROR" : "WARNING",
      requestId,
      method: request.method,
      path: request.path,
      status: apiError.status,
      code: apiError.code,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  sendJson(response, apiError.status, {
    error: apiError.message,
    code: apiError.code,
    requestId,
    details: apiError.details,
  });
}
