PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS satellite_analysis_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  requested_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  analysis_type TEXT NOT NULL CHECK (analysis_type IN ('current','historical_compare')),
  provider TEXT NOT NULL,
  latitude_used REAL NOT NULL,
  longitude_used REAL NOT NULL,
  footprint_json TEXT,
  baseline_image_date TEXT,
  comparison_image_date TEXT,
  baseline_release_date TEXT,
  comparison_release_date TEXT,
  baseline_source_ref TEXT,
  comparison_source_ref TEXT,
  quality_json TEXT,
  observations_json TEXT,
  change_json TEXT,
  confidence_score REAL,
  confidence_level TEXT,
  review_required INTEGER NOT NULL DEFAULT 0,
  review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed','accepted','needs_followup','dismissed')),
  reviewed_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_note TEXT,
  model_provider TEXT,
  model_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_satellite_analysis_project_time
  ON satellite_analysis_runs(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_satellite_analysis_review
  ON satellite_analysis_runs(review_status, review_required, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_satellite_analysis_requested_user
  ON satellite_analysis_runs(requested_by_user_id, created_at DESC);
