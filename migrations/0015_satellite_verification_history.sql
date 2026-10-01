-- Durable append-only history for every satellite imagery verification.
-- The projects table continues to hold the latest cached result for fast map/chat
-- rendering, while this table preserves every completed verification over time.

CREATE TABLE IF NOT EXISTS satellite_verification_history (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT,
  actor_consultant_firm TEXT,
  run_status TEXT NOT NULL DEFAULT 'completed',
  verdict_status TEXT,
  model_status TEXT,
  image_quality TEXT,
  confidence REAL,
  estimated_nearby_houses INTEGER,
  notes TEXT,
  evidence_class TEXT,
  evidence_location TEXT,
  signature_strength TEXT,
  limitation_code TEXT,
  limitation_message TEXT,
  house_estimate_note TEXT,
  imagery_source TEXT,
  imagery_date TEXT,
  radius_metres REAL,
  analysis_method TEXT,
  analysis_version TEXT,
  image_url TEXT,
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_satellite_history_project_checked
  ON satellite_verification_history(project_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_satellite_history_verdict
  ON satellite_verification_history(verdict_status, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_satellite_history_run_status
  ON satellite_verification_history(run_status, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_satellite_history_imagery_date
  ON satellite_verification_history(imagery_date, checked_at DESC);

-- Preserve the currently cached/latest result for projects that were verified
-- before this history table existed. This creates one legacy history row per
-- project without inventing fields that were not previously stored.
INSERT OR IGNORE INTO satellite_verification_history (
  id,
  project_id,
  actor_id,
  actor_role,
  actor_consultant_firm,
  run_status,
  verdict_status,
  model_status,
  image_quality,
  confidence,
  estimated_nearby_houses,
  notes,
  evidence_class,
  evidence_location,
  signature_strength,
  limitation_code,
  limitation_message,
  house_estimate_note,
  imagery_source,
  imagery_date,
  radius_metres,
  analysis_method,
  analysis_version,
  image_url,
  checked_at
)
SELECT
  'legacy-' || p.id,
  p.id,
  NULL,
  NULL,
  NULL,
  'completed',
  p.satellite_verification_status,
  NULL,
  p.satellite_image_quality,
  p.satellite_verification_confidence,
  p.satellite_house_estimate,
  p.satellite_verification_notes,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  p.satellite_imagery_source,
  p.satellite_imagery_date,
  p.satellite_analysis_radius_metres,
  p.satellite_analysis_method,
  p.satellite_analysis_version,
  p.satellite_analysis_image_url,
  p.satellite_verification_checked_at
FROM projects p
WHERE p.satellite_verification_checked_at IS NOT NULL
  AND p.satellite_verification_status IS NOT NULL;
