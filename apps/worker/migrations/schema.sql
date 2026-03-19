-- D1 migration: initial A/B testing schema
-- Tables:
-- - projects     : A/B testing projects
-- - experiments  : A/B tests
-- - events       : impressions and conversions

PRAGMA foreign_keys = ON;

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT,
  write_key TEXT NOT NULL UNIQUE,
  read_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Experiments
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed')),
  split_a REAL NOT NULL DEFAULT 0.5 CHECK (split_a >= 0.0 AND split_a <= 1.0),
  cookie_days INTEGER NOT NULL DEFAULT 30,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiments_project ON experiments(project_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);

-- Events (impressions and conversions)
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  experiment_id TEXT NOT NULL,
  experiment_version INTEGER NOT NULL,
  visitor_id TEXT,
  variant TEXT NOT NULL CHECK (variant IN ('A', 'B')),
  type TEXT NOT NULL,  -- 'impression', 'conversion', etc.
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
  UNIQUE (experiment_id, experiment_version, visitor_id, type)
);

CREATE INDEX IF NOT EXISTS idx_events_experiment ON events(experiment_id);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_event ON events (experiment_id, experiment_version, visitor_id, type);

