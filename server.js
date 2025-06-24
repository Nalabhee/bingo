require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const TwitchStrategy = require('passport-twitch').Strategy;

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET || 'secret_session',
  resave: false,
  saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new TwitchStrategy({
  clientID: process.env.TWITCH_CLIENT_ID,
  clientSecret: process.env.TWITCH_CLIENT_SECRET,
  callbackURL: process.env.CALLBACK_URL,
  scope: "user:read:email"
}, (accessToken, refreshToken, profile, done) => {
  console.log("Profil Twitch reçu:", profile);
  // Ici tu peux gérer sauvegarde utilisateur en BDD
  return done(null, profile);
}));

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

app.get('/', (req, res) => {
  if(req.user) {
    res.send(`
      <h1>Bienvenue ${req.user.display_name}</h1>
      <p>ID Twitch: ${req.user.id}</p>
      <a href="/logout">Se déconnecter</a>
    `);
  } else {
    res.send(`
      <h1>Accueil</h1>
      <a href="/auth/twitch">Se connecter avec Twitch</a>
    `);
  }
});

app.get('/auth/twitch', passport.authenticate('twitch'));

app.get('/auth/twitch/callback',
  passport.authenticate('twitch', { failureRedirect: '/fail' }),
  (req, res) => {
    res.redirect('/');
  });

app.get('/fail', (req, res) => {
  res.send('<h1>Échec de la connexion Twitch</h1><a href="/">Retour</a>');
});

app.get('/logout', (req, res, next) => {
  req.logout(err => {
    if(err) return next(err);
    res.redirect('/');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${PORT}`);
});
