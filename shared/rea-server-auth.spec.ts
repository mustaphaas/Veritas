import { describe, expect, it } from "vitest";
import {
  cookieValue,
  createReaSessionToken,
  REA_DEMO_EMAIL,
  reaSessionCookie,
  verifyReaSessionToken,
} from "./rea-server-auth";

const secret = "a-demo-secret-that-is-at-least-32-characters-long";

describe("REA server session", () => {
  it("creates and verifies a signed REA session", async () => {
    const now = Date.parse("2026-08-20T10:00:00.000Z");
    const token = await createReaSessionToken(secret, REA_DEMO_EMAIL, now);
    expect(await verifyReaSessionToken(token, secret, now + 1_000)).toBe(true);
  });

  it("rejects tampered and expired sessions", async () => {
    const now = Date.parse("2026-08-20T10:00:00.000Z");
    const token = await createReaSessionToken(secret, REA_DEMO_EMAIL, now);
    expect(await verifyReaSessionToken(`${token}x`, secret, now)).toBe(false);
    expect(
      await verifyReaSessionToken(token, secret, now + 9 * 60 * 60 * 1_000),
    ).toBe(false);
  });

  it("stores the signed token in an HTTP-only cookie", async () => {
    const token = await createReaSessionToken(secret);
    const cookie = reaSessionCookie(token);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookieValue(cookie)).toBe(token);
  });
});
