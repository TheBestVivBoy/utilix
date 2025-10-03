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

// Escape HTML helper
function escapeHtml(str = "") {
  return str.replace(/[&<>'"]/g, (c) => {
    return (
      {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[c] || c
    );
  });
}

// --- LOGIN ---
app.get("/login", (req, res) => {
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

// --- CALLBACK ---
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

    const guildResponse = await fetch(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    let guilds = await guildResponse.json();
    if (!Array.isArray(guilds)) guilds = [];

    let botGuilds = [];
    try {
      const filePath = path.join(__dirname, "bot_guilds.json");
      botGuilds = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {}

    const filteredGuilds =
      Array.isArray(botGuilds) && botGuilds.length > 0
        ? guilds.filter((g) => botGuilds.includes(g.id))
        : guilds;

    req.session.user = userData;
    req.session.guilds = filteredGuilds;
    req.session.jwt = tokenData.access_token; // save JWT for Utilix API

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// --- LAYOUT RENDERER ---
function renderLayout(user, content) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Utilix — Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: "Inter", sans-serif;
      background: radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);
      color: white; margin:0;
      min-height: 100vh; display:flex; flex-direction:column;
    }
    header {
      position:fixed; top:0; left:0; width:100%; height:72px;
      display:flex; justify-content:space-between; align-items:center;
      background:rgba(15,5,35,0.6); padding:1rem 2rem;
      backdrop-filter:blur(10px); z-index:1000;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    nav ul {
      display:flex; gap:1.25rem; list-style:none; margin:0; padding:0;
      background: rgba(25,5,50,0.3); padding:0.4rem 0.9rem; border-radius:999px;
    }
    nav a {
      position: relative; color:white; text-decoration:none; font-weight:600;
      padding:0.55rem 1.1rem; border-radius:999px;
    }
    nav a::after {
      content:""; position:absolute; left:50%; bottom:6px;
      transform:translateX(-50%) scaleX(0); transform-origin:center;
      width:60%; height:2px;
      background:linear-gradient(90deg,#a64ca6,#6c34cc);
      transition: transform 0.3s ease;
    }
    nav a:hover::after { transform:translateX(-50%) scaleX(1); }
    .logo {
      font-weight:800; font-size:1.25rem;
      background:linear-gradient(90deg,#a64ca6,#6c34cc);
      -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    }
    .auth-wrapper { display:flex; align-items:center; gap:12px; }
    .auth-wrapper img { border-radius:50%; }
    main { flex:1; padding:100px 20px 40px; max-width:1200px; margin:0 auto; }
    .servers {
      display:grid;
      grid-template-columns: repeat(auto-fill, minmax(160px,1fr));
      gap:1rem;
      margin-top: 20px;
      text-align: left;
    }
    .server {
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      padding: 1rem;
      text-align: center;
      transition: transform 0.2s ease;
    }
    .server:hover { transform: translateY(-4px); }
    .server img, .server-icon {
      width:80px; height:80px;
      border-radius:16px;
      margin-bottom:0.5rem;
    }
    .server-icon {
      background: rgba(255,255,255,0.2);
      display:flex; align-items:center; justify-content:center;
      font-weight:bold; font-size:1.5rem;
    }
    .server-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: #f2f2f7;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">Utilix</div>
    <nav class="header-nav">
      <ul>
        <li><a href="/index">Home</a></li>
        <li><a href="/setup">Setup</a></li>
        <li><a href="/faq">FAQ</a></li>
        <li><a href="/changelog">Changelog</a></li>
      </ul>
    </nav>
    <div class="auth-wrapper">
      <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="32" height="32"/>
      <span>${user.username}#${user.discriminator}</span>
      <a href="/logout" style="color:#f55;text-decoration:none">⎋</a>
    </div>
  </header>
  <main>
    ${content}
  </main>
</body>
</html>`;
}

// --- DASHBOARD LIST ---
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const guilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];

  const serversHtml = guilds.length
    ? guilds
        .map(
          (g) => `
        <div class="server">
          <a href="/dashboard/${g.id}">
            ${
              g.icon
                ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" alt="${escapeHtml(
                    g.name
                  )}" />`
                : `<div class="server-icon">${escapeHtml(g.name[0])}</div>`
            }
            <div class="server-name">${escapeHtml(
              g.name.length > 20 ? g.name.slice(0, 20) + "…" : g.name
            )}</div>
          </a>
        </div>`
        )
        .join("")
    : "<p>No servers available</p>";

  res.send(renderLayout(user, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
});

// --- INDIVIDUAL SERVER ---
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const guildId = req.params.id;
  const guild = (req.session.guilds || []).find((g) => g.id === guildId);

  if (!guild) {
    return res.send(renderLayout(user, `<div class="card"><h2>No access</h2></div>`));
  }

  try {
    const MANAGE_GUILD = 0x20;
    const perms = parseInt(guild.permissions || "0", 10) || 0;
    const hasPerm = (perms & MANAGE_GUILD) === MANAGE_GUILD;

    let botCheck = { allowed: false };
    try {
      const botCheckRes = await fetch("https://api.utilix.support/checkPerms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, guildId }),
      });
      botCheck = await botCheckRes.json();
    } catch {}

    if (!hasPerm || !botCheck.allowed) {
      return res.send(renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name)}</h2><p>You don’t have permission to manage this server.</p></div>`));
    }

    res.send(renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name)} Dashboard</h2><p>Template / To be added soon.</p></div>`));
  } catch (err) {
    console.error("Dash error:", err);
    res.status(500).send("Error");
  }
});

// --- LOGOUT ---
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// --- HOME ---
app.get("/", (req, res) => {
  if (req.session.user) res.redirect("/dashboard");
  else res.send(`<a href="/login">Log in with Discord</a>`);
});

// --- ME ---
app.get("/me", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
