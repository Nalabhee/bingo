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

// Middleware pour parser les données POST des formulaires
app.use(express.urlencoded({ extended: true }));

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'un_secret_pour_la_session',
  resave: false,
  saveUninitialized: false
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Création de la table users si elle n'existe pas
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  password TEXT,
  twitchId TEXT UNIQUE
)`);

// Passport Local Strategy pour connexion classique
const LocalStrategy = require('passport-local').Strategy;
passport.use(new LocalStrategy(
  function(username, password, done) {
    db.get("SELECT * FROM users WHERE username = ? OR email = ?", [username, username], (err, user) => {
      if (err) return done(err);
      if (!user) return done(null, false, { message: 'Utilisateur non trouvé' });

      bcrypt.compare(password, user.password, (err, res) => {
        if (res) return done(null, user);
        else return done(null, false, { message: 'Mot de passe incorrect' });
      });
    });
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
  // Chercher utilisateur avec ce twitchId
  db.get("SELECT * FROM users WHERE twitchId = ?", [profile.id], (err, user) => {
    if (err) return done(err);

    if (user) {
      // Si utilisateur existe, on le connecte
      return done(null, user);
    } else {
      // Sinon, on crée un utilisateur avec twitchId et login Twitch comme username
      db.run(
        "INSERT INTO users (username, twitchId) VALUES (?, ?)",
        [profile.login, profile.id],
        function(err) {
          if (err) return done(err);
          // Récupérer le nouvel utilisateur
          db.get("SELECT * FROM users WHERE id = ?", [this.lastID], (err, newUser) => {
            if (err) return done(err);
            return done(null, newUser);
          });
        }
      );
    }
  });
}));

// Sérialisation / Désérialisation
passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  db.get("SELECT * FROM users WHERE id = ?", [id], (err, user) => {
    done(err, user);
  });
});

// Servir les fichiers statiques (index.html, login.html, register.html)
app.use(express.static(path.join(__dirname, 'public')));

// Routes pour servir les pages de login et register
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
  const hashedPassword = await bcrypt.hash(password, 10);

  db.run("INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
    [username, email, hashedPassword],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.send("Identifiant ou email déjà utilisé");
        }
        return res.send("Erreur serveur");
      }
      res.redirect('/login');
    }
  );
});

// POST connexion classique
app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login?error=1'
}));

// Route déconnexion
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/');
  });
});

// Route d'accueil (exemple)
app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    res.send(`<h1>Bienvenue ${req.user.username} !</h1><a href="/logout">Déconnexion</a>`);
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Routes Twitch
app.get('/auth/twitch',
  passport.authenticate('twitch'));

app.get('/auth/twitch/callback',
  passport.authenticate('twitch', { failureRedirect: '/login' }),
  (req, res) => {
    // Connexion réussie, redirection accueil
    res.redirect('/');
  });

// Démarrer serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});
