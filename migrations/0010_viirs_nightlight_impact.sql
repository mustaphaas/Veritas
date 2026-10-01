-- NASA VIIRS Black Marble night-time light impact analysis.
-- Results are computed outside the request path and stored here so Project Map
-- and Veritas chat answer from the same measured data.

ALTER TABLE projects ADD COLUMN commissioned_at TEXT;

CREATE TABLE IF NOT EXISTS project_nightlight_impacts (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  commissioning_date TEXT NOT NULL,
  date_basis TEXT NOT NULL,
  radius_metres INTEGER NOT NULL DEFAULT 2000,
  control_inner_metres INTEGER NOT NULL DEFAULT 3000,
  control_outer_metres INTEGER NOT NULL DEFAULT 5000,
  before_start TEXT,
  before_end TEXT,
  after_start TEXT,
  after_end TEXT,
  baseline_radiance REAL,
  after_radiance REAL,
  radiance_delta REAL,
  percent_change REAL,
  control_baseline_radiance REAL,
  control_after_radiance REAL,
  control_percent_change REAL,
  differential_percentage_points REAL,
  months_before INTEGER NOT NULL DEFAULT 0,
  months_after INTEGER NOT NULL DEFAULT 0,
  impact_class TEXT NOT NULL DEFAULT 'insufficient_data',
  data_quality TEXT NOT NULL DEFAULT 'insufficient',
  series_json TEXT NOT NULL DEFAULT '[]',
  before_grid_json TEXT,
  after_grid_json TEXT,
  source_product TEXT NOT NULL DEFAULT 'VNP46A3.002',
  source_name TEXT NOT NULL DEFAULT 'NASA VIIRS Black Marble',
  source_url TEXT NOT NULL DEFAULT 'https://ladsweb.modaps.eosdis.nasa.gov/missions-and-measurements/products/VNP46A3',
  analysis_method TEXT NOT NULL DEFAULT 'monthly-median-v1',
  checked_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nightlight_impact_class
  ON project_nightlight_impacts(impact_class, checked_at);
CREATE INDEX IF NOT EXISTS idx_nightlight_checked_at
  ON project_nightlight_impacts(checked_at);
