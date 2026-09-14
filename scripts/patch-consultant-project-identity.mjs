import fs from 'node:fs';

const path = 'worker/claims-api.js';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(search, replacement, label) {
  if (source.includes(replacement)) return;
  if (!source.includes(search)) throw new Error(`${label} anchor not found`);
  source = source.replace(search, replacement);
}

replaceOnce(
  "return env.DB.prepare(`SELECT u.id,u.role,u.consultant_firm AS consultantFirm FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`)",
  "return env.DB.prepare(`SELECT u.id,u.role,u.consultant_firm AS consultantFirm,(SELECT c.id FROM consultants c WHERE lower(trim(c.firm_name))=lower(trim(u.consultant_firm)) LIMIT 1) AS consultantId FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'`)",
  'authenticated consultant identity',
);

replaceOnce(
  "  let consultantFirm = user.consultantFirm;\n  if (user.role === 'rea_admin') consultantFirm = new URL(request.url).searchParams.get('consultantFirm') || consultantFirm;\n  if (!consultantFirm) return json({ error: 'Consultant firm is required.' }, 400);",
  "  let consultantFirm = user.consultantFirm;\n  let consultantId = user.consultantId || null;\n  if (user.role === 'rea_admin') {\n    consultantFirm = new URL(request.url).searchParams.get('consultantFirm') || consultantFirm;\n    if (consultantFirm) {\n      const consultant = await env.DB.prepare(`SELECT id,firm_name AS firmName FROM consultants WHERE lower(trim(firm_name))=lower(trim(?)) LIMIT 1`).bind(consultantFirm).first();\n      if (consultant) { consultantId = consultant.id; consultantFirm = consultant.firmName; }\n    }\n  }\n  if (!consultantFirm) return json({ error: 'Consultant firm is required.' }, 400);",
  'consultant identity resolution',
);

replaceOnce(
  "      FROM projects WHERE consultant_firm=? ORDER BY state,name`).bind(consultantFirm).all(),",
  "      FROM projects WHERE lower(trim(consultant_firm))=lower(trim(?)) ORDER BY state,name`).bind(consultantFirm).all(),",
  'normalized canonical project ownership',
);

replaceOnce(
  "      FROM claims WHERE consultant_firm=? AND allocation_status='Assigned' ORDER BY state,claim_id`).bind(consultantFirm).all(),",
  "      FROM claims WHERE allocation_status='Assigned' AND (consultant_id=? OR lower(trim(consultant_firm))=lower(trim(?))) ORDER BY state,claim_id`).bind(consultantId, consultantFirm).all(),",
  'stable claim consultant ownership',
);

fs.writeFileSync(path, source);
console.log('Consultant project ownership now resolves by stable consultant identity with normalized firm fallback.');
