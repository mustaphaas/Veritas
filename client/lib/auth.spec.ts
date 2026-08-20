import { afterEach, describe, expect, it, vi } from "vitest";
import { firebasePasswordSignIn } from "./api";

describe("Firebase password authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("exchanges credentials for an ID token without persisting it", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "public-test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ idToken: "firebase-id-token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      firebasePasswordSignIn(" user@example.com ", "Correct-Horse-1!"),
    ).resolves.toBe("firebase-id-token");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("accounts:signInWithPassword");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: "user@example.com",
      password: "Correct-Horse-1!",
      returnSecureToken: true,
    });
  });

  it("returns a generic error for rejected credentials", async () => {
    vi.stubEnv("VITE_FIREBASE_API_KEY", "public-test-key");
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: "EMAIL_NOT_FOUND" } }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          ),
        ),
    );

    await expect(
      firebasePasswordSignIn("user@example.com", "wrong"),
    ).rejects.toThrow("email or password is incorrect");
  });
});
