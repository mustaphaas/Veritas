PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('rea', 'consultant', 'field')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  zone TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  password_changed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX users_role_status_idx ON users(role, status);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ip_hash TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT ''
);

CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

CREATE TABLE auth_attempts (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL
);

CREATE TABLE contractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  programme TEXT NOT NULL,
  component TEXT NOT NULL,
  contractor_id TEXT REFERENCES contractors(id) ON DELETE SET NULL,
  contractor_name TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL,
  lga TEXT NOT NULL,
  community TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  capacity_kw REAL NOT NULL DEFAULT 0,
  households INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Planned',
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX projects_state_programme_idx ON projects(state, programme);
CREATE INDEX projects_contractor_idx ON projects(contractor_id);

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  officer_user_id TEXT NOT NULL REFERENCES users(id),
  due_date TEXT NOT NULL,
  geofence_radius INTEGER NOT NULL DEFAULT 250,
  status TEXT NOT NULL DEFAULT 'Assigned' CHECK (status IN ('Assigned', 'En route', 'Arrived', 'Draft', 'Submitted', 'Approved', 'Verified', 'Rejected', 'Re-inspection')),
  route_started_at TEXT,
  arrival_latitude REAL,
  arrival_longitude REAL,
  arrival_at TEXT,
  arrival_distance INTEGER,
  sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'queued')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX assignments_officer_status_idx ON assignments(officer_user_id, status);
CREATE INDEX assignments_project_idx ON assignments(project_id);

CREATE TABLE inspection_reports (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE REFERENCES assignments(id) ON DELETE CASCADE,
  assigned_component TEXT NOT NULL,
  component_values TEXT NOT NULL DEFAULT '{}',
  inspected_at TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  inspector TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_type TEXT NOT NULL,
  asset_code TEXT NOT NULL DEFAULT '',
  report_data TEXT NOT NULL DEFAULT '{}',
  community_signature TEXT,
  contractor_signature TEXT,
  submitted_at TEXT,
  consultant_review_note TEXT,
  consultant_reviewed_at TEXT,
  rea_review_note TEXT,
  rea_reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE evidence (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  captured_at TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  inspector TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX evidence_report_idx ON evidence(report_id);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  device_id TEXT NOT NULL DEFAULT '',
  device_type TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX audit_assignment_idx ON audit_log(assignment_id, created_at);
