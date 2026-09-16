import fs from "node:fs";

const targetPath = "scripts/patch-consultant-d1-tenancy.mjs";
const source = fs.readFileSync(targetPath, "utf8");
const legacyLine = 'auth = replaceOnce(auth, oldLogin, newLogin, "cloud-first login");';
const hardenedMarker = 'const compatibleLocal=local?.role===cloudRole?local:null;';
const guardedBlock = `if (!auth.includes(${JSON.stringify(hardenedMarker)})) {\n  auth = replaceOnce(auth, oldLogin, newLogin, "cloud-first login");\n}`;

if (source.includes(guardedBlock)) {
  process.exit(0);
}

if (!source.includes(legacyLine)) {
  throw new Error("consultant tenancy login anchor not found");
}

fs.writeFileSync(targetPath, source.replace(legacyLine, guardedBlock));
