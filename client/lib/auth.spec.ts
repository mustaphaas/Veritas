import { describe, expect, it } from "vitest";
import {
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from "../../worker/crypto";

describe("backend authentication primitives", () => {
  it("hashes passwords with a unique salt and verifies the right value", async () => {
    const first = await hashPassword("Secure-Password-2026!");
    const second = await hashPassword("Secure-Password-2026!");

    expect(first).not.toBe(second);
    await expect(verifyPassword("Secure-Password-2026!", first)).resolves.toBe(
      true,
    );
    await expect(verifyPassword("wrong-password", first)).resolves.toBe(false);
  });

  it("creates opaque session tokens that are stored only as hashes", async () => {
    const token = randomToken();
    const digest = await sha256(token);

    expect(token.length).toBeGreaterThan(32);
    expect(digest).not.toBe(token);
    expect(await sha256(token)).toBe(digest);
  });
});
