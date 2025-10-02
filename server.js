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

/* -------------------------
   Helpers
   ------------------------- */
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
function discordAvatarUrl(user) {
  if (!user) return "";
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
  }
  // fallback default avatar
  const disc = user && user.discriminator ? parseInt(user.discriminator) : 0;
  const idx = isNaN(disc) ? 0 : disc % 5;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
function guildIconUrl(g) {
  if (!g || !g.icon) return null;
  const ext = g.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}`;
}

/* -------------------------
   OAuth / Auth routes
   ------------------------- */

// login -> redirect to Discord oauth
app.get("/login", (req, res) => {
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

// callback -> exchange code, fetch user + guilds, filter by bot_guilds.json
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
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    let guilds = await guildResponse.json();
    if (!Array.isArray(guilds)) guilds = [];

    // filter servers bot is in (bot_guilds.json expected to be an array of ids)
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

    req.session.user = userData;
    req.session.guilds = filteredGuilds;

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
});

/* -------------------------
   Page renderer (dashboard)
   ------------------------- */
function renderPage(user, guilds) {
  const avatarUrl = discordAvatarUrl(user);

  const serversHtml = Array.isArray(guilds) && guilds.length
    ? guilds
        .map((g) => {
          const displayName =
            typeof g.name === "string" && g.name.length > 20
              ? g.name.substring(0, 20) + "…"
              : g.name || "Unnamed";
          const nameEsc = escapeHtml(displayName);
          const icon = guildIconUrl(g);
          const iconHtml = icon
            ? `<img src="${icon}" alt="${nameEsc}" />`
            : `<div class="server-icon">${escapeHtml(firstChar(displayName))}</div>`;
          return `<div class="server">
            <a href="/dashboard/${encodeURIComponent(g.id)}">
              ${iconHtml}
              <div class="server-name" title="${escapeHtml(g.name)}">${nameEsc}</div>
            </a>
          </div>`;
        })
        .join("")
    : `<p style="color:var(--muted)">No servers available</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Utilix — Dashboard</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0b0a1e;
      --fg: #f2f2f7;
      --accent: #a64ca6;
      --accent2: #6c34cc;
      --muted: #c0a0ff;
      --card: rgba(20, 10, 40, 0.8);
      --panel: rgba(15, 5, 35, 0.9);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      background: radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);
      color: var(--fg);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow-x: hidden;
    }

    header {
      position: fixed;
      top: 0; left: 0; width: 100%;
      z-index: 1100;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
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
      letter-spacing: -0.02em;
    }

    nav.header-nav ul {
      display: flex;
      gap: 1.25rem;
      list-style: none;
      align-items: center;
      flex-wrap: wrap;
      background: rgba(25, 5, 50, 0.3);
      padding: 0.4rem 0.9rem;
      border-radius: 999px;
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    nav.header-nav a {
      position: relative;
      color: var(--fg);
      text-decoration: none;
      font-weight: 600;
      font-size: 0.95rem;
      padding: 0.55rem 1.1rem;
      border-radius: 999px;
      transition: color 0.25s ease, background 0.25s ease, transform 0.2s ease;
    }

    nav.header-nav a::after {
      content: "";
      position: absolute;
      left: 50%;
      bottom: 6px;
      transform: translateX(-50%) scaleX(0);
      transform-origin: center;
      width: 60%;
      height: 2px;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      border-radius: 2px;
      transition: transform 0.3s ease;
    }

    nav.header-nav a:hover {
      color: var(--accent);
      transform: translateY(-1px);
    }

    nav.header-nav a:hover::after {
      transform: translateX(-50%) scaleX(1);
    }

    .discord-btn {
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      color: white;
      font-weight: 600;
      padding: 0.5rem 0.85rem;
      border-radius: 999px;
      text-decoration: none;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      display: inline-block;
    }
    .discord-btn:hover { transform: translateY(-2px); }

    .auth-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .auth-wrapper img { border-radius: 50%; width:36px; height:36px; }

    main {
      flex: 1;
      padding: 110px 20px 40px;
      max-width: 1200px;
      margin: 0 auto;
      z-index: 10;
    }

    h2 { margin-bottom: 1rem; font-size: 1.6rem; }

    .servers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1.25rem;
      align-items: start;
    }

    .server {
      background: var(--card);
      border-radius: 14px;
      padding: 1.1rem;
      text-align: center;
      transition: transform .12s ease, box-shadow .12s ease;
      width: 100%;
      max-width: 220px;
      margin: 0 auto;
    }
    .server:hover { transform: translateY(-6px); box-shadow: 0 12px 28px rgba(0,0,0,0.6); }

    .server img, .server-icon {
      width: 80px; height: 80px; border-radius: 16px; margin-bottom: 0.6rem;
    }
    .server-icon {
      background: rgba(255,255,255,0.08);
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:1.4rem;
    }

    .server-name {
      color: var(--muted);
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 180px;
      margin: 0 auto;
    }

    canvas#starfield {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      z-index: 0;
      pointer-events: none;
    }

    @media (max-width: 640px) {
      header { padding: 0.8rem 1rem; height:64px; }
      main { padding-top: 90px; }
    }
  </style>
