-- Persist REA staff-specific access without changing the legacy users.role CHECK constraint.
-- Cloudflare D1 rejects PRAGMA writable_schema, so REA staff accounts use a
-- companion table while the parent users row keeps the supported rea_admin role.
CREATE TABLE IF NOT EXISTS rea_staff_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  staff_role TEXT NOT NULL,
  department TEXT,
  access_json TEXT NOT NULL DEFAULT '["Overview","Field Inspections","Verification","Reports"]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rea_staff_accounts_role
  ON rea_staff_accounts(staff_role);

INSERT OR IGNORE INTO rea_staff_accounts(user_id,staff_role,department,access_json,created_at)
SELECT id,
       'REA Administrator',
       'ICT / Administration',
       '["Overview","Claims","Field Inspections","Verification","Consultants","Analytics","Reports","Users","Audit Trail"]',
       created_at
FROM users
WHERE role='rea_admin'
  AND NOT EXISTS (SELECT 1 FROM rea_staff_accounts WHERE user_id=users.id);
