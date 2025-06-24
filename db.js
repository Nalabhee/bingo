const Database = require('better-sqlite3');
const db = new Database('data.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    username TEXT UNIQUE,
    password_hash TEXT,
    twitch_id TEXT UNIQUE,
    twitch_display_name TEXT
  )`);
});

module.exports = db;
