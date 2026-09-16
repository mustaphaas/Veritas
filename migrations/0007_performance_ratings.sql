PRAGMA foreign_keys = ON;

-- Numeric performance scores (REA staff, consultants, field officers) are
-- computed live from assignments/audit_events in worker/performance.js so
-- they never drift from the source workflow data. This table only caches
-- the AI-generated narrative explanation of a given score, since that is
-- expensive (LLM call) and should not be regenerated on every dashboard
-- load - a cached insight is reused until explicitly refreshed.
CREATE TABLE IF NOT EXISTS performance_ai_insights (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('field_officer','consultant','rea_staff')),
  entity_id TEXT NOT NULL,
  score REAL NOT NULL,
  summary TEXT NOT NULL,
  flags_json TEXT NOT NULL DEFAULT '[]',
  model TEXT,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_performance_insights_entity
  ON performance_ai_insights(entity_type, entity_id, generated_at DESC);