</head>
<body>
  <header>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="logo">Utilix</div>
      <nav class="header-nav" aria-label="Primary navigation">
        <ul style="display:flex;align-items:center;">
          <li><a href="/index" class="active">Home</a></li>
          <li><a href="/setup">Setup</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="/changelog">Changelog</a></li>
        </ul>
      </nav>
    </div>

    <div style="display:flex;align-items:center;gap:12px">
      <a href="/dashboard" class="discord-btn" title="Manage Servers">Manage Servers</a>
      <a href="https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
        CLIENT_ID
      )}&permissions=8&scope=bot%20applications.commands" class="discord-btn" target="_blank" rel="noopener" title="Invite Bot">Add to Server</a>

      <div class="auth-wrapper">
        <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(user.username)}" />
        <div style="font-weight:600">${escapeHtml(user.username)}#${escapeHtml(
    user.discriminator
  )}</div>
        <a href="/logout" title="Logout" style="color:#f55;text-decoration:none;font-weight:700">⎋</a>
      </div>
    </div>
  </header>

  <canvas id="starfield"></canvas>

  <main>
    <h2>Your Servers</h2>
    <div class="servers">
      ${serversHtml}
    </div>
  </main>

  <script>
    // starfield
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    let stars = [];
    function resizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    function createStars() {
      stars = [];
      for (let i = 0; i < 200; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: Math.random() * 1.5,
          s: Math.random() * 0.5 + 0.1,
          c: 'hsl(' + (Math.random() * 360) + ',70%,80%)'
        });
      }
    }

    function animate() {
      ctx.fillStyle = 'rgba(11,10,30,0.3)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      for (let s of stars) {
        s.y -= s.s;
        if (s.y < 0) s.y = canvas.height;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.c;
        ctx.fill();
      }
      requestAnimationFrame(animate);
    }

    createStars();
    animate();
  </script>
</body>
</html>`;
}

/* -------------------------
   Routes
   ------------------------- */

// Dashboard (uses renderPage helper)
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const guilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];
  try {
    res.send(renderPage(user, guilds));
  } catch (err) {
    console.error("Render error:", err);
    res.status(500).send("Server error");
  }
});

// Per-server dashboard (permission check)
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const user = req.session.user;
  const guild = req.session.guilds.find((g) => String(g.id) === String(guildId));
  if (!guild) return res.send("You don’t have access to this server.");

  try {
    const MANAGE_GUILD = 0x20;
    const hasManageGuild =
      (parseInt(guild.permissions, 10) & MANAGE_GUILD) === MANAGE_GUILD;

    const response = await fetch("https://api.utilix.support/checkPerms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, guildId: guild.id }),
    });
    const botCheck = await response.json();

    if (!hasManageGuild || !botCheck.allowed) {
      return res.send(`<body style="background:#0b0a1e;color:white;font-family:Inter">
        <h1>${escapeHtml(guild.name)} Dashboard</h1>
        <p>You don’t have permission to manage this server’s bot dashboard.</p>
        <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>
      </body>`);
    }

    return res.send(`<body style="background:#0b0a1e;color:white;font-family:Inter">
      <h1>${escapeHtml(guild.name)} Dashboard</h1>
      <p>This is a template / to be added soon.</p>
      <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>
    </body>`);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Error checking permissions");
  }
});

// logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// homepage
app.get("/", (req, res) => {
  if (req.session.user) res.redirect("/dashboard");
  else res.send(`<a href="/login">Log in with Discord</a>`);
});

// me endpoint for client-side checks (your existing code uses this)
app.get("/me", (req, res) => {
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

/* -------------------------
   Start server
   ------------------------- */
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
