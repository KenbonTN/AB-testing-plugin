-- Add unique index to prevent duplicate events per visitor per experiment version
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_event ON events (experiment_id, experiment_version, visitor_id, type);