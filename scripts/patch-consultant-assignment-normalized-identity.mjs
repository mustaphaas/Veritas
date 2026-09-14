import fs from 'node:fs';

const path = 'worker/field-api.js';
let source = fs.readFileSync(path, 'utf8');

const oldAssignedRecord = 'user.role === "consultant_admin" ? "AND p.consultant_firm=?" : ""';
const normalizedAssignedRecord = 'user.role === "consultant_admin" ? "AND lower(trim(p.consultant_firm))=lower(trim(?))" : ""';
if (source.includes(oldAssignedRecord)) {
  source = source.replace(oldAssignedRecord, normalizedAssignedRecord);
}

const oldListScope = 'if (user.role === "consultant_admin") { sql += " AND p.consultant_firm=?"; args.push(user.consultantFirm); }';
const normalizedListScope = 'if (user.role === "consultant_admin") { sql += " AND lower(trim(p.consultant_firm))=lower(trim(?))"; args.push(user.consultantFirm); }';
if (source.includes(oldListScope)) {
  source = source.replace(oldListScope, normalizedListScope);
}

if (!source.includes(normalizedAssignedRecord) || !source.includes(normalizedListScope)) {
  throw new Error('consultant assignment normalization anchors not found');
}

fs.writeFileSync(path, source);
console.log('Consultant assignment queries now use normalized consultant firm identity matching.');
