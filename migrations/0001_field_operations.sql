PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('field_officer','consultant_admin','rea_admin')),
  consultant_firm TEXT,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  programme TEXT NOT NULL,
  component TEXT NOT NULL,
  contractor TEXT NOT NULL,
  consultant_firm TEXT NOT NULL,
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  community TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  geofence_radius_metres INTEGER NOT NULL DEFAULT 250,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  officer_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Assigned',
  due_date TEXT NOT NULL,
  arrival_json TEXT,
  report_json TEXT,
  form_hash TEXT,
  signature_hash TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  verified_at TEXT,
  locked_at TEXT,
  sync_revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo','video')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  assignment_id TEXT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details_json TEXT NOT NULL,
  ip_address TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_assignments_officer ON assignments(officer_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_assignments_project ON assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_audit_assignment ON audit_events(assignment_id, created_at);

INSERT OR IGNORE INTO users VALUES
('officer-amina-yusuf','Amina Yusuf','field.officer@demo.ng','08030001001','field_officer','Supreme Way','v+YDZr8qgOZhHMWq5eP+eg==','Kq8gyTmHsv6pnLdr+8uLz4py+KJvhFAb9wtxR4u97T4=','active','2026-01-05T09:00:00.000Z'),
('officer-mustapha-aliyu','Mustapha Aliyu',NULL,'08093822087','field_officer','Supreme Way','eYNKA0vls6Zk4n8LD36AHA==','lWX9W0BTwYvqs+UjovqLkWp0Lv9023aOJ+ApZHKZ/hA=','active','2026-09-10T00:00:00.000Z'),
('consultant-supreme-way','Ibrahim Musa','consultant.admin@demo.ng',NULL,'consultant_admin','Supreme Way','E2P/8Tvm9J6KTXaf56vW9Q==','T295ryxuwv6tTIflgBKMYHAmOMHJJGmQqxCqpEQnAa0=','active','2026-01-05T09:00:00.000Z'),
('rea-admin','REA Administrator','rea.admin@demo.ng',NULL,'rea_admin',NULL,'ucYzz/R0eUS+D37d9gLOHQ==','jbvYnX4C2v8mXoeyNEaPuWDJkrCPYE4lmboWJUp7eoE=','active','2026-01-05T09:00:00.000Z');

INSERT OR IGNORE INTO projects VALUES
('FCT-MG-DURUMI-001','Durumi Solar Mini Grid Demo','DARES','Mini Grid','Veritas Demo Contractor','Supreme Way','FCT','Abuja Municipal Area Council','Durumi',9.0232043,7.4518017,250,'2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z');

INSERT OR IGNORE INTO assignments VALUES
('REA-FCT-MG-DEMO-001','FCT-MG-DURUMI-001','officer-mustapha-aliyu','Assigned','2026-09-11T17:00:00.000Z',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,1,'2026-09-10T00:00:00.000Z','2026-09-10T00:00:00.000Z');
