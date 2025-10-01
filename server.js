require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");
const session = require("express-session");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET, // now comes from .env
  resave: false,
  saveUninitialized: false
}));

// Load credentials from .env
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const PORT = process.env.PORT || 3000;

// --- LOGIN ROUTE ---
app.get("/login", (req, res) => {
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

// --- CALLBACK ROUTE ---
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  // Exchange code for access token
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    scope: "identify guilds"
  });

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    body: params,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    return res.send("Error getting token: " + JSON.stringify(tokenData));
  }

  // Fetch user info
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userData = await userResponse.json();

  // Fetch user guilds
  const guildResponse = await fetch("https://discord.com/api/users/@me/guilds", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const guilds = await guildResponse.json();

  // Save to session
  req.session.user = userData;
  req.session.guilds = guilds;

  res.redirect("/dashboard");
});

// --- DASHBOARD ROUTE ---
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = req.session.user;
  const guilds = req.session.guilds || [];

  res.send(`
    <html>
      <head>
        <title>Dashboard</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #0b0a1e;
            color: white;
            margin: 0;
            padding: 0;
          }
          header {
            display: flex;
            justify-content: flex-end;
            align-items: center;
            background: rgba(255,255,255,0.05);
            padding: 1rem;
          }
          header img {
            border-radius: 50%;
            width: 40px;
            height: 40px;
          }
          main {
            padding: 2rem;
          }
          .server {
            background: rgba(255,255,255,0.05);
            margin: 0.5rem 0;
            padding: 1rem;
            border-radius: 8px;
          }
        </style>
      </head>
      <body>
        <header>
          <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" />
        </header>
        <main>
          <h1>Welcome, ${user.username}#${user.discriminator}</h1>
          <h2>Your Servers:</h2>
          ${guilds.map(g => `<div class="server">${g.name}</div>`).join("")}
          <br>
          <a href="/logout" style="color:#a64ca6;">Logout</a>
        </main>
      </body>
    </html>
  `);
});

// --- LOGOUT ROUTE ---
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// --- HOME ROUTE ---
app.get("/", (req, res) => {
  if (req.session.user) {
    res.redirect("/dashboard");
  } else {
    res.send(`<a href="/login">Log in with Discord</a>`);
  }
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
