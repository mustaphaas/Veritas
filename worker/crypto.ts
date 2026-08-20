const encoder = new TextEncoder();
const PASSWORD_ALGORITHM = "PBKDF2-SHA256";
const PASSWORD_ITERATIONS = 210_000;
const PASSWORD_BYTES = 32;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      material,
      PASSWORD_BYTES * 8,
    ),
  );
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return [
    PASSWORD_ALGORITHM,
    String(PASSWORD_ITERATIONS),
    bytesToBase64Url(salt),
    bytesToBase64Url(derived),
  ].join("$");
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterationText, saltText, hashText, extra] =
    encoded.split("$");
  const iterations = Number(iterationText);
  if (
    algorithm !== PASSWORD_ALGORITHM ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    !saltText ||
    !hashText ||
    extra
  ) {
    return false;
  }
  try {
    const expected = base64UrlToBytes(hashText);
    const actual = await derivePassword(
      password,
      base64UrlToBytes(saltText),
      iterations,
    );
    return timingSafeBytesEqual(actual, expected);
  } catch {
    return false;
  }
}

export function randomToken(byteLength = 32) {
  return bytesToBase64Url(
    crypto.getRandomValues(new Uint8Array(byteLength)),
  );
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export function timingSafeBytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function timingSafeStringEqual(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([sha256(left), sha256(right)]);
  return timingSafeBytesEqual(
    encoder.encode(leftHash),
    encoder.encode(rightHash),
  );
}
