import fs from "node:fs";

function replaceOnce(source, search, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  return source.replace(search, replacement);
}

// ---------------------------------------------------------------------------
// Worker: the /api/veritas AI chat endpoint had NO authentication check at
// all, despite the client only ever rendering the chat widget for
// session.role === "rea" (see VeritasGate in client/App.tsx). Any
// unauthenticated caller could POST to /api/veritas directly and:
//   1. get liveDatabaseContext(env) fed into the model's context -- every
//      consultant firm's projects, field officers, and assignments, unfiltered
//   2. drive the text-to-SQL analytics planner (worker/analytics.js), which
//      queries the projects/assignments/consultants/users tables with no
//      tenant scoping whatsoever
// This is a cross-tenant data exposure independent of, and larger than, the
// consultant-dashboard scoping gap. The fix: require authentication and
// restrict this endpoint to rea_admin, matching the product's actual intent.
// ---------------------------------------------------------------------------
const workerPath = "worker/index.js";
let worker = fs.readFileSync(workerPath, "utf8");

const oldRoute = `    if (url.pathname === "/api/veritas") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      try {
        return await veritasResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "veritas_request_failure",
          message: error instanceof Error ? error.message : "Unknown error",
          build: BUILD_ID,
        }));
        return json({ error: "Veritas is temporarily unavailable. Please try again shortly.", build: BUILD_ID }, 503);
      }
    }`;

const newRoute = `    if (url.pathname === "/api/veritas") {
      if (request.method !== "POST") return json({ error: "Method not allowed.", build: BUILD_ID }, 405);
      const veritasCaller = await authenticatedDatabaseUser(request, env);
      if (!veritasCaller) return json({ error: "Authentication required.", build: BUILD_ID }, 401);
      if (veritasCaller.role !== "rea_admin") return json({ error: "REA access required.", build: BUILD_ID }, 403);
      try {
        return await veritasResponse(request, env);
      } catch (error) {
        console.error(JSON.stringify({
          event: "veritas_request_failure",
          message: error instanceof Error ? error.message : "Unknown error",
          build: BUILD_ID,
        }));
        return json({ error: "Veritas is temporarily unavailable. Please try again shortly.", build: BUILD_ID }, 503);
      }
    }`;

worker = replaceOnce(worker, oldRoute, newRoute, "veritas endpoint auth gate");
fs.writeFileSync(workerPath, worker);

// ---------------------------------------------------------------------------
// Client: send the session's bearer token on Veritas chat requests so the
// now-authenticated endpoint accepts REA-admin calls from the widget. Reuses
// the same sessionStorage session shape as client/lib/field-api.ts.
// ---------------------------------------------------------------------------
const assistantPath = "client/components/VeritasAssistant.tsx";
let assistant = fs.readFileSync(assistantPath, "utf8");

if (!assistant.includes("function veritasSessionToken")) {
  assistant = replaceOnce(
    assistant,
    'import { useEffect, useMemo, useRef, useState } from "react";',
    `import { useEffect, useMemo, useRef, useState } from "react";

const VERITAS_SESSION_KEY = "rea-demo-session";
function veritasSessionToken(): string | undefined {
  try {
    const raw = window.sessionStorage.getItem(VERITAS_SESSION_KEY);
    return raw ? (JSON.parse(raw) as { apiToken?: string }).apiToken : undefined;
  } catch {
    return undefined;
  }
}`,
    "veritas session token helper",
  );
}

assistant = replaceOnce(
  assistant,
  `      const response = await fetch("/api/veritas", {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",`,
  `      const veritasToken = veritasSessionToken();
      const response = await fetch("/api/veritas", {
        method: "POST",
        signal: AbortSignal.timeout(60000),
        headers: {
          "Content-Type": "application/json",
          ...(veritasToken ? { Authorization: \`Bearer \${veritasToken}\` } : {}),
        },
        credentials: "same-origin",`,
  "veritas assistant authorization header",
);
fs.writeFileSync(assistantPath, assistant);

// Guardrails: fail deployment if the critical part did not land.
const checks = [
  [worker, "veritasCaller.role !== \"rea_admin\"", "veritas endpoint role gate"],
  [worker, "await authenticatedDatabaseUser(request, env);\n      if (!veritasCaller)", "veritas endpoint auth check"],
  [assistant, "function veritasSessionToken", "veritas assistant token helper"],
  [assistant, "veritasToken ? { Authorization:", "veritas assistant authorization header"],
];
for (const [source, needle, label] of checks) if (!source.includes(needle)) throw new Error(`${label} missing after patch`);

console.log("Applied Veritas AI endpoint authentication/authorization patch");
