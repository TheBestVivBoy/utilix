// server.js
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

// Config from env
const CLIENT_ID = process.env.DISCORD_CLIENT_ID || "1392737327125762199";
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || "http://localhost:3000/callback";
const PORT = process.env.PORT || 3000;

/* -------------------------
   Helpers
   ------------------------- */
function escapeHtml(str) {
  if (str === undefined || str === null) return "";
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

// user may have avatar === null
function discordAvatarUrl(user) {
  if (user && user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
  }
  // default embed avatar index by discriminator
  const disc = user && user.discriminator ? parseInt(user.discriminator, 10) : 0;
  const idx = isNaN(disc) ? 0 : disc % 5;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function guildIconUrl(g) {
  if (!g || !g.icon) return null;
  const ext = g.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}`;
}

function truncate(name, max = 20) {
  if (!name) return "";
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

/* -------------------------
   OAuth + Routes
   ------------------------- */

// Login: redirect to Discord
app.get("/login", (req, res) => {
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

// Callback: exchange code for token, fetch user + guilds, filter by bot_guilds.json
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code provided");

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
      console.error("Token response:", tokenData);
      return res.status(500).send("Error getting token");
    }

    // Fetch user
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    // Fetch guilds
    const guildResponse = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    let guilds = await guildResponse.json();
    if (!Array.isArray(guilds)) guilds = [];

    // Read bot_guilds.json and coerce values to strings
    let botGuilds = [];
    try {
      const filePath = path.join(__dirname, "bot_guilds.json");
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) botGuilds = parsed.map(String);
    } catch (err) {
      // if file missing or invalid, fallback to show all guilds
      console.warn("bot_guilds.json not read or invalid, showing all guilds. err:", err.message || err);
      botGuilds = [];
    }

    const filteredGuilds =
      Array.isArray(botGuilds) && botGuilds.length > 0
        ? guilds.filter((g) => botGuilds.includes(String(g.id)))
        : guilds;

    // Save minimal session info
    req.session.user = userData;
    req.session.guilds = filteredGuilds;

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
});

/* -------------------------
   Render helper for full page
   ------------------------- */
function renderPage(user, title, contentHtml) {
  const avatar = user ? escapeHtml(discordAvatarUrl(user)) : "";
  const username = user ? escapeHtml(user.username) : "";
  const discriminator = user ? escapeHtml(user.discriminator) : "";
  const addToServerUrl = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Utilix — ${escapeHtml(title)}</title>
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
    *{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{font-family:"Inter",system-ui,Arial;background:radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);color:var(--fg);min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden;position:relative}
    header{position:fixed;top:0;left:0;width:100%;z-index:1100;padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,0.05);height:72px;background:rgba(15,5,35,0.6)}
    .logo{font-weight:800;font-size:1.25rem;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;letter-spacing:-0.02em}
    nav.header-nav ul{display:flex;gap:1.25rem;list-style:none;align-items:center;flex-wrap:wrap;background:rgba(25,5,50,0.3);padding:0.4rem 0.9rem;border-radius:999px;backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08)}
    nav.header-nav a{position:relative;color:var(--fg);text-decoration:none;font-weight:600;font-size:0.95rem;padding:0.55rem 1.1rem;border-radius:999px;transition:color .25s,background .25s,transform .2s}
    nav.header-nav a.active{background:linear-gradient(90deg,rgba(166,76,166,0.16),rgba(108,52,204,0.12));color:#fff}
    .discord-btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;font-weight:600;padding:0.6rem 1.2rem;border-radius:999px;text-decoration:none;margin-left:8px}
    .discord-btn:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,0.5)}
    .auth-wrapper{display:flex;align-items:center;gap:12px}
    .auth-wrapper img{border-radius:50%}
    .logout-btn{font-size:1.2rem;color:#f55;text-decoration:none;margin-left:8px}
    .page{flex:1;max-width:1200px;margin:0 auto;padding:96px 20px 56px;position:relative;z-index:10}
    .servers{display:grid;grid-template-columns:repeat(auto-fit,200px);gap:1.25rem;justify-content:center;justify-items:center}
    .server{background:var(--card);border-radius:14px;padding:1.1rem;text-align:center;transition:transform .18s ease,box-shadow .18s ease;width:200px}
    .server:hover{transform:translateY(-6px);box-shadow:0 18px 40px rgba(0,0,0,0.6)}
    .server img,.server-icon{width:80px;height:80px;border-radius:16px;margin-bottom:0.5rem}
    .server-icon{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.08);font-weight:700;font-size:1.4rem}
    .server-name{color:var(--muted);font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%}
    canvas#starfield{position:fixed;top:0;left:0;width:100%;height:100%;z-index:0;pointer-events:none}
    @media(max-width:768px){header{flex-direction:column;gap:.8rem;align-items:flex-start}}
  </style>
</head>
<body>
  <header>
    <div class="logo">Utilix</div>
    <nav class="header-nav" aria-label="Primary navigation">
      <ul>
        <li><a href="/index">Home</a></li>
        <li><a href="/setup">Setup</a></li>
        <li><a href="/faq">FAQ</a></li>
        <li><a href="/changelog">Changelog</a></li>
      </ul>
    </nav>

    <div class="auth-wrapper">
      ${
        user
          ? `<a href="/dashboard" class="discord-btn">Manage Servers</a>
             <a href="${addToServerUrl}" class="discord-btn" target="_blank" rel="noopener">Add to Server</a>
             <img src="${avatar}" width="32" height="32" alt="avatar" />
             <span style="font-weight:600">${username}#${discriminator}</span>
             <a href="/logout" class="logout-btn">⎋</a>`
          : `<a href="/login" class="discord-btn">Log in with Discord</a>`
      }
    </div>
  </header>

  <canvas id="starfield"></canvas>

  <main class="page">
    <h2 style="margin-bottom:18px;">${escapeHtml(title)}</h2>
    ${contentHtml}
  </main>

  <script>
    // starfield
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    let stars = [];
    function resize(){ canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();
    function createStars(){ stars = []; for(let i=0;i<200;i++){ stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, radius: Math.random()*1.5, speed: Math.random()*0.5+0.1, color: \`hsl(\${Math.random()*360},70%,80%)\` }); } }
    function animate(){ ctx.fillStyle = 'rgba(11,10,30,0.3)'; ctx.fillRect(0,0,canvas.width,canvas.height); stars.forEach(s=>{ s.y -= s.speed; if(s.y < 0) s.y = canvas.height; ctx.beginPath(); ctx.arc(s.x,s.y,s.radius,0,Math.PI*2); ctx.fillStyle = s.color; ctx.fill(); }); requestAnimationFrame(animate); }
    createStars(); animate();
  </script>
</body>
</html>`;
}

/* -------------------------
   Dashboard: list servers grid (left -> right)
   ------------------------- */
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = req.session.user;
  const guilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];

  const serversHtml = guilds.length
    ? guilds
        .map((g) => {
          const icon = guildIconUrl(g);
          const displayName = truncate(g.name || "Unnamed");
          const safeName = escapeHtml(displayName);
          const iconHtml = icon
            ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(g.name || '')}" />`
            : `<div class="server-icon">${escapeHtml(firstChar(g.name || " "))}</div>`;
          return `<div class="server">
                    <a href="/dashboard/${encodeURIComponent(g.id)}" title="${escapeHtml(g.name || '')}" style="color:inherit;text-decoration:none;">
                      ${iconHtml}
                      <div class="server-name">${safeName}</div>
                    </a>
                  </div>`;
        })
        .join("")
    : `<div style="color:var(--muted)">No servers available</div>`;

  res.send(renderPage(user, "Your Servers", `<div class="servers">${serversHtml}</div>`));
});

