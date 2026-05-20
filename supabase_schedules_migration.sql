-- Run this in Supabase SQL Editor to create the schedules table
CREATE TABLE IF NOT EXISTS schedules (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  time        TEXT NOT NULL,          -- "HH:MM" Vietnam time
  enabled     BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default schedule entries
INSERT INTO schedules (id, label, time, enabled) VALUES
  ('sched-0600', 'Bản tin sáng',  '06:00', true),
  ('sched-1200', 'Bản tin trưa',  '12:00', false),
  ('sched-1800', 'Bản tin tối',   '18:00', false)
ON CONFLICT (id) DO NOTHING;
