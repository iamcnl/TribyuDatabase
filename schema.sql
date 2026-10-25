CREATE TABLE IF NOT EXISTS channel_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prize_pool TEXT,
  hashrate TEXT,
  timestamp TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS payment_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT UNIQUE,
  sats_paid TEXT
);

CREATE TABLE IF NOT EXISTS auction_house (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT,
  item TEXT,
  quantity INTEGER,
  price TEXT,
  timestamp TEXT UNIQUE,
  item_id TEXT
);

CREATE TABLE IF NOT EXISTS ah_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller TEXT,
  buyer TEXT,
  item TEXT,
  quantity INTEGER,
  price TEXT,
  timestamp TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS current_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prize_pool TEXT,
  hashrate TEXT,
  last_updated TEXT UNIQUE
);
