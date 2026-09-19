import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reaVerification = fs.readFileSync('client/components/ReaVerificationManagement.tsx', 'utf8');
const consultantDashboard = fs.readFileSync('client/pages/ConsultantAdminDashboard.tsx', 'utf8');

test('REA verification exposes its inspection report viewer for shared read-only use', () => {
  assert.match(reaVerification, /export function openReaVerificationReport\(assignment: InspectionAssignment, print = false\)/);
});

test('verified consultant records open the shared REA verification report instead of the consultant review modal', () => {
  assert.match(consultantDashboard, /import \{ openReaVerificationReport \} from "\.\.\/components\/ReaVerificationManagement"/);
  assert.match(consultantDashboard, /if \(item\.status === "Verified"\) \{\s*openReaVerificationReport\(item\);\s*return;\s*\}/);
});

test('consultant review modal remains reserved for consultant-review states', () => {
  assert.match(consultantDashboard, /item\.status === "Submitted"[\s\S]*setReviewAssignment\(item\)/);
});
