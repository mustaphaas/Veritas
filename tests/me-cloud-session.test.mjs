import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const auth = fs.readFileSync("client/lib/auth.tsx", "utf8");

test("cloud-backed REA sessions do not re-authorize against legacy local staff", () => {
  assert.match(auth, /if\(session\.role==="rea"\)\{[\s\S]*return \{\.\.\.session,path:reaStaffPath\(session\.roleLabel\)\};/);
  assert.doesNotMatch(auth, /if\(session\.role==="rea"\)\{[\s\S]*readReaStaff\(\)/);
});

test("REA cloud login does not prefer a local demo or stale staff record", () => {
  assert.match(auth, /const local=cloudRole==="rea"\?null:authenticateDemoAccount\(email,password\)/);
});
