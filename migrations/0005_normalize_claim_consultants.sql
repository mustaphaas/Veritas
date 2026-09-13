-- Align seeded assigned claim records with active D1 consultant records.
UPDATE claims
SET consultant_id='con-001', consultant_firm='Supreme Way Nigeria Limited', allocation_status='Assigned'
WHERE source='demo' AND claim_id IN (
  'CLM-DARES-0004','CLM-DARES-0006','CLM-TEST-0008','CLM-TEST-0012','CLM-TEST-0016','CLM-TEST-0020','CLM-TEST-0024','CLM-TEST-0028'
);

UPDATE claims
SET consultant_id='con-002', consultant_firm='Meridian Energy Advisory', allocation_status='Assigned'
WHERE source='demo' AND claim_id IN (
  'CLM-DARES-0002','CLM-TEST-0010','CLM-TEST-0014','CLM-TEST-0018','CLM-TEST-0022','CLM-TEST-0026','CLM-TEST-0030'
);
