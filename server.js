// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

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

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const PORT = process.env.PORT || 3000;

/* ---------- Helpers ---------- */
function discordAvatarUrl(user) {
  if (user && user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
  }
  const disc = user && user.discriminator ? parseInt(user.discriminator) : 0;
  const idx = isNaN(disc) ? 0 : disc % 5;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
function guildIconUrl(g) {
  if (!g || !g.icon) return null;
  const ext = g.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}`;
}
function escapeHtml(str) {
  if (!str && str !== 0) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function firstChar(str) {
  if (!str) return "";
  return String(str).trim().charAt(0).toUpperCase();
}

/* ---------- ROUTES ---------- */

app.get("/login", (req, res) => {
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");
  try {
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

    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    const guildResponse = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    let guilds = await guildResponse.json();
    if (!Array.isArray(guilds)) guilds = [];

    // filter by bot_guilds.json if available
    let botGuilds = [];
    try {
      const raw = fs.readFileSync(path.join(__dirname, "bot_guilds.json"), "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) botGuilds = parsed.map(String);
    } catch {}
    const filteredGuilds =
      botGuilds.length > 0 ? guilds.filter((g) => botGuilds.includes(String(g.id))) : guilds;

    req.session.user = userData;
    req.session.guilds = filteredGuilds;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const guilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];

  const serverCardsHtml = guilds.length
    ? guilds
        .map((g) => {
          const icon = guildIconUrl(g);
          const iconHtml = icon
            ? `<img src="${icon}" alt="${escapeHtml(g.name)}" />`
            : `<div class="server-icon">${escapeHtml(firstChar(g.name))}</div>`;
          return `<a class="server" href="/dashboard/${encodeURIComponent(g.id)}">
            ${iconHtml}
            <div class="server-name">${escapeHtml(g.name)}</div>
          </a>`;
        })
        .join("")
    : "<p>No servers available</p>";

  const avatarUrl = discordAvatarUrl(user);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Utilix Dashboard</title>
  <style>
    body {
      font-family: Inter, sans-serif;
      background: radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);
      color: white;
      margin: 0;
      min-height: 100vh;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15,5,35,0.6);
      padding: 1rem 2rem;
      position: fixed;
      top: 0; left: 0; width: 100%;
      height: 72px;
      backdrop-filter: blur(10px);
    }
    .logo { font-weight: 800; font-size: 1.25rem; color: #a64ca6; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .btn { background: #a64ca6; color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; }
    .add-btn { background: rgba(255,255,255,0.05); color: white; padding: 8px 12px; border-radius: 6px; text-decoration: none; }
    .auth { display: flex; align-items: center; gap: 8px; }
    .auth img { width: 36px; height: 36px; border-radius: 50%; }
    main { padding: 100px 20px 40px; max-width: 1200px; margin: 0 auto; }
    .servers {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 1.5rem;
    }
    .server {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
      transition: transform 0.2s;
    }
    .server:hover { transform: translateY(-4px); }
    .server img, .server-icon {
      width: 80px; height: 80px; border-radius: 16px; margin-bottom: 0.5rem;
    }
    .server-icon { display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);font-size:1.5rem;font-weight:700; }
    .server-name { font-size: 0.95rem; color: #c0a0ff; word-break: break-word; }
  </style>
</head>
<body>
  <header>
    <div class="logo">Utilix</div>
    <div class="header-right">
      <a href="/dashboard" class="btn">Manage Servers</a>
      <a href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands" target="_blank" class="add-btn">Add to Server</a>
      <div class="auth">
        <img src="${avatarUrl}" alt="${escapeHtml(user.username)}"/>
        <div>${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</div>
        <a href="/logout" style="color:#f55;text-decoration:none">⎋</a>
      </div>
    </div>
  </header>
  <main>
    <h2>Your Servers</h2>
    <div class="servers">${serverCardsHtml}</div>
  </main>
</body>
</html>`);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/", (req, res) => {
  if (req.session.user) res.redirect("/dashboard");
  else res.send(`<a href="/login">Log in with Discord</a>`);
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
