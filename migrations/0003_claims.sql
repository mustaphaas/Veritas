PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL UNIQUE,
  project_id TEXT,
  programme TEXT NOT NULL DEFAULT 'DARES',
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  community TEXT,
  latitude REAL,
  longitude REAL,
  contractor TEXT NOT NULL,
  claim_amount REAL NOT NULL DEFAULT 0 CHECK (claim_amount >= 0),
  claim_date TEXT,
  consultant_id TEXT,
  consultant_firm TEXT,
  allocation_status TEXT NOT NULL DEFAULT 'Unassigned' CHECK (allocation_status IN ('Assigned','Unassigned')),
  verification_status TEXT NOT NULL DEFAULT 'Uploaded',
  audit_status TEXT NOT NULL DEFAULT 'Pending',
  source TEXT NOT NULL DEFAULT 'import',
  source_reference TEXT NOT NULL,
  submitted_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, source_reference)
);

CREATE TABLE IF NOT EXISTS claim_events (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_value TEXT,
  to_value TEXT,
  actor_user_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_claims_consultant ON claims(consultant_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(verification_status);
CREATE INDEX IF NOT EXISTS idx_claims_allocation ON claims(allocation_status);
CREATE INDEX IF NOT EXISTS idx_claims_state ON claims(state);
CREATE INDEX IF NOT EXISTS idx_claims_contractor ON claims(contractor);
CREATE INDEX IF NOT EXISTS idx_claim_events_claim ON claim_events(claim_id, created_at);

-- Demo portfolio: deliberately contains both Assigned and Unassigned records.
INSERT OR IGNORE INTO claims
(id, claim_id, project_id, programme, state, lga, community, latitude, longitude, contractor, claim_amount, claim_date, consultant_id, consultant_firm, allocation_status, verification_status, audit_status, source, source_reference, submitted_date)
VALUES
('demo-claim-001','CLM-DARES-0001','DARES-KD-001','DARES','Kaduna','Chikun','Kujama',10.3331,7.4072,'Northern Solar Works Ltd',48500000,'2026-08-18',NULL,NULL,'Unassigned','Uploaded','Pending','demo','CLM-DARES-0001','2026-08-18'),
('demo-claim-002','CLM-DARES-0002','DARES-FC-014','DARES','FCT','Bwari','Kubwa',9.1538,7.3234,'SunGrid Nigeria Ltd',63250000,'2026-08-22',NULL,'DAN GOGO NIGERIA LIMITED','Assigned','Assigned for Verification','Pending','demo','CLM-DARES-0002','2026-08-22'),
('demo-claim-003','CLM-DARES-0003','DARES-KN-008','DARES','Kano','Dawakin Kudu','Dawakin Kudu',11.8373,8.5969,'Arewa Renewable Projects Ltd',51750000,'2026-08-25',NULL,NULL,'Unassigned','Uploaded','Flagged','demo','CLM-DARES-0003','2026-08-25'),
('demo-claim-004','CLM-DARES-0004','DARES-OG-021','DARES','Ogun','Abeokuta South','Ake',7.1475,3.3619,'Green Access Energy Ltd',79200000,'2026-08-29',NULL,'Supreme Nigeria Limited','Assigned','Consultant Reviewed','Reviewed','demo','CLM-DARES-0004','2026-08-29'),
('demo-claim-005','CLM-DARES-0005','DARES-PL-011','DARES','Plateau','Jos South','Bukuru',9.7939,8.8583,'Plateau Power Solutions Ltd',44100000,'2026-09-02',NULL,NULL,'Unassigned','Uploaded','Pending','demo','CLM-DARES-0005','2026-09-02'),
('demo-claim-006','CLM-DARES-0006','DARES-AN-005','DARES','Anambra','Awka South','Awka',6.2101,7.0741,'Eastern Mini Grid Ltd',88400000,'2026-09-05',NULL,'Supreme Nigeria Limited','Assigned','REA Verified','Verified','demo','CLM-DARES-0006','2026-09-05');
