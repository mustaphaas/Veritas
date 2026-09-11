import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workerSource = fs.readFileSync(new URL("../worker/index.js", import.meta.url), "utf8");
const auditUiSource = fs.readFileSync(new URL("../client/components/ReaAuditTrail.tsx", import.meta.url), "utf8");

test("REA Audit Trail is served from the authenticated D1 audit_events feed", () => {
  assert.match(workerSource, /\/api\/rea\/audit-trail/);
  assert.match(workerSource, /FROM audit_events ae/);
  assert.match(workerSource, /ae\.ip_address AS ipAddress/);
  assert.match(workerSource, /ORDER BY ae\.created_at DESC/);
  assert.match(auditUiSource, /fetchReaAuditTrail/);
  assert.doesNotMatch(auditUiSource, /readAuditEvents/);
});

test("REA Audit Trail keeps its existing search, category filter and CSV export controls", () => {
  assert.match(auditUiSource, /const \[query,setQuery\]=useState/);
  assert.match(auditUiSource, /const \[category,setCategory\]=useState/);
  assert.match(auditUiSource, /const exportCsv=/);
  assert.match(auditUiSource, /Export audit log/);
});

const fieldApiSource = fs.readFileSync(new URL("../worker/field-api.js", import.meta.url), "utf8");
const authSource = fs.readFileSync(new URL("../client/lib/auth.tsx", import.meta.url), "utf8");

test("authentication audit events are authoritative in D1 without browser duplicates", () => {
  assert.match(fieldApiSource, /audit\(env,\s*request,\s*user,\s*null,\s*"login"/);
  assert.match(fieldApiSource, /audit\(env,\s*request,\s*user,\s*null,\s*"logout"/);
  assert.doesNotMatch(authSource, /appendAuditEvent/);
});
