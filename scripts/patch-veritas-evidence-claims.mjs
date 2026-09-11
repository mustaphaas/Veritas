import fs from 'node:fs';

const path = 'worker/index.js';
let s = fs.readFileSync(path, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-evidence-backed-claims-r1";');

const marker = `NUMERIC POLICY AND RECOMMENDATION RULES:\n`;
const block = `EVIDENCE AND CAUSALITY RULES:\n- Separate confirmed facts from interpretation. A database status, count, date, or missing record does not by itself prove the cause of that condition.\n- Never convert correlation, concentration, missing data, a status snapshot, or timing proximity into a causal or operational certainty unless the live Veritas data or an authoritative REA workflow rule explicitly supports it.\n- Do not state that a workflow is blocked, frozen, impossible to progress, delayed, inflated, unsupported, without oversight, without capacity, or dependent on a single entity unless the evidence explicitly establishes that claim.\n- Do not assume that a named bucket such as \"REA Unallocated\" is a consultant, contractor, or responsible delivery entity unless the data model explicitly identifies it that way. Treat it as an allocation/status category if that is all the context establishes.\n- Do not assume that a pending consultant activation means a region lacks active oversight, or that reassignment is feasible, unless current assignments, coverage and authority data prove it.\n- Do not assume that zero visible evidence records means evidence does not exist elsewhere or that submission is impossible. Say that no evidence records are visible in the available Veritas dataset and recommend checking field activity, evidence capture, sync or recording status as appropriate.\n- When the evidence supports concern but not causation, use disciplined wording such as \"may indicate\", \"creates a management risk\", \"warrants review\", or \"the available data does not establish the cause\".\n- Recommendations must follow from confirmed findings and should avoid asserting authority, feasibility, resource availability or mandatory workflow conditions that are not explicitly present in the context.\n\n`;

if (!s.includes(block)) {
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error('numeric guardrail marker not found');
  s = s.slice(0, idx) + block + s.slice(idx);
}

fs.writeFileSync(path, s);
console.log('Applied evidence and causality guardrails');
