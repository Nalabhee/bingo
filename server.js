require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitchStrategy = require('passport-twitch-new').Strategy;
const bcrypt = require('bcrypt');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
const db = new Database('./users.db');

// Middleware pour parser les données POST des formulaires
app.use(express.urlencoded({ extended: true }));

function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Non autorisé' });
}

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'un_secret_pour_la_session',
  resave: false,
  saveUninitialized: false
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Création table users si elle n'existe pas
db.prepare(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    email TEXT UNIQUE,
    password TEXT,
    twitchId TEXT UNIQUE
  )
`).run();

// Passport Local Strategy
const LocalStrategy = require('passport-local').Strategy;
passport.use(new LocalStrategy(
  function(username, password, done) {
    try {
      const user = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(username, username);
      if (!user) return done(null, false, { message: 'Utilisateur non trouvé' });

      bcrypt.compare(password, user.password, (err, res) => {
        if (err) return done(err);
        if (res) return done(null, user);
        else return done(null, false, { message: 'Mot de passe incorrect' });
      });
    } catch (err) {
      return done(err);
    }
  }
));

// Passport Twitch Strategy
passport.use(new TwitchStrategy({
  clientID: process.env.TWITCH_CLIENT_ID,
  clientSecret: process.env.TWITCH_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: "user:read:email"
},
(accessToken, refreshToken, profile, done) => {
  try {
    let user = db.prepare("SELECT * FROM users WHERE twitchId = ?").get(profile.id);

    if (user) {
      return done(null, user);
    } else {
      const insert = db.prepare("INSERT INTO users (username, twitchId) VALUES (?, ?)");
      const info = insert.run(profile.login, profile.id);

      user = db.prepare("SELECT * FROM users WHERE id = ?").get(info.lastInsertRowid);
      return done(null, user);
    }
  } catch (err) {
    return done(err);
  }
}));

// Sérialisation / Désérialisation
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

// Servir fichiers statiques (index.html, login.html, register.html)
app.use(express.static(path.join(__dirname, 'public')));

// Routes pour afficher login et register
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// POST inscription
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.send("Merci de remplir tous les champs");
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const insert = db.prepare("INSERT INTO users (username, email, password) VALUES (?, ?, ?)");
    insert.run(username, email, hashedPassword);
    res.redirect('/login');
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      res.send("Identifiant ou email déjà utilisé");
    } else {
      res.send("Erreur serveur");
    }
  }
});

// POST connexion classique
app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login?error=1'
}));

// Déconnexion
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Page d'accueil simple
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.send(`<h1>Bienvenue ${req.user.username} !</h1><a href="/logout">Déconnexion</a>`);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Auth Twitch routes
app.get('/auth/twitch',
  passport.authenticate('twitch'));

app.get('/auth/twitch/callback',
  passport.authenticate('twitch', { failureRedirect: '/login' }),
  (req, res) => {
    res.redirect('/');
  });

const authMiddleware = (req, res, next) => {
  if (req.isAuthenticated()) {
    next();
  } else {
    res.redirect('/login.html');
  }
};

// Pour afficher la grille
app.get('/bingo', authMiddleware, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bingo.html'));
});

// Pour charger la grille sauvegardée
app.get('/api/bingo', authMiddleware, (req, res) => {
  const userId = req.user.id;
  const stmt = db.prepare('SELECT grid FROM bingo WHERE user_id = ?');
  const row = stmt.get(userId);
  if (row) {
    res.json({ grid: JSON.parse(row.grid) });
  } else {
    res.json({ grid: Array(25).fill(false) }); // grille vide par défaut
  }
});

// Pour sauvegarder la grille
app.post('/api/bingo', authMiddleware, express.json(), (req, res) => {
  const userId = req.user.id;
  const grid = JSON.stringify(req.body.grid);

  const stmt = db.prepare(`
    INSERT INTO bingo (user_id, grid) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET grid = excluded.grid
  `);

  stmt.run(userId, grid);
  res.json({ success: true });
});

// Lancement serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
