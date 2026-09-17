PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inspection_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  team_lead_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inspection_team_members (
  team_id TEXT NOT NULL REFERENCES inspection_teams(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE IF NOT EXISTS collaborative_inspections (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES inspection_teams(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft','In Progress','Submitted','Re-inspection','Approved','Verified')),
  due_date TEXT,
  form_json TEXT NOT NULL DEFAULT '{}',
  section_assignments_json TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  last_saved_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  locked_at TEXT,
  UNIQUE (team_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_inspection_teams_lead ON inspection_teams(team_lead_id);
CREATE INDEX IF NOT EXISTS idx_inspection_members_user ON inspection_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_collab_inspections_team ON collaborative_inspections(team_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_collab_inspections_project ON collaborative_inspections(project_id);

INSERT OR IGNORE INTO inspection_teams
(id,name,team_lead_id,status,created_at,updated_at)
VALUES
('team-demo-northwest','North-West Inspection Team 01','rea-admin','Active','2026-09-17T09:00:00.000Z','2026-09-17T09:00:00.000Z');

INSERT OR IGNORE INTO inspection_team_members(team_id,user_id,created_at)
VALUES ('team-demo-northwest','rea-admin','2026-09-17T09:00:00.000Z');
