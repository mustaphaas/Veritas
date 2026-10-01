-- External/public Mokoloki mini-grid site for validating the NASA VIIRS
-- before/after pipeline and satellite verification.
--
-- This is NOT an REA-verified project record. It is intentionally labelled
-- as an external public demo so Veritas can analyse the public site without
-- presenting it as an official REA portfolio verification.
--
-- Public evidence:
-- - RMI: Mokoloki, Ogun State; Nayo Tropical Technology / IBEDC / community;
--   initial 100 kW generation; online in February 2020.
-- - World Bank: the Mokoloki mini-grid became operational in February 2020.
-- - Public OSM-backed power-station mapping places the plant at approximately
--   6.88640 N, 3.38401 E. This is a public mapped plant point, not an official
--   REA survey coordinate.
--
-- VIIRS comparisons are monthly, so commissioned_at uses the first day of the
-- documented commissioning month.

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
  'EXT-VIIRS-OGUN-MOKOLOKI-001',
  'Mokoloki Mini-Grid (External VIIRS Demo)',
  'Others',
  'Mini Grid',
  'Nayo Tropical Technology',
  'External Public Demo',
  'Ogun',
  'Obafemi-Owode',
  'Mokoloki',
  6.88640,
  3.38401,
  250,
  '2026-10-01T00:00:00.000Z',
  '2026-10-01T00:00:00.000Z',
  'February 2020',
  'External Demo',
  100,
  0,
  0,
  'external-public-viirs-demo',
  '2020-02-01'
);
