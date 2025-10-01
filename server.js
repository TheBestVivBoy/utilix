require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");

// node-fetch wrapper for CommonJS
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-secret",
    resave: false,
    saveUninitialized: false,
  })
);

// Load credentials from .env
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const PORT = process.env.PORT || 3000;

// --- LOGIN ROUTE ---
app.get("/login", (req, res) => {
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

// --- CALLBACK ROUTE ---
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  try {
    // Exchange code for access token
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      scope: "identify guilds",
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
    const guildResponse = await fetch(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    let guilds = await guildResponse.json();
    if (!Array.isArray(guilds)) guilds = [];

    // ---- FILTER SERVERS BOT IS IN ----
    // Put your bot's guild IDs in .env like: BOT_GUILDS=123,456,789
    const botGuilds = process.env.BOT_GUILDS
      ? process.env.BOT_GUILDS.split(",")
      : [];

    const filteredGuilds =
      botGuilds.length > 0
        ? guilds.filter((g) => botGuilds.includes(g.id))
        : guilds; // fallback: show all if no list

    // Save to session
    req.session.user = userData;
    req.session.guilds = filteredGuilds;

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// --- DASHBOARD ROUTE ---
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = req.session.user;
  const guilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];

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
            justify-content: space-between;
            align-items: center;
            background: rgba(255,255,255,0.05);
            padding: 1rem;
          }
          .user-info {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .user-info img {
            border-radius: 50%;
            width: 40px;
            height: 40px;
          }
          .logout {
            color: #a64ca6;
            text-decoration: none;
            font-weight: bold;
          }
          main {
            padding: 2rem;
          }
          .servers {
            display: flex;
            flex-wrap: wrap;
            gap: 1rem;
          }
          .server {
            width: 100px;
            text-align: center;
          }
          .server-icon {
            width: 80px;
            height: 80px;
            border-radius: 16px;
            background: rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 1.5rem;
          }
          .server img {
            width: 80px;
            height: 80px;
            border-radius: 16px;
          }
          .server-name {
            margin-top: 0.5rem;
            font-size: 0.9rem;
          }
          a { color: white; text-decoration: none; }
        </style>
      </head>
      <body>
        <header>
          <div class="user-info">
            <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" />
            <span>Welcome, ${user.username}#${user.discriminator}</span>
          </div>
          <a href="/logout" class="logout">Logout</a>
        </header>
        <main>
          <h2>Your Servers:</h2>
          <div class="servers">
            ${
              guilds.length > 0
                ? guilds
                    .map(
                      (g) => `
                  <div class="server">
                    <a href="/dashboard/${g.id}">
                      ${
                        g.icon
                          ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" alt="${g.name}" />`
                          : `<div class="server-icon">${g.name[0]}</div>`
                      }
                      <div class="server-name">${g.name}</div>
                    </a>
                  </div>`
                    )
                    .join("")
                : "<p>No servers available</p>"
            }
          </div>
        </main>
      </body>
    </html>
  `);
});

// --- INDIVIDUAL SERVER DASHBOARD ---
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const guildId = req.params.id;
  const user = req.session.user;
  const guild = req.session.guilds.find((g) => g.id === guildId);

  if (!guild) return res.send("You don’t have access to this server.");

  try {
    // Check Discord MANAGE_GUILD permission
    const MANAGE_GUILD = 0x20;
    const hasManageGuild =
      (parseInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;

    // Ask your bot API if user can manage
    const response = await fetch("https://api.utilix.support/checkPerms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        guildId: guild.id,
      }),
    });
    const botCheck = await response.json();

    if (!hasManageGuild || !botCheck.allowed) {
      return res.send(`
        <html>
          <body style="background:#0b0a1e;color:white;font-family:Arial;">
            <h1>${guild.name} Dashboard</h1>
            <p>You don’t have permission to manage this server’s bot dashboard.</p>
            <a href="/dashboard" style="color:#a64ca6;">← Back to servers</a>
          </body>
        </html>
      `);
    }

    // If allowed, show dashboard
    res.send(`
      <html>
        <head><title>${guild.name} Dashboard</title></head>
        <body style="background:#0b0a1e;color:white;font-family:Arial;">
          <h1>${guild.name} Dashboard</h1>
          <p>Welcome ${user.username}#${user.discriminator}, you have permission!</p>
          <p>Server ID: ${guild.id}</p>
          <p>Server Name: ${guild.name}</p>
          <a href="/dashboard" style="color:#a64ca6;">← Back to servers</a>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Error checking permissions");
  }
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
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
