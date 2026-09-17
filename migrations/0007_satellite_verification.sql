-- Adds cached satellite-verification results to projects, populated by
-- Veritas AI (Gemini vision) interpreting Esri World Imagery centered on
-- each project's stored GPS coordinates. Cached rather than recomputed on
-- every map view; refreshed on demand via /api/projects/:id/satellite-verify.
ALTER TABLE projects ADD COLUMN satellite_verification_status TEXT;
ALTER TABLE projects ADD COLUMN satellite_image_quality TEXT;
ALTER TABLE projects ADD COLUMN satellite_verification_confidence REAL;
ALTER TABLE projects ADD COLUMN satellite_house_estimate INTEGER;
ALTER TABLE projects ADD COLUMN satellite_verification_notes TEXT;
ALTER TABLE projects ADD COLUMN satellite_verification_checked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_satellite_verification
  ON projects(satellite_verification_status, satellite_verification_checked_at);
