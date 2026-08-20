import { ApiError } from "./http";

const encoder = new TextEncoder();
const PASSWORD_ITERATIONS = 210_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function sha256(value: string): Promise<string> {
  return bytesToBase64(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function hashPassword(password: string, salt?: Uint8Array): Promise<{
  salt: string;
  hash: string;
  iterations: number;
}> {
  if (password.length < 12 || password.length > 256) {
    throw new ApiError(400, "Password must be between 12 and 256 characters.", "weak_password");
  }
  const actualSalt = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(actualSalt).buffer, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return {
    salt: bytesToBase64(actualSalt),
    hash: bytesToBase64(new Uint8Array(result)),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
  iterations: number,
): Promise<boolean> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const decodedSalt = base64ToBytes(salt);
  const result = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(decodedSalt).buffer, iterations },
    key,
    256,
  ));
  const expected = base64ToBytes(expectedHash);
  if (result.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < result.length; index += 1) mismatch |= result[index] ^ expected[index];
  return mismatch === 0;
}

export function randomToken(bytes = 32): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

export function sessionCookie(token: string, maxAge: number): string {
  return `veritas_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearSessionCookie(): string {
  return "veritas_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

export function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") || "";
  for (const pair of raw.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
