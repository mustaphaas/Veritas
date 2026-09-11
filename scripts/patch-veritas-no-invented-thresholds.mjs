import fs from 'node:fs';

const path = 'worker/index.js';
let s = fs.readFileSync(path, 'utf8');

s = s.replace(/const BUILD_ID = "[^"]+";/, 'const BUILD_ID = "veritas-2026-09-11-no-invented-thresholds-r1";');

const marker = `The workflow is authoritative: Field Officer submits -> Consultant Admin approves or requests re-inspection -> REA approves and verifies or rejects for re-inspection. A report is final only when its assignment status is Verified.\n\n`;
const guardrail = `NUMERIC POLICY AND RECOMMENDATION RULES:\n- Never invent a target, threshold, deadline, SLA, cutoff, quota, percentage, time window, minimum evidence count, workload share, or escalation interval.\n- A numeric management target may be stated only when that exact target is present in the authoritative Veritas context, explicitly supplied by the user, or identified as an established REA rule in the available source material.\n- Do not turn an observed database value into a recommended threshold. For example, do not recommend \"raise verification above 75%\", \"reduce unallocated projects below 40%\", \"escalate within 48 hours\", or any similar number unless that number is explicitly supported.\n- You may calculate and report descriptive values from authoritative data, including counts, totals, percentages, rates, differences and rankings, but clearly treat them as current observations rather than policy targets.\n- When a management threshold would be useful but none is supplied, say \"set a management-approved target\", \"prioritise approaching due dates\", or recommend that management define the threshold; do not choose the number yourself.\n- Recommendations must be traceable to confirmed findings. Do not claim an operational constraint, blocked workflow, required evidence minimum, resource availability, consultant capacity, or reassignment feasibility unless the context supports it.\n\n`;

if (!s.includes(guardrail)) {
  if (!s.includes(marker)) throw new Error('workflow prompt marker not found');
  s = s.replace(marker, marker + guardrail);
}

fs.writeFileSync(path, s);
console.log('Applied no-invented-thresholds guardrail');
