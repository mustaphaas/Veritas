-- Northern Nigeria public mini-grid sites for NASA VIIRS / satellite-analysis testing.
-- These records come from public NEMSA inspection submissions. They are deliberately
-- labelled External Demo and MUST NOT be presented as REA-verified portfolio records.
--
-- Provenance:
-- Matari: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1482019/
-- Gurin: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1462943/
-- Mantafyan: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1480738/
-- Toto: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1467329/
-- Fadama Bauna North: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1463636/
-- Ajuye: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1531702/
-- Alingani: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1531664/
-- Burum Burum: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1506941/
-- Okpatta: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1507210/
-- Ishugu: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1531720/
-- Tsohun Tunga: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1542728/
-- Udege Kasa: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1530354/
-- Bakin-Ciyawa: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1514026/
-- Yamini: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1500096/
-- Kuka-Mato: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1510729/
-- Kalong: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1479030/
-- Mararaba Demshin: https://nemsa.gov.ng/admin-request-for-inspection-rea-solar-mini-grid/entry/1504840/
--
-- commissioned_at is populated only when the NEMSA page explicitly gives the
-- mini-grid installation date. Missing dates remain NULL so VIIRS cannot invent
-- a before/after comparison month.

INSERT OR IGNORE INTO projects (
  id, name, programme, component, contractor, consultant_firm,
  state, lga, community, latitude, longitude, geofence_radius_metres,
  created_at, updated_at, reporting_month, portfolio_status,
  installed_capacity_kw, households, verified, data_source, commissioned_at
) VALUES
('EXT-VIIRS-KADUNA-MATARI-001','Matari Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','NXT GRID NIGERIA LIMITED','External Public Demo','Kaduna','Soba','Matari',10.939204,7.834163,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z','October 2023','External Demo',140,0,0,'nemsa-inspection:1482019','2023-10-13'),
('EXT-VIIRS-ADAMAWA-GURIN-001','Gurin Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Cloud Energy Photoelectric Limited','External Public Demo','Adamawa','Fufure','Gurin',9.222460,12.650760,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z','December 2022','External Demo',98,0,0,'nemsa-inspection:1462943','2022-12-18'),
('EXT-VIIRS-NIGER-MANTAFYAN-001','Mantafyan Mini-Grid (External VIIRS Demo)','Others','Mini Grid','Ochuvus Nigeria Limited','External Public Demo','Niger','Gbako','Mantafyan',9.375887,5.932237,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1480738',NULL),
('EXT-VIIRS-NASARAWA-TOTO-001','Toto Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','PowerGen Interconnected Energy Ltd','External Public Demo','Nasarawa','Toto','Toto',8.393569,7.088708,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z','December 2022','External Demo',352.24,0,0,'nemsa-inspection:1467329','2022-12-22'),
('EXT-VIIRS-NASARAWA-FADAMA-BAUNA-NORTH-001','Fadama Bauna North Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Husk Power Energy Systems','External Public Demo','Nasarawa','Lafia','Fadama Bauna North',8.756640,8.753256,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',50,0,0,'nemsa-inspection:1463636',NULL),
('EXT-VIIRS-NASARAWA-AJUYE-001','Ajuye Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Husk Power Energy Systems','External Public Demo','Nasarawa','Kokona','Ajuye',8.94183923,8.01309073,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1531702',NULL),
('EXT-VIIRS-NASARAWA-ALINGANI-001','Alingani Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Husk Power Energy Systems','External Public Demo','Nasarawa','Lafia','Alingani',8.717732,8.825547,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1531664',NULL),
('EXT-VIIRS-NASARAWA-BURUM-BURUM-001','Burum Burum Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Husk Power Energy Systems','External Public Demo','Nasarawa','Lafia','Burum Burum',8.527297,8.314025,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1506941',NULL),
('EXT-VIIRS-NASARAWA-OKPATTA-001','Okpatta Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Husk Power Energy Systems','External Public Demo','Nasarawa','Doma','Okpatta',8.023053,8.268607,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1507210',NULL),
('EXT-VIIRS-NASARAWA-ISHUGU-001','Ishugu Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Husk Power Energy Systems','External Public Demo','Nasarawa','Obi','Ishugu',8.378319,8.482696,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1531720',NULL),
('EXT-VIIRS-NASARAWA-TSOHUN-TUNGA-001','Tsohun Tunga Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Husk Power Energy Systems','External Public Demo','Nasarawa','Awe','Tsohun Tunga',8.060706,9.316827,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',54.2,0,0,'nemsa-inspection:1542728',NULL),
('EXT-VIIRS-NASARAWA-UDEGE-KASA-001','Udege Kasa Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Startimes Smart Energy Nig Ltd','External Public Demo','Nasarawa','Nasarawa','Udege Kasa',8.257625,7.895139,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',94,0,0,'nemsa-inspection:1530354',NULL),
('EXT-VIIRS-PLATEAU-BAKIN-CIYAWA-001','Bakin-Ciyawa Mini-Grid (External VIIRS Demo)','Others','Mini Grid','GVE Projects Ltd','External Public Demo','Plateau','Qua''an Pan','Bakin-Ciyawa',8.613080,9.292380,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',395,0,0,'nemsa-inspection:1514026',NULL),
('EXT-VIIRS-PLATEAU-YAMINI-001','Yamini Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','GVE Projects Ltd','External Public Demo','Plateau','Shendam','Yamini',8.523853,9.662053,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1500096',NULL),
('EXT-VIIRS-PLATEAU-KUKA-MATO-001','Kuka-Mato Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','GVE Projects Ltd','External Public Demo','Plateau','Shendam','Kuka-Mato',8.451500,9.692164,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z',NULL,'External Demo',0,0,0,'nemsa-inspection:1510729',NULL),
('EXT-VIIRS-PLATEAU-KALONG-001','Kalong Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Independent Energy Projects Finance Limited (Sienergy)','External Public Demo','Plateau','Shendam','Kalong',8.720100,9.511170,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z','September 2023','External Demo',97.2,0,0,'nemsa-inspection:1479030','2023-09-07'),
('EXT-VIIRS-PLATEAU-MARARABA-DEMSHIN-001','Mararaba Demshin Mini-Grid (External VIIRS Demo)','NEP','Mini Grid','Independent Energy Projects Finance Limited (Sienergy)','External Public Demo','Plateau','Qua''an Pan','Mararaba Demshin',8.801409,9.370891,250,'2026-10-01T12:55:00.000Z','2026-10-01T12:55:00.000Z','September 2023','External Demo',97.2,0,0,'nemsa-inspection:1504840','2023-09-07');
