-- Seed the full Veritas demo portfolio into Cloudflare D1.
-- This migration keeps live-created records intact and adds database fields
-- needed by the dashboard/Gemini reporting layer.

PRAGMA foreign_keys = ON;

ALTER TABLE projects ADD COLUMN reporting_month TEXT;
ALTER TABLE projects ADD COLUMN portfolio_status TEXT;
ALTER TABLE projects ADD COLUMN installed_capacity_kw REAL NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN households INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN data_source TEXT NOT NULL DEFAULT 'field';

CREATE TABLE IF NOT EXISTS consultants (
  id TEXT PRIMARY KEY,
  firm_name TEXT NOT NULL UNIQUE,
  admin_name TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  admin_phone TEXT,
  regions_json TEXT NOT NULL DEFAULT '[]',
  states_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  engagement_ref TEXT,
  scope_note TEXT,
  engagement_start TEXT,
  engagement_end TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

UPDATE users SET consultant_firm='Supreme Way Nigeria Limited'
WHERE consultant_firm='Supreme Way';
UPDATE projects SET consultant_firm='Supreme Way Nigeria Limited'
WHERE consultant_firm='Supreme Way';

INSERT OR REPLACE INTO consultants
(id,firm_name,admin_name,admin_email,admin_phone,regions_json,states_json,status,engagement_ref,scope_note,engagement_start,engagement_end,created_at,updated_at)
VALUES
('con-001','Supreme Way Nigeria Limited','Tunde Oyelaran','admin@oyelaran.ng','0803 145 2190','["North West"]','["Kano","Kaduna","Katsina","Jigawa"]','Active','REA/CONS/2026/001','Independent verification and QA support for DARES sites.','2026-01-15','2026-12-31','2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z'),
('con-002','Meridian Energy Advisory','Aisha Lawal','aisha@meridianenergy.ng','0806 220 4188','["North Central"]','["Niger","Kwara","Kogi","Nasarawa","FCT"]','Active','REA/CONS/2026/004','Verification oversight for grid extension and mini-grid projects.','2026-02-01','2027-01-31','2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z'),
('con-003','GreenField Technical Partners','Ngozi Eze','ngozi@greenfieldtp.ng','0805 711 3094','["South East","South South"]','["Abia","Anambra","Enugu","Imo","Rivers","Delta"]','Pending Activation','REA/CONS/2026/009','New consultant mobilisation pending credential activation.','2026-09-01',NULL,'2026-09-11T00:00:00.000Z','2026-09-11T00:00:00.000Z');

INSERT OR IGNORE INTO users
(id,name,email,phone,role,consultant_firm,password_salt,password_hash,status,created_at)
VALUES
('officer-chinedu-okafor','Chinedu Okafor','chinedu.okafor@demo.ng','08030001002','field_officer','Supreme Way Nigeria Limited','H1Kr2Eyphz6Mu5rOPaf4mQ==','RDhMQNeJC4/hnmGPydjipge8cVSz1p3EQ8S4c1PFSBg=','active','2026-01-06T09:00:00.000Z'),
('officer-fatima-bello','Fatima Bello','fatima.bello@demo.ng','08030001003','field_officer','Supreme Way Nigeria Limited','0QYyHW4Pd4FkxQjl7udNBw==','EfvKXh0aHUDDqJdYzNTSdXqzvK5OOOtLqwMObBI5PYE=','active','2026-01-07T09:00:00.000Z'),
('officer-tunde-adebayo','Tunde Adebayo','tunde.adebayo@demo.ng','08030001004','field_officer','Supreme Way Nigeria Limited','F54l0wO+aAfpBjG1RuefSQ==','y/ECmw0a7OWOLmQ4qQRebGgmMUxtZnRuoVrxY435VN0=','active','2026-01-08T09:00:00.000Z'),
('consultant-tunde-oyelaran','Tunde Oyelaran','admin@oyelaran.ng',NULL,'consultant_admin','Supreme Way Nigeria Limited','iXHjIK7QD3WnT9i7JWDoIA==','JDO2UR3WP52F/sFcreCIl1UvZgkOCpeJjO6Zs0X49jU=','active','2026-01-15T09:00:00.000Z'),
('consultant-aisha-lawal','Aisha Lawal','aisha@meridianenergy.ng',NULL,'consultant_admin','Meridian Energy Advisory','etvwXkfI2Zad9s2RCVmwIA==','/FoRPPZAF+4r/zu/hX2XOLPkFG3YtQPoNKDt8fOf5Qw=','active','2026-02-01T09:00:00.000Z'),
('consultant-ngozi-eze','Ngozi Eze','ngozi@greenfieldtp.ng',NULL,'consultant_admin','GreenField Technical Partners','qIeOju3sL8TjluuhfROnUQ==','qPpmq+GbagspvCg4lJAa3yhoqPF0bwMc7kbD6NvpLLc=','active','2026-09-01T09:00:00.000Z');

WITH RECURSIVE
states(state_index,state_name,target_count,centre_lat,centre_lon,consultant_firm) AS (
  VALUES
    (0,'Abia',8,5.5265,7.486,'GreenField Technical Partners'),
    (1,'Adamawa',11,9.2035,12.4954,'REA Unallocated'),
    (2,'Akwa Ibom',9,5.0377,7.9128,'REA Unallocated'),
    (3,'Anambra',14,6.212,7.069,'GreenField Technical Partners'),
    (4,'Bauchi',13,10.3158,9.8442,'REA Unallocated'),
    (5,'Bayelsa',5,4.9247,6.2642,'REA Unallocated'),
    (6,'Benue',12,7.7322,8.5391,'REA Unallocated'),
    (7,'Borno',10,11.8333,13.15,'REA Unallocated'),
    (8,'Cross River',9,4.9757,8.3417,'REA Unallocated'),
    (9,'Delta',15,6.2059,6.7306,'GreenField Technical Partners'),
    (10,'Ebonyi',7,6.3249,8.1137,'REA Unallocated'),
    (11,'Edo',13,6.335,5.6037,'REA Unallocated'),
    (12,'Ekiti',6,7.6211,5.2214,'REA Unallocated'),
    (13,'Enugu',11,6.4584,7.5464,'GreenField Technical Partners'),
    (14,'FCT',8,9.0765,7.3986,'Meridian Energy Advisory'),
    (15,'Gombe',10,10.2897,11.1673,'REA Unallocated'),
    (16,'Imo',9,5.484,7.0351,'GreenField Technical Partners'),
    (17,'Jigawa',12,12.228,9.5616,'Supreme Way Nigeria Limited'),
    (18,'Kaduna',16,10.5105,7.4165,'Supreme Way Nigeria Limited'),
    (19,'Kano',20,12.0022,8.592,'Supreme Way Nigeria Limited'),
    (20,'Katsina',15,12.9908,7.6018,'Supreme Way Nigeria Limited'),
    (21,'Kebbi',8,12.4539,4.1975,'REA Unallocated'),
    (22,'Kogi',9,7.8023,6.7337,'Meridian Energy Advisory'),
    (23,'Kwara',10,8.5,4.55,'Meridian Energy Advisory'),
    (24,'Lagos',18,6.5244,3.3792,'REA Unallocated'),
    (25,'Nasarawa',11,8.4939,8.5169,'Meridian Energy Advisory'),
    (26,'Niger',14,9.6139,6.5569,'Meridian Energy Advisory'),
    (27,'Ogun',15,7.1475,3.3619,'REA Unallocated'),
    (28,'Ondo',8,7.2571,5.2058,'REA Unallocated'),
    (29,'Osun',9,7.7719,4.5567,'REA Unallocated'),
    (30,'Oyo',14,7.3775,3.947,'REA Unallocated'),
    (31,'Plateau',12,9.8965,8.8583,'REA Unallocated'),
    (32,'Rivers',16,4.8156,7.0498,'GreenField Technical Partners'),
    (33,'Sokoto',11,13.0059,5.2476,'REA Unallocated'),
    (34,'Taraba',7,8.8833,11.3667,'REA Unallocated'),
    (35,'Yobe',8,11.747,11.9608,'REA Unallocated'),
    (36,'Zamfara',9,12.1704,6.6597,'REA Unallocated')
),
nums(n) AS (
  SELECT 0
  UNION ALL
  SELECT n + 1 FROM nums WHERE n < 19
),
base AS (
  SELECT
    s.state_index,
    s.state_name,
    s.centre_lat,
    s.centre_lon,
    s.consultant_firm,
    nums.n AS project_index,
    (s.state_index * 37 + nums.n * 11) AS seed
  FROM states s
  JOIN nums ON nums.n < s.target_count
),
derived AS (
  SELECT
    *,
    CASE
      WHEN project_index=0 THEN 'Mini Grid'
      WHEN ((seed + project_index * 2 + state_index) % 4)=0 THEN 'Mini Grid'
      WHEN ((seed + project_index * 2 + state_index) % 4)=1 THEN 'Solar Home System'
      WHEN ((seed + project_index * 2 + state_index) % 4)=2 THEN 'Grid Extension'
      ELSE 'Solar Street Light'
    END AS component,
    CASE
      WHEN project_index=0 THEN 'NEP'
      WHEN ((seed + project_index * 2) % 4)=0 THEN 'NEP'
      WHEN ((seed + project_index * 2) % 4)=1 THEN 'DARES'
      WHEN ((seed + project_index * 2) % 4)=2 THEN 'AMP'
      ELSE 'Others'
    END AS programme,
    CASE
      WHEN project_index=0 THEN 'SunVolt Nigeria'
      WHEN ((seed + state_index) % 4)=0 THEN 'SunVolt Nigeria'
      WHEN ((seed + state_index) % 4)=1 THEN 'NorthGrid EPC'
      WHEN ((seed + state_index) % 4)=2 THEN 'Apex Power Works'
      ELSE 'GreenTech Ltd'
    END AS contractor,
    CASE
      WHEN project_index=0 THEN 'June 2024'
      WHEN ((seed + project_index * 6) % 12)=0 THEN 'January 2024'
      WHEN ((seed + project_index * 6) % 12)=1 THEN 'February 2024'
      WHEN ((seed + project_index * 6) % 12)=2 THEN 'March 2024'
      WHEN ((seed + project_index * 6) % 12)=3 THEN 'April 2024'
      WHEN ((seed + project_index * 6) % 12)=4 THEN 'May 2024'
      WHEN ((seed + project_index * 6) % 12)=5 THEN 'June 2024'
      WHEN ((seed + project_index * 6) % 12)=6 THEN 'July 2024'
      WHEN ((seed + project_index * 6) % 12)=7 THEN 'August 2024'
      WHEN ((seed + project_index * 6) % 12)=8 THEN 'September 2024'
      WHEN ((seed + project_index * 6) % 12)=9 THEN 'October 2024'
      WHEN ((seed + project_index * 6) % 12)=10 THEN 'November 2024'
      ELSE 'December 2024'
    END AS reporting_month,
    CASE
      WHEN (seed % 6) IN (0,1,2) THEN 'Verified'
      WHEN (seed % 6)=3 THEN 'Submitted'
      WHEN (seed % 6)=4 THEN 'Pending'
      ELSE 'In progress'
    END AS portfolio_status,
    CASE WHEN (seed % 6) IN (0,1,2) THEN 1 ELSE 0 END AS verified,
    120 + ((seed * 173 + project_index * 61) % 880) AS installed_capacity_kw,
    80 + ((seed * 211 + project_index * 97) % 1420) AS households
  FROM base
)
INSERT OR IGNORE INTO projects
(id,name,programme,component,contractor,consultant_firm,state,lga,community,latitude,longitude,geofence_radius_metres,created_at,updated_at,reporting_month,portfolio_status,installed_capacity_kw,households,verified,data_source)
SELECT
  'DEMO-' || replace(upper(state_name),' ','-') || '-' || printf('%03d',project_index+1),
  state_name || ' ' || component || ' Project ' || printf('%02d',project_index+1),
  programme,
  component,
  contractor,
  consultant_firm,
  state_name,
  state_name || ' Central',
  state_name || ' Community ' || (project_index+1),
  centre_lat + (((project_index % 5) - 2) * 0.002),
  centre_lon + ((((project_index * 3) % 5) - 2) * 0.002),
  250,
  '2026-09-11T00:00:00.000Z',
  '2026-09-11T00:00:00.000Z',
  reporting_month,
  portfolio_status,
  installed_capacity_kw,
  households,
  verified,
  'demo-dashboard'
FROM derived;

WITH selected AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY state,id) AS rn
  FROM projects
  WHERE data_source='demo-dashboard'
    AND consultant_firm='Supreme Way Nigeria Limited'
    AND component IN ('Mini Grid','Grid Extension')
  ORDER BY state,id
  LIMIT 12
)
INSERT OR IGNORE INTO assignments
(id,project_id,officer_id,status,due_date,arrival_json,report_json,submitted_at,approved_at,verified_at,locked_at,sync_revision,created_at,updated_at)
SELECT
  'DEMO-ASSIGN-' || printf('%03d',rn),
  id,
  'officer-amina-yusuf',
  CASE rn WHEN 2 THEN 'Draft' WHEN 3 THEN 'Submitted' WHEN 4 THEN 'Approved' WHEN 5 THEN 'Verified' ELSE 'Assigned' END,
  datetime('2026-09-11T09:00:00Z','+' || (rn % 7) || ' days'),
  CASE WHEN rn BETWEEN 2 AND 5 THEN '{"verifiedAt":"2026-09-10T10:00:00.000Z","distanceMetres":0}' ELSE NULL END,
  CASE WHEN rn BETWEEN 2 AND 5 THEN '{"demo":true,"observations":"Demo field record","evidence":[]}' ELSE NULL END,
  CASE WHEN rn BETWEEN 3 AND 5 THEN '2026-09-10T12:00:00.000Z' ELSE NULL END,
  CASE WHEN rn BETWEEN 4 AND 5 THEN '2026-09-10T14:00:00.000Z' ELSE NULL END,
  CASE WHEN rn=5 THEN '2026-09-10T16:00:00.000Z' ELSE NULL END,
  CASE WHEN rn BETWEEN 3 AND 5 THEN '2026-09-10T12:00:00.000Z' ELSE NULL END,
  1,
  '2026-09-11T00:00:00.000Z',
  '2026-09-11T00:00:00.000Z'
FROM selected;

CREATE INDEX IF NOT EXISTS idx_projects_demo_scope
  ON projects(data_source,programme,state,consultant_firm);
CREATE INDEX IF NOT EXISTS idx_projects_portfolio_status
  ON projects(portfolio_status,verified);
CREATE INDEX IF NOT EXISTS idx_users_role_firm
  ON users(role,consultant_firm,status);
