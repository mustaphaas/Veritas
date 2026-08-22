export const VERITAS_SESSION_COOKIE = "veritas_rea_session";
export const VERITAS_REA_EMAIL = "rea.admin@demo.ng";
export const VERITAS_REA_PASSWORD = "REA2024!";

type VeritasSessionPayload = {
  role: "rea";
  email: string;
  expiresAt: number;
};

function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createVeritasSessionToken(
  secret: string,
  email = VERITAS_REA_EMAIL,
  now = Date.now(),
) {
  const payload: VeritasSessionPayload = {
    role: "rea",
    email: email.toLowerCase(),
    expiresAt: now + 8 * 60 * 60 * 1_000,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

export async function verifyVeritasSessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
) {
  if (!token || !secret || secret.length < 32) return false;
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return false;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );
    if (!valid) return false;
    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    ) as VeritasSessionPayload;
    return (
      payload.role === "rea" &&
      payload.email === VERITAS_REA_EMAIL &&
      payload.expiresAt > now
    );
  } catch {
    return false;
  }
}

export function veritasCookieValue(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === VERITAS_SESSION_COOKIE) return value.join("=");
  }
  return undefined;
}

export function veritasSessionCookie(token: string, secure = true) {
  return `${VERITAS_SESSION_COOKIE}=${token}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=28800`;
}

export function clearVeritasSessionCookie(secure = true) {
  return `${VERITAS_SESSION_COOKIE}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=0`;
}
