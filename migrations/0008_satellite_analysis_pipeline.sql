-- Stores the analytical provenance for satellite checks without changing project/map behavior.
ALTER TABLE projects ADD COLUMN satellite_imagery_source TEXT;
ALTER TABLE projects ADD COLUMN satellite_imagery_date TEXT;
ALTER TABLE projects ADD COLUMN satellite_analysis_radius_metres REAL;
ALTER TABLE projects ADD COLUMN satellite_analysis_method TEXT;
ALTER TABLE projects ADD COLUMN satellite_analysis_image_url TEXT;
ALTER TABLE projects ADD COLUMN satellite_analysis_version TEXT;
