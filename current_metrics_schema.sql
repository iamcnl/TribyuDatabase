-- Current Metrics Table Schema
-- This table stores only the current/latest prizepool and hashrate values
-- It gets updated every time new data is fetched, replacing the previous values

CREATE TABLE IF NOT EXISTS current_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prize_pool TEXT NOT NULL,
  hashrate TEXT NOT NULL,
  last_updated TEXT NOT NULL UNIQUE
);

-- Create an index on last_updated for faster queries
CREATE INDEX IF NOT EXISTS idx_current_metrics_last_updated ON current_metrics(last_updated);

-- Insert a default record (optional)
INSERT OR IGNORE INTO current_metrics (prize_pool, hashrate, last_updated) 
VALUES ('N/A', 'N/A', '1970-01-01 00:00:00 UTC');
