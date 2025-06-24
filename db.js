const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'users.db'));

// Création de la table users si elle n'existe pas
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT,
    password TEXT,
    twitchId TEXT
  )
`).run();

// Ajout de la colonne twitchId si elle n'existe pas déjà
const columns = db.prepare(`PRAGMA table_info(users)`).all();
const hasTwitchId = columns.some(col => col.name === 'twitchId');
if (!hasTwitchId) {
  db.prepare(`ALTER TABLE users ADD COLUMN twitchId TEXT`).run();
  console.log("✅ Colonne 'twitchId' ajoutée à la table users.");
}

// Création de la table bingos (si elle n'existe pas)
db.prepare(`
  CREATE TABLE IF NOT EXISTS bingos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER NOT NULL,
    grid TEXT NOT NULL,
    lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES users(id)
  )
`).run();

console.log("✅ Base de données initialisée correctement.");

module.exports = db;
