require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

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
function truncateName(name, max = 20) {
  if (!name) return "";
  return name.length > max ? name.substring(0, max - 3) + "..." : name;
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

/* ---------- Routes ---------- */

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
    let botGuilds = [];
    try {
      const filePath = path.join(__dirname, "bot_guilds.json");
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) botGuilds = parsed.map(String);
    } catch (err) {
      console.error("Could not read bot_guilds.json:", err.message);
      botGuilds = [];
    }

    const filteredGuilds =
      Array.isArray(botGuilds) && botGuilds.length > 0
        ? guilds.filter((g) => botGuilds.includes(String(g.id)))
        : guilds;

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

  const serverCardsHtml = guilds.length
    ? guilds
        .map((g) => {
          const icon = guildIconUrl(g);
          const iconHtml = icon
            ? `<img src="${icon}" alt="${escapeHtml(g.name)}" />`
            : `<div class="server-icon">${escapeHtml(firstChar(g.name))}</div>`;
          return `<a class="server" href="/dashboard/${encodeURIComponent(
            g.id
          )}">
              ${iconHtml}
              <div class="server-name">${escapeHtml(truncateName(g.name))}</div>
            </a>`;
        })
        .join("")
    : "<p>No servers available</p>";

  const avatarUrl = discordAvatarUrl(user);

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Utilix — Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0b0a1e;
      --fg: #f2f2f7;
      --accent: #a64ca6;
      --accent2: #6c34cc;
      --muted: #c0a0ff;
      --card: rgba(20, 10, 40, 0.8);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", Arial, sans-serif;
      background: radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);
      color: var(--fg);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      position: fixed;
      top: 0; left: 0; width: 100%;
      z-index: 1100;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      height: 72px;
      background: rgba(15, 5, 35, 0.6);
    }
    .logo {
      font-weight: 800;
      font-size: 1.25rem;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .btn {
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      color: white; font-weight: 600;
      padding: 0.5rem 1rem;
      border-radius: 999px; text-decoration: none;
    }
    .add-btn {
      background: rgba(255,255,255,0.05);
      color: var(--fg);
      font-weight: 600;
      padding: 0.5rem 1rem;
      border-radius: 999px;
      text-decoration: none;
    }
    .auth { display: flex; align-items: center; gap: 10px; }
    .auth img { width: 36px; height: 36px; border-radius: 50%; }
    .logout-btn { font-size: 1.1rem; color: #f55; text-decoration: none; margin-left: 6px; }
    main { flex: 1; padding: 110px 20px 40px; max-width: 1200px; margin: 0 auto; }
    h2 { margin-bottom: 1rem; }
    .servers {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 1.5rem;
    }
    .server {
      background: var(--card);
      border-radius: 14px;
      padding: 1rem;
      text-align: center;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .server:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.6); }
    .server img, .server-icon {
      width: 80px; height: 80px; border-radius: 16px; margin-bottom: 0.5rem;
    }
    .server-icon {
      display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.1); font-size: 1.5rem; font-weight: bold;
    }
    .server-name { font-size: 0.95rem; color: var(--muted); word-break: break-word; }
  </style>
</head>
<body>
  <header>
    <div class="logo">Utilix</div>
    <div class="header-right">
      <a href="/dashboard" class="btn">Manage Servers</a>
      <a href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands" class="add-btn" target="_blank">Add to Server</a>
      <div class="auth">
        <img src="${avatarUrl}" alt="${escapeHtml(user.username)}" />
        <div style="font-weight:600">${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</div>
        <a href="/logout" class="logout-btn">⎋</a>
      </div>
    </div>
  </header>

  <main>
    <h2>Your Servers</h2>
    <div class="servers">
      ${serverCardsHtml}
    </div>
  </main>
</body>
</html>`);
});

// --- INDIVIDUAL SERVER DASHBOARD (same as before, omitted for brevity) ---

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});
app.get("/", (req, res) => {
  if (req.session.user) res.redirect("/dashboard");
  else res.send(`<a href="/login">Log in with Discord</a>`);
});
app.get("/me", (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
