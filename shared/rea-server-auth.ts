export const REA_SESSION_COOKIE = "rea_admin_session";
export const REA_DEMO_EMAIL = "rea.admin@demo.ng";
export const REA_DEMO_PASSWORD = "REA2024!";

type ReaSessionPayload = {
  role: "rea";
  email: string;
  expiresAt: number;
};

function encodeBase64Url(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
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

export async function createReaSessionToken(
  secret: string,
  email = REA_DEMO_EMAIL,
  now = Date.now(),
) {
  const payload: ReaSessionPayload = {
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

export async function verifyReaSessionToken(
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
    ) as ReaSessionPayload;
    return (
      payload.role === "rea" &&
      payload.email === REA_DEMO_EMAIL &&
      payload.expiresAt > now
    );
  } catch {
    return false;
  }
}

export function cookieValue(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === REA_SESSION_COOKIE) return value.join("=");
  }
  return undefined;
}

export function reaSessionCookie(token: string, secure = true) {
  return `${REA_SESSION_COOKIE}=${token}; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=28800`;
}

export function clearReaSessionCookie(secure = true) {
  return `${REA_SESSION_COOKIE}=; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=0`;
}
