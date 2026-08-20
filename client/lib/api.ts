import { getAppCheckHeader } from "./firebase-app-check";

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(await getAppCheckHeader()),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}

export async function firebasePasswordSignIn(email: string, password: string) {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY?.trim();
  if (!apiKey) throw new Error("Firebase authentication is not configured.");
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim(),
        password,
        returnSecureToken: true,
      }),
    },
  );
  const body = (await response.json().catch(() => ({}))) as {
    idToken?: string;
    error?: { message?: string };
  };
  if (!response.ok || !body.idToken) {
    throw new Error(
      "The email or password is incorrect, or the account is disabled.",
    );
  }
  return body.idToken;
}
