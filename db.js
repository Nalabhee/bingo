const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./bingo.db');

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
