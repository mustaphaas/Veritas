-- Allow REA staff accounts to be created and persist their dashboard module access.
PRAGMA writable_schema=ON;
UPDATE sqlite_schema
SET sql = replace(
  sql,
  "CHECK (role IN ('field_officer','consultant_admin','rea_admin'))",
  "CHECK (role IN ('field_officer','consultant_admin','rea_admin','rea_staff'))"
)
WHERE type='table' AND name='users';
PRAGMA writable_schema=OFF;

ALTER TABLE users ADD COLUMN access_json TEXT NOT NULL DEFAULT '["Overview","Field Inspections","Verification","Reports"]';

UPDATE users
SET access_json='["Overview","Claims","Field Inspections","Verification","Consultants","Analytics","Reports","Users","Audit Trail"]'
WHERE role='rea_admin';

PRAGMA integrity_check;
