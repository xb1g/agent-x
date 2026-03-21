CREATE TABLE IF NOT EXISTS segment_logs (
  id BIGSERIAL PRIMARY KEY,
  segment_id UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS segment_logs_segment_id_idx ON segment_logs(segment_id, created_at);
