import { describe, expect, it } from "vitest";

import { fieldApiTest, handleFieldApi } from "./field-api.js";

describe("Cloudflare field operations API", () => {
  it("ignores non-field routes and protects unbound deployments", async () => {
    await expect(handleFieldApi(new Request("https://veritas.test/api/version"), {})).resolves.toBeNull();
    const response = await handleFieldApi(new Request("https://veritas.test/api/field/assignments"), {});
    expect(response?.status).toBe(503);
  });

  it("uses the same 250 metre geofence calculation as the clients", () => {
    expect(fieldApiTest.distanceMetres(9.0232043, 7.4518017, 9.0233, 7.4518)).toBeLessThan(250);
    expect(fieldApiTest.distanceMetres(9.0232043, 7.4518017, 9.03, 7.4518)).toBeGreaterThan(250);
  });

  it("verifies PBKDF2 credentials without storing a plaintext password", async () => {
    await expect(fieldApiTest.verifyPassword("siddiqa12", "eYNKA0vls6Zk4n8LD36AHA==", "lWX9W0BTwYvqs+UjovqLkWp0Lv9023aOJ+ApZHKZ/hA=")).resolves.toBe(true);
    await expect(fieldApiTest.verifyPassword("wrong", "eYNKA0vls6Zk4n8LD36AHA==", "lWX9W0BTwYvqs+UjovqLkWp0Lv9023aOJ+ApZHKZ/hA=")).resolves.toBe(false);
  });
});
