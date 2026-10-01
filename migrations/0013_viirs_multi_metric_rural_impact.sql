-- VIIRS multi-metric rural electrification analysis (v2).
-- Adds a tighter 1 km project core and high-percentile/mean radiance metrics so
-- small rural electrification projects are not evaluated only by a 2 km median.

ALTER TABLE project_nightlight_impacts ADD COLUMN core_radius_metres INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_baseline_radiance REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_after_radiance REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_radiance_delta REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_percent_change REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_mean_baseline_radiance REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_mean_after_radiance REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_p90_baseline_radiance REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_p90_after_radiance REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN core_p90_percent_change REAL;
ALTER TABLE project_nightlight_impacts ADD COLUMN detection_metric TEXT;
ALTER TABLE project_nightlight_impacts ADD COLUMN detection_reason TEXT;