/* -------------------------
   Individual server dashboard (same layout + permission check)
   ------------------------- */
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const guildId = String(req.params.id);
  const user = req.session.user;
  const guild = (Array.isArray(req.session.guilds) ? req.session.guilds : []).find((g) => String(g.id) === guildId);

  if (!guild) {
    return res.send(renderPage(user, "Error", `<p>You don’t have access to this server.</p><a href="/dashboard" style="color:#a64ca6">← Back to servers</a>`));
  }

  try {
    const MANAGE_GUILD = 0x20;
    const permNum = typeof guild.permissions === "string" ? parseInt(guild.permissions, 10) : guild.permissions;
    const hasManageGuild = (parseInt(permNum || 0, 10) & MANAGE_GUILD) === MANAGE_GUILD;

    // Ask bot API if allowed (your external API)
    let botAllowed = false;
    try {
      const response = await fetch("https://api.utilix.support/checkPerms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, guildId: guild.id }),
      });
      const json = await response.json();
      botAllowed = !!json.allowed;
    } catch (err) {
      console.warn("Bot permission check failed:", err);
      botAllowed = false;
    }

    if (!hasManageGuild || !botAllowed) {
      const content = `<p>You don’t have permission to manage this server’s bot dashboard.</p>
                       <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>`;
      return res.send(renderPage(user, `${escapeHtml(guild.name)} Dashboard`, content));
    }

    const guildIcon = guildIconUrl(guild);
    const guildIconHtml = guildIcon
      ? `<img src="${escapeHtml(guildIcon)}" alt="${escapeHtml(guild.name)}" style="width:80px;height:80px;border-radius:12px" />`
      : `<div style="width:80px;height:80px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(255,255,255,0.06)">${escapeHtml(firstChar(guild.name))}</div>`;

    const content = `
      <div style="background:var(--card);padding:18px;border-radius:12px;border:1px solid rgba(255,255,255,0.04)">
        <div style="display:flex;gap:16px;align-items:center">
          <div>${guildIconHtml}</div>
          <div>
            <h3 style="margin:0">${escapeHtml(guild.name)}</h3>
            <div style="color:var(--muted);margin-top:6px">Server ID: ${escapeHtml(guild.id)}</div>
          </div>
        </div>

        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.04);margin:16px 0" />

        <div>
          <h4>Bot Settings</h4>
          <p style="color:var(--muted)">This is a template / to be added soon.</p>
        </div>

        <div style="margin-top:12px">
          <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>
        </div>
      </div>
    `;

    res.send(renderPage(user, `${escapeHtml(guild.name)} Dashboard`, content));
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Error checking permissions");
  }
});

/* -------------------------
   Logout / Home / Me
   ------------------------- */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  // Simple landing: link to login (the full site template lives in your static pages)
  res.send(`<a href="/login">Log in with Discord</a>`);
});

app.get("/me", (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

/* -------------------------
   Start
   ------------------------- */
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
