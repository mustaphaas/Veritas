PRAGMA foreign_keys = ON;

ALTER TABLE sessions ADD COLUMN history_id TEXT;

CREATE TABLE IF NOT EXISTS user_session_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','ended')),
  end_reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  device_family TEXT,
  browser TEXT,
  os TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_history_user_time
  ON user_session_history(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_history_status_time
  ON user_session_history(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_history_id
  ON sessions(history_id);
