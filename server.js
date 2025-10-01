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

/**
 * Helpers
 */
function discordAvatarUrl(user) {
  // user.avatar may be null
  if (user && user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
  }
  // fallback default avatar (uses discriminator modulo 5)
  const disc = user && user.discriminator ? parseInt(user.discriminator) : 0;
  const idx = isNaN(disc) ? 0 : disc % 5;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}
function guildIconUrl(g) {
  if (!g || !g.icon) return null;
  const ext = g.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}`;
}

/* ---------- ROUTES ---------- */

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
    // Read bot_guilds.json and coerce to string IDs
    let botGuilds = [];
    try {
      const filePath = path.join(__dirname, "bot_guilds.json");
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        botGuilds = parsed.map(String);
      } else {
        botGuilds = [];
      }
    } catch (err) {
      console.error("Could not read bot_guilds.json:", err.message);
      botGuilds = [];
    }

    // Ensure guild.id is string and compare as strings
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

  // Build the server cards HTML safely-ish
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
              <div class="server-name">${escapeHtml(g.name)}</div>
            </a>`;
        })
        .join("")
    : "<p>No servers available</p>";

  // Build the dropdown items for header menu
  const headerDropdownHtml = guilds.length
    ? guilds
        .map((g) => {
          const icon = guildIconUrl(g);
          const iconImg = icon
            ? `<img src="${icon}" alt="${escapeHtml(g.name)}" />`
            : `<div class="dd-icon">${escapeHtml(firstChar(g.name))}</div>`;
          return `<a class="dd-item" href="/dashboard/${encodeURIComponent(
            g.id
          )}" title="${escapeHtml(g.name)}">
              ${iconImg}
              <span>${escapeHtml(g.name)}</span>
            </a>`;
        })
        .join("")
    : `<div style="padding:12px;color:var(--muted)">No servers</div>`;

  // Avatar url
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
      --panel: rgba(15, 5, 35, 0.95);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
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

    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Manage dropdown */
    .manage-wrap { position: relative; }
    .manage-btn {
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      color: white;
      font-weight: 600;
      padding: 0.5rem 0.85rem;
      border-radius: 999px;
      border: none;
      cursor: pointer;
    }
    .manage-dropdown {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      background: var(--panel);
      border-radius: 12px;
      padding: 12px;
      box-shadow: 0 12px 28px rgba(0,0,0,0.6);
      min-width: 320px;
      display: none;
      z-index: 1200;
      border: 1px solid rgba(255,255,255,0.04);
    }
    .manage-wrap:hover .manage-dropdown { display: block; }
    .dd-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
    }
    .dd-item {
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 8px;
      border-radius: 8px;
      text-decoration: none;
      color: var(--fg);
      min-width: 260px;
    }
    .dd-item img { width: 40px; height: 40px; border-radius: 8px; }
    .dd-item .dd-icon {
      width: 40px; height: 40px; border-radius: 8px; display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.06);font-weight:700;
    }

    .add-btn {
      background: rgba(255,255,255,0.04);
      padding: 0.45rem 0.75rem;
      border-radius: 10px;
      color: var(--fg);
      text-decoration: none;
      font-weight: 600;
    }

    .auth-wrapper {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: 8px;
    }
    .auth-wrapper img { width: 36px; height: 36px; border-radius: 50%; }

    .logout-btn {
      font-size: 1.1rem;
      color: #f55;
      text-decoration: none;
      margin-left: 6px;
    }

    main {
      flex: 1;
      padding: 110px 20px 40px;
      max-width: 1200px;
      margin: 0 auto;
      z-index: 10;
    }

    h2 { margin-bottom: 1rem; }

    /* Centered server grid */
    .servers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1.5rem;
      justify-items: center;      /* center items horizontally in their columns */
      justify-content: center;    /* center the whole grid inside the container */
      align-items: start;
    }

    .server {
      background: var(--card);
      border-radius: 14px;
      padding: 1rem;
      text-align: center;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
      border: 1px solid rgba(255, 255, 255, 0.05);
      width: 100%;
      max-width: 220px;
    }
    .server:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0,0,0,0.6);
    }
    .server img, .server-icon {
      width: 80px;
      height: 80px;
      border-radius: 16px;
      margin-bottom: 0.5rem;
    }
    .server-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.1);
      font-size: 1.5rem;
      font-weight: bold;
    }
    .server-name { font-size: 0.95rem; color: var(--muted); word-break: break-word; }

    a { color: inherit; text-decoration: none; }
    canvas#starfield {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    }

    @media (max-width: 768px) {
      .manage-dropdown { left: 8px; right: 8px; min-width: auto; }
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">Utilix</div>
    <div class="header-right">
      <div class="manage-wrap">
        <button class="manage-btn">Manage Servers ▾</button>
        <div class="manage-dropdown">
          <div style="margin-bottom:8px;color:var(--muted);font-weight:700">Your servers</div>
          <div class="dd-grid">
            ${headerDropdownHtml}
          </div>
        </div>
      </div>

      <a class="add-btn" href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands" target="_blank" rel="noopener">Add to Server</a>

      <div class="auth-wrapper">
        <img src="${avatarUrl}" alt="${escapeHtml(user.username)}" />
        <div style="font-weight:600">${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</div>
        <a href="/logout" class="logout-btn" title="Logout">⎋</a>
      </div>
    </div>
  </header>

  <main>
    <h2>Your Servers</h2>
    <div class="servers">
      ${serverCardsHtml}
    </div>
  </main>

  <canvas id="starfield"></canvas>

  <script>
    // starfield (same as your theme)
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    let stars = [];
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize);
    resize();
    function createStars() {
      stars = [];
      for(let i=0;i<200;i++){
        stars.push({ x: Math.random()*canvas.width, y: Math.random()*canvas.height, radius: Math.random()*1.5, speed: Math.random()*0.5+0.1, color: \`hsl(\${Math.random()*360},70%,80%)\` });
      }
    }
    function animate() {
      ctx.fillStyle = 'rgba(11,10,30,0.3)';
      ctx.fillRect(0,0,canvas.width,canvas.height);
      stars.forEach(s => {
        s.y -= s.speed;
        if (s.y < 0) s.y = canvas.height;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI*2);
        ctx.fillStyle = s.color;
        ctx.fill();
      });
      requestAnimationFrame(animate);
    }
    createStars();
    animate();
  </script>
</body>
</html>`);
});

// --- INDIVIDUAL SERVER DASHBOARD (styled similar to main dashboard) ---
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const guildId = req.params.id;
  const user = req.session.user;
  const guild = req.session.guilds.find((g) => String(g.id) === String(guildId));

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
        <!DOCTYPE html><html><head><meta charset="utf-8"/><title>No permission</title></head><body style="background:#0b0a1e;color:white;font-family:Inter,Arial;">
          <div style="padding:40px;max-width:900px;margin:40px auto;">
            <h1>${escapeHtml(guild.name)} Dashboard</h1>
            <p>You don’t have permission to manage this server’s bot dashboard.</p>
            <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>
          </div>
        </body></html>
      `);
    }

    // Styled per-server dashboard (simple)
    const guildIcon = guildIconUrl(guild) || '';
    const avatarUrl = discordAvatarUrl(user);

    res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(guild.name)} — Utilix</title>
<style>
  :root{--bg:#0b0a1e;--fg:#f2f2f7;--accent:#a64ca6;--card:rgba(20,10,40,0.8);}
  body{font-family:Inter,system-ui,Arial;background:radial-gradient(circle at 20% 30%, #3b0a5f, var(--bg));color:var(--fg);margin:0;min-height:100vh;display:flex;flex-direction:column;}
  header{position:fixed;top:0;left:0;width:100%;padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;background:rgba(15,5,35,0.6);height:72px;z-index:1100;border-bottom:1px solid rgba(255,255,255,0.04);}
  .logo{font-weight:800;background:linear-gradient(90deg,var(--accent),#6c34cc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
  .auth{display:flex;align-items:center;gap:10px}
  .auth img{width:36px;height:36px;border-radius:50%}
  main{padding:110px 20px 40px;max-width:1200px;margin:0 auto}
  .card{background:var(--card);border-radius:12px;padding:20px;border:1px solid rgba(255,255,255,0.04)}
  .guild-header{display:flex;align-items:center;gap:16px}
  .guild-icon{width:80px;height:80px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.06)}
  a{color:inherit;text-decoration:none}
</style></head><body>
<header><div class="logo">Utilix</div><div class="auth"><img src="${avatarUrl}" alt="avatar"/><div style="font-weight:600">${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</div><a href="/logout" style="color:#f55">⎋</a></div></header>
<main>
  <div class="card">
    <div class="guild-header">
      <div class="guild-icon">${ guildIcon ? `<img src="${guildIcon}" alt="${escapeHtml(guild.name)}" style="width:80px;height:80px;border-radius:12px"/>` : `<div style="width:80px;height:80px;display:flex;align-items:center;justify-content:center">${escapeHtml(firstChar(guild.name))}</div>` }</div>
      <div>
        <h1 style="margin:0">${escapeHtml(guild.name)}</h1>
        <p style="color:#c0a0ff;margin:6px 0">Server ID: ${escapeHtml(guild.id)}</p>
      </div>
    </div>

    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.05);margin:16px 0"/>

    <div>
      <h3>Bot Settings</h3>
      <p style="color:#c0a0ff">(placeholder) You can fetch and show bot settings from your API here.</p>
      <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>
    </div>
  </div>
</main>
<canvas id="starfield"></canvas>
<script>
  // minimal starfield
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
  window.addEventListener('resize',resize);
  resize();
  const stars=[];
  for(let i=0;i<200;i++){stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.5,s:Math.random()*0.5+0.1,c:\`hsl(\${Math.random()*360},70%,80%)\`})}
  function anim(){ctx.fillStyle='rgba(11,10,30,0.3)';ctx.fillRect(0,0,canvas.width,canvas.height);stars.forEach(s=>{s.y-=s.s;if(s.y<0)s.y=canvas.height;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=s.c;ctx.fill()});requestAnimationFrame(anim)}
  anim();
</script>
</body></html>`);
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

// --- USER INFO ROUTE (for frontend header) ---
app.get("/me", (req, res) => {
  if (req.session.user) {
    res.json({
      loggedIn: true,
      user: req.session.user,
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

/* -------------------------
   Small utility functions
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
