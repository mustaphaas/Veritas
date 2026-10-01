-- External/public demonstration site for validating the NASA VIIRS before/after pipeline.
-- This record is NOT an REA-verified portfolio project. It is deliberately labelled
-- as an external public demo so it can be selected on the Project Map and by Veritas
-- without being presented as an official REA verification record.
--
-- Public references:
-- - Babalola et al. (2022), Philosophical Transactions A:
--   Gbamu-Gbamu, Ijebu East, Ogun; 85 kW solar/diesel hybrid mini-grid;
--   community location approximately 6.845387 N, 4.214628 E; commissioned in 2018.
-- - Contemporary inauguration reporting: 9 February 2018.
--
-- VIIRS comparisons operate at monthly resolution, so commissioned_at is stored as
-- the first day of the documented commissioning month (February 2018).

INSERT OR IGNORE INTO projects (
  id,
  name,
  programme,
  component,
  contractor,
  consultant_firm,
  state,
  lga,
  community,
  latitude,
  longitude,
  geofence_radius_metres,
  created_at,
  updated_at,
  reporting_month,
  portfolio_status,
  installed_capacity_kw,
  households,
  verified,
  data_source,
  commissioned_at
) VALUES (
  'EXT-VIIRS-OGUN-GBAMU-001',
  'Gbamu-Gbamu Mini-Grid (External VIIRS Demo)',
  'Others',
  'Mini Grid',
  'Rubitec Solar Nigeria',
  'External Public Demo',
  'Ogun',
  'Ijebu East',
  'Gbamu-Gbamu',
  6.845387,
  4.214628,
  250,
  '2026-10-01T00:00:00.000Z',
  '2026-10-01T00:00:00.000Z',
  'February 2018',
  'External Demo',
  85,
  0,
  0,
  'external-public-viirs-demo',
  '2018-02-01'
);
