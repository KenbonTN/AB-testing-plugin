-- D1 migration: initial A/B testing schema
-- Tables:
-- - experiments   : A/B tests (name, status, split, winner)
-- - assignments   : which user saw which variant (sticky)
-- - impressions   : every time a variant is shown
-- - conversions   : every time a user completes goal

PRAGMA foreign_keys = ON;

-- Experiments (A/B tests)
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,                 -- e.g. uuid or custom string
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed')),
  -- split represents the traffic share for variant B (0.5 = 50/50 A/B)
  split REAL NOT NULL DEFAULT 0.5 CHECK (split >= 0.0 AND split <= 1.0),
  winner TEXT CHECK (winner IN ('A', 'B')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);

-- Assignments (sticky user → variant mapping)
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
  UNIQUE (experiment_id, user_id)  -- one sticky assignment per user per experiment
);

CREATE INDEX IF NOT EXISTS idx_assignments_experiment ON assignments(experiment_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON assignments(user_id);

-- Impressions (every time a variant is shown)
CREATE TABLE IF NOT EXISTS impressions (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  user_id TEXT,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_impressions_experiment_variant ON impressions(experiment_id, variant);
CREATE INDEX IF NOT EXISTS idx_impressions_user ON impressions(user_id);

-- Conversions (user completes goal)
CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  user_id TEXT,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  type TEXT NOT NULL,  -- e.g. 'click', 'submit', 'purchase', 'custom'
  metadata TEXT,       -- JSON string for extra details
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversions_experiment_variant ON conversions(experiment_id, variant);
CREATE INDEX IF NOT EXISTS idx_conversions_user ON conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_conversions_type ON conversions(type);

