-- Refine the Gbamu-Gbamu external VIIRS demo to the publicly mapped
-- power-station point rather than the broader community centroid.
-- Public OSM-backed mapping: approximately 6.84746 N, 4.21247 E.

UPDATE projects
SET latitude = 6.84746,
    longitude = 4.21247,
    updated_at = '2026-10-01T00:00:00.000Z'
WHERE id = 'EXT-VIIRS-OGUN-GBAMU-001'
  AND data_source = 'external-public-viirs-demo';
