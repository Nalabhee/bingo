CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  twitch_id TEXT UNIQUE,
  display_name TEXT,
  is_admin INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS bingo_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  week TEXT,
  data TEXT,
  created_at INTEGER,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS checked_cells (
  card_id INTEGER,
  row INTEGER,
  col INTEGER,
  PRIMARY KEY(card_id, row, col)
);
