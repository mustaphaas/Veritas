-- Add database-backed sample projects for programmes that were previously
-- represented only by hard-coded Programme Performance rows.
-- INSERT OR IGNORE keeps this migration safe to re-run.

PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO projects
(id,name,programme,component,contractor,consultant_firm,state,lga,community,latitude,longitude,geofence_radius_metres,created_at,updated_at,reporting_month,portfolio_status,installed_capacity_kw,households,verified,data_source)
VALUES
('DEMO-EEP-FCT-001','University of Abuja Solar Hybrid Project','EEP','Energizing Education','SunVolt Nigeria','REA Unallocated','FCT','Gwagwalada','University of Abuja',8.9800,7.1800,250,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','September 2026','Verified',5200,4200,1,'demo-programme-performance'),
('DEMO-EEP-KANO-001','Bayero University Solar Power Project','EEP','Energizing Education','NorthGrid EPC','Supreme Way Nigeria Limited','Kano','Kano Municipal','Bayero University',11.9800,8.4800,250,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','September 2026','Verified',4800,3900,1,'demo-programme-performance'),
('DEMO-EEP-ENUGU-001','University of Nigeria Solar Campus Project','EEP','Energizing Education','GreenTech Ltd','GreenField Technical Partners','Enugu','Nsukka','University of Nigeria Nsukka',6.8600,7.4100,250,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','September 2026','Submitted',3600,3100,0,'demo-programme-performance'),
('DEMO-NPSSI-FCT-001','Federal Secretariat Solarization Project','NPSSI','Public Sector Solarization','Apex Power Works','Meridian Energy Advisory','FCT','Abuja Municipal','Federal Secretariat',9.0600,7.4900,250,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','September 2026','Verified',4100,2800,1,'demo-programme-performance'),
('DEMO-NPSSI-LAGOS-001','Federal Public Complex Lagos Solarization','NPSSI','Public Sector Solarization','SunVolt Nigeria','REA Unallocated','Lagos','Ikeja','Federal Public Complex Ikeja',6.6000,3.3500,250,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','September 2026','Pending',3900,2600,0,'demo-programme-performance'),
('DEMO-NPSSI-KADUNA-001','Federal Offices Kaduna Solarization','NPSSI','Public Sector Solarization','NorthGrid EPC','Supreme Way Nigeria Limited','Kaduna','Kaduna North','Federal Offices Kaduna',10.5400,7.4400,250,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z','September 2026','Verified',3300,2400,1,'demo-programme-performance');
