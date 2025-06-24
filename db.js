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

db.prepare(`
  CREATE TABLE IF NOT EXISTS bingo (
    user_id INTEGER PRIMARY KEY,
    grid TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`).run();


module.exports = db;
