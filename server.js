require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitchStrategy = require('passport-twitch-new').Strategy;
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./users.db');

// Middleware pour parser form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'unsecret',
  resave: false,
  saveUninitialized: false,
}));

// Passport init
app.use(passport.initialize());
app.use(passport.session());

// Création table users si elle n'existe pas
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT,
    twitch_id TEXT UNIQUE
  )
`);

// Passport - gestion serialization
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  db.get("SELECT * FROM users WHERE id = ?", [id], (err, row) => {
    if (err) return done(err);
    done(null, row);
  });
});

// Twitch strategy
passport.use(new TwitchStrategy({
  clientID: process.env.TWITCH_CLIENT_ID,
  clientSecret: process.env.TWITCH_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: "user:read:email"
}, (accessToken, refreshToken, profile, done) => {
  // Chercher utilisateur avec twitch_id
  db.get("SELECT * FROM users WHERE twitch_id = ?", [profile.id], (err, row) => {
    if (err) return done(err);
    if (row) return done(null, row); // déjà enregistré

    // Si non trouvé, on crée un nouvel utilisateur avec twitch_id et login twitch
    db.run("INSERT INTO users (username, twitch_id) VALUES (?, ?)", [profile.display_name, profile.id], function(err) {
      if (err) return done(err);
      db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err2, row2) => {
        if (err2) return done(err2);
        return done(null, row2);
      });
    });
  });
}));

// Middleware pour vérifier si connecté
function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/');
}

// Routes

// Accueil
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.send(`
      <h1>Bienvenue ${req.user.username}</h1>
      <p><a href="/logout">Déconnexion</a></p>
      <p><a href="/link-twitch">Lier compte Twitch</a></p>
    `);
  } else {
    res.send(`
      <h1>Bingo Warframe</h1>
      <a href="/login">Connexion classique</a> | <a href="/register">Inscription</a><br><br>
      <a href="/auth/twitch">Connexion avec Twitch</a>
    `);
  }
});

// Inscription
app.get('/register', (req, res) => {
  res.send(`
    <h1>Inscription</h1>
    <form method="POST" action="/register">
      <input name="username" placeholder="Pseudo" required /><br>
      <input type="email" name="email" placeholder="Email" required /><br>
      <input type="password" name="password" placeholder="Mot de passe" required /><br>
      <button type="submit">S'inscrire</button>
    </form>
    <p><a href="/">Accueil</a></p>
  `);
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.send("Tous les champs sont obligatoires.");

  // Hash du mot de passe
  const hash = await bcrypt.hash(password, 10);

  db.run("INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)", [username, email, hash], (err) => {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.send("Pseudo ou email déjà utilisé.");
      return res.send("Erreur : " + err.message);
    }
    res.redirect('/login');
  });
});

// Login classique
app.get('/login', (req, res) => {
  res.send(`
    <h1>Connexion</h1>
    <form method="POST" action="/login">
      <input name="username" placeholder="Pseudo ou email" required /><br>
      <input type="password" name="password" placeholder="Mot de passe" required /><br>
      <button type="submit">Se connecter</button>
    </form>
    <p><a href="/">Accueil</a></p>
  `);
});

app.post('/login', (req, res, next) => {
  const { username, password } = req.body;
  if (!username || !password) return res.send("Champs obligatoires.");

  // Chercher user par username ou email
  db.get("SELECT * FROM users WHERE username = ? OR email = ?", [username, username], async (err, user) => {
    if (err) return next(err);
    if (!user) return res.send("Utilisateur non trouvé.");

    const match = await bcrypt.compare(password, user.password_hash || '');
    if (!match) return res.send("Mot de passe incorrect.");

    // Connexion manuelle (sans passport local, simplification)
    req.login(user, (err2) => {
      if (err2) return next(err2);
      return res.redirect('/');
    });
  });
});

// Déconnexion
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Lier compte Twitch (nécessite d'être connecté)
app.get('/link-twitch', ensureAuth, (req, res) => {
  res.send(`
    <h1>Lier votre compte Twitch</h1>
    <a href="/auth/twitch/link">Se connecter avec Twitch</a><br>
    <p><a href="/">Accueil</a></p>
  `);
});

// Route d'auth Twitch spéciale pour liaison de compte
app.get('/auth/twitch/link',
  passport.authorize('twitch', { scope: "user:read:email" })
);

app.get('/auth/twitch/link/callback',
  passport.authorize('twitch', {
    failureRedirect: '/'
  }),
  (req, res) => {
    // Lier twitch_id au compte connecté
    const twitchProfile = req.account; // Passport place le compte autorisé dans req.account
    const userId = req.user.id;

    db.run("UPDATE users SET twitch_id = ? WHERE id = ?", [twitchProfile.id, userId], (err) => {
      if (err) return res.send("Erreur liaison Twitch : " + err.message);
      res.send(`
        <p>Twitch lié avec succès !</p>
        <p><a href="/">Accueil</a></p>
      `);
    });
  }
);

// Auth Twitch classique (connexion)
passport.use('twitch', new TwitchStrategy({
  clientID: process.env.TWITCH_CLIENT_ID,
  clientSecret: process.env.TWITCH_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: "user:read:email"
}, (accessToken, refreshToken, profile, done) => {
  db.get("SELECT * FROM users WHERE twitch_id = ?", [profile.id], (err, row) => {
    if (err) return done(err);
    if (row) return done(null, row);

    // Création auto d'utilisateur si jamais pas trouvé
    db.run("INSERT INTO users (username, twitch_id) VALUES (?, ?)", [profile.display_name, profile.id], function(err) {
      if (err) return done(err);
      db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err2, row2) => {
        if (err2) return done(err2);
        return done(null, row2);
      });
    });
  });
}));

app.get('/auth/twitch',
  passport.authenticate('twitch')
);

app.get('/auth/twitch/callback',
  passport.authenticate('twitch', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  }
);

// Lancer le serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Fonction hash password (pour simplifier, ici on utilise bcrypt async)
async function hashPassword(pwd) {
  return await bcrypt.hash(pwd, 10);
}
