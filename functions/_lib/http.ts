export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "request_error",
  ) {
    super(message);
  }
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(data, { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function fail(error: unknown): Response {
  if (error instanceof ApiError) {
    return json({ ok: false, error: { code: error.code, message: error.message } }, error.status);
  }
  console.error("Unhandled API error", error);
  return json(
    { ok: false, error: { code: "internal_error", message: "An unexpected error occurred." } },
    500,
  );
}

export async function bodyJson<T = Record<string, unknown>>(request: Request, maxBytes = 64_000): Promise<T> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > maxBytes) throw new ApiError(413, "Request body is too large.", "body_too_large");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError(415, "Expected an application/json body.", "unsupported_media_type");
  }
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "Invalid JSON body.", "invalid_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "Expected a JSON object.", "invalid_body");
  }
  return value as T;
}

export function text(value: unknown, name: string, options: { required?: boolean; max?: number } = {}): string {
  if (typeof value !== "string") {
    if (!options.required && (value === undefined || value === null)) return "";
    throw new ApiError(400, `${name} must be text.`, "invalid_field");
  }
  const clean = value.trim();
  if (options.required && !clean) throw new ApiError(400, `${name} is required.`, "missing_field");
  if (clean.length > (options.max ?? 500)) throw new ApiError(400, `${name} is too long.`, "invalid_field");
  return clean;
}

export function numberValue(value: unknown, name: string, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ApiError(400, `${name} is invalid.`, "invalid_field");
  }
  return parsed;
}

export function sameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError(403, "Cross-origin mutation denied.", "origin_denied");
  }
}

export function routeParts(request: Request): string[] {
  const url = new URL(request.url);
  return url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { ok: false, error: { code: "method_not_allowed", message: "Method not allowed." } },
    405,
    { allow: allowed.join(", ") },
  );
}
