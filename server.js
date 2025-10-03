// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

// node-fetch wrapper for CommonJS dynamic import
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

/* ---------------- helpers ---------------- */

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function avatarUrl(user) {
  if (!user) return "";
  if (user.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
  }
  const disc = user.discriminator ? parseInt(user.discriminator, 10) : 0;
  const idx = isNaN(disc) ? 0 : disc % 5;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function guildIconUrl(g) {
  if (!g || !g.icon) return null;
  const ext = g.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}`;
}

function truncateName(name = "", max = 20) {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

/* --------------- render layout --------------- */

function renderLayout(user, contentHtml) {
  const av = escapeHtml(avatarUrl(user || {}));
  const userDisplay = user ? `${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}` : "";
  const addBotUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
    CLIENT_ID || ""
  )}&permissions=8&scope=bot%20applications.commands`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Utilix</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
<style>
:root{
  --bg:#0b0a1e; --fg:#f2f2f7; --accent:#a64ca6; --accent2:#6c34cc;
  --muted:#c0a0ff; --card:rgba(20,10,40,0.85); --panel:rgba(15,5,35,0.95);
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{
  font-family:"Inter",system-ui,-apple-system,Segoe UI,Roboto,Arial;
  background:radial-gradient(circle at 20% 30%, #3b0a5f, var(--bg));
  color:var(--fg);
  min-height:100vh; display:flex; flex-direction:column; overflow-x:hidden;
  position:relative;
}
/* Header */
header{
  position:fixed; top:0; left:0; width:100%; height:72px; z-index:1100;
  display:flex; justify-content:space-between; align-items:center;
  padding:1rem 2rem; backdrop-filter:blur(10px); background:rgba(15,5,35,0.6);
  border-bottom:1px solid rgba(255,255,255,0.05);
}
.logo{
  font-weight:800; font-size:1.25rem;
  background:linear-gradient(90deg,var(--accent),var(--accent2));
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
}
nav.header-nav ul{
  display:flex; gap:1.25rem; list-style:none; align-items:center;
  background: rgba(25,5,50,0.3); padding:0.4rem 0.9rem; border-radius:999px;
  border:1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(12px);
}
nav.header-nav a{
  position:relative; color:var(--fg); text-decoration:none; font-weight:600;
  font-size:0.95rem; padding:0.55rem 1.1rem; border-radius:999px;
}
nav.header-nav a::after{
  content:""; position:absolute; left:50%; bottom:6px;
  transform:translateX(-50%) scaleX(0); transform-origin:center;
  width:60%; height:2px; border-radius:2px;
  background:linear-gradient(90deg,var(--accent),var(--accent2));
  transition: transform 0.3s ease;
}
nav.header-nav a:hover{ color: var(--accent); transform:translateY(-1px); }
nav.header-nav a:hover::after{ transform:translateX(-50%) scaleX(1); }
nav.header-nav a.active{
  background: linear-gradient(90deg, rgba(166,76,166,0.16), rgba(108,52,204,0.12));
  color: white;
  box-shadow: 0 0 12px rgba(166,76,166,0.12);
}

/* Auth area */
.auth-wrapper{ display:flex; align-items:center; gap:12px; }
.auth-wrapper img{ width:36px; height:36px; border-radius:50%; object-fit:cover; }
.discord-btn{
  background:linear-gradient(90deg,var(--accent),var(--accent2)); color:white; font-weight:600;
  padding:0.6rem 1.2rem; border-radius:999px; text-decoration:none;
}
.logout-btn{ font-size:1.1rem; color:#f55; text-decoration:none; }

/* Page layout */
.page{ flex:1; max-width:1200px; margin:0 auto; padding:96px 20px 56px; position:relative; z-index:1; }
h1,h2{ margin-bottom:12px; }

/* Servers grid - responsive, left-to-right wrapping */
.servers{
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap:1rem;
  justify-content:start; /* ensures left aligned */
  align-items:start;
  margin-top: 12px;
}
.server{
  background:var(--card);
  border-radius:12px;
  padding:1rem;
  text-align:center;
  border:1px solid rgba(255,255,255,0.04);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.server:hover{ transform: translateY(-6px); box-shadow: 0 18px 40px rgba(0,0,0,0.6); }
.server img, .server-icon{ width:80px; height:80px; border-radius:16px; margin-bottom:0.5rem; object-fit:cover; }
.server-icon{ display:flex; align-items:center; justify-content:center; background: rgba(255,255,255,0.06); font-weight:700; font-size:1.5rem; }
.server-name{ font-size:0.95rem; color:var(--muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px; margin:0 auto; }

/* cards & pre */
.card{ background:var(--card); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.04); }
pre{ background: rgba(255,255,255,0.02); padding:12px; border-radius:8px; overflow:auto; }

/* starfield canvas sits behind UI */
.canvas-wrap{ position:fixed; inset:0; z-index:0; pointer-events:none; }
canvas#starfield{ width:100%; height:100%; display:block; }

/* mobile tweaks */
@media (max-width:768px){
  header{ padding:0.75rem 1rem; height:64px; }
  .page{ padding-top:88px; }
}
</style>
</head>
<body>
  <header>
    <div style="display:flex;align-items:center;gap:16px">
      <div class="logo">Utilix</div>
      <nav class="header-nav" aria-label="Primary navigation">
        <ul>
          <li><a href="/index" class="active">Home</a></li>
          <li><a href="/setup">Setup</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="/changelog">Changelog</a></li>
        </ul>
      </nav>
    </div>

    <div style="display:flex;align-items:center;gap:12px">
      <a class="discord-btn" href="/dashboard">Manage Servers</a>
      <a class="discord-btn" href="${escapeHtml(addBotUrl)}" target="_blank" rel="noopener">Add to Server</a>

      <div class="auth-wrapper">
        <img src="${av}" alt="avatar"/>
        <div style="font-weight:600">${userDisplay}</div>
        <a href="/logout" class="logout-btn" title="Logout">⎋</a>
      </div>
    </div>
  </header>

  <div class="canvas-wrap"><canvas id="starfield"></canvas></div>

  <main class="page">
    ${contentHtml}
  </main>

<script>
/* starfield animation */
const canvas = document.getElementById('starfield');
const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
function resizeCanvas(){ if(!ctx) return; canvas.width = innerWidth; canvas.height = innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
let stars = [];
function createStars(){ stars = []; for(let i=0;i<200;i++){ stars.push({ x:Math.random()*canvas.width, y:Math.random()*canvas.height, r:Math.random()*1.5, s:Math.random()*0.5+0.1, c:'hsl('+ (Math.random()*360) +',70%,80%)' }); } }
function animate(){ if(!ctx) return; ctx.fillStyle = 'rgba(11,10,30,0.3)'; ctx.fillRect(0,0,canvas.width,canvas.height); for(const s of stars){ s.y -= s.s; if(s.y < 0) s.y = canvas.height; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fillStyle = s.c; ctx.fill(); } requestAnimationFrame(animate); }
createStars(); animate();
</script>
</body>
</html>`;
}

/* ---------------- OAuth: login & callback ---------------- */

app.get("/login", (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(500).send("Server not configured (DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI missing).");
  }
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const tokenData = await tokenResponse.json();
    if (!tokenData || !tokenData.access_token) {
      console.error("Token error:", tokenData);
      return res.status(500).send("Failed to obtain access token");
    }

    // Save jwt (Discord access token) for calling Utilix API that expects Authorization: Bearer <jwt>
    req.session.jwt = tokenData.access_token;

    // fetch basic user info
    const userResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResp.json();

    // fetch guilds
    const guildResp = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    let guilds = await guildResp.json();
    if (!Array.isArray(guilds)) guilds = [];

    // optionally filter guilds by bot_guilds.json (if present)
    let botGuilds = [];
    try {
      const filePath = path.join(__dirname, "bot_guilds.json");
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) botGuilds = parsed.map(String);
    } catch (err) {
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

/* ---------------- Dashboard list (servers) ---------------- */

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const guilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];

  const serversHtml =
    guilds.length > 0
      ? guilds
          .map((g) => {
            const display = truncateName(g.name || "");
            const icon = guildIconUrl(g);
            const iconHtml = icon
              ? `<img src="${escapeHtml(icon)}" alt="${escapeHtml(display)}" />`
              : `<div class="server-icon">${escapeHtml((display || "").charAt(0).toUpperCase())}</div>`;
            return `<div class="server"><a href="/dashboard/${encodeURIComponent(
              g.id
            )}">${iconHtml}<div class="server-name">${escapeHtml(display)}</div></a></div>`;
          })
          .join("")
      : "<p>No servers available</p>";

  const content = `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`;
  res.send(renderLayout(user, content));
});

/* --------------- Individual server dashboard --------------- */

app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const jwt = req.session.jwt;
  const guildId = req.params.id;
  const guild = (req.session.guilds || []).find((g) => String(g.id) === String(guildId));

  if (!guild) {
    return res.send(
      renderLayout(user, `<div class="card"><h2>No access</h2><p>You don't have access to this server.</p><a href="/dashboard" style="color:#a64ca6">← Back to servers</a></div>`)
    );
  }

  try {
    // safe parse of permissions (Discord sometimes omits it)
    const MANAGE_GUILD = 0x20;
    const permsInt = parseInt(guild.permissions || "0", 10) || 0;
    const hasManageGuild = (permsInt & MANAGE_GUILD) === MANAGE_GUILD;

    // Call your utilix API to check perms using JWT in Authorization header
    let botCheck = { allowed: false };
    try {
      if (!jwt) throw new Error("JWT missing in session");
      const botCheckRes = await fetch("https://api.utilix.support/checkPerms", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ guildId: guild.id }),
      });
      if (botCheckRes.ok) {
        botCheck = await botCheckRes.json();
      } else {
        // treat non-200 as not allowed (but don't crash)
        botCheck = { allowed: false, error: `checkPerms returned ${botCheckRes.status}` };
      }
    } catch (err) {
      console.warn("checkPerms request failed:", err);
      botCheck = { allowed: false };
    }

    // If either discord permission bit OR botCheck allowed is false -> show no permission styled page
    if (!hasManageGuild || !botCheck.allowed) {
      return res.send(
        renderLayout(
          user,
          `<div class="card">
            <div style="display:flex;gap:16px;align-items:center">
              ${
                guildIconUrl(guild)
                  ? `<img src="${escapeHtml(guildIconUrl(guild))}" style="width:80px;height:80px;border-radius:12px" />`
                  : `<div style="width:80px;height:80px;border-radius:12px;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center">${escapeHtml(
                      (guild.name || "").charAt(0).toUpperCase()
                    )}</div>`
              }
              <div>
                <h2 style="margin:0">${escapeHtml(guild.name)}</h2>
                <p style="color:var(--muted);margin:6px 0">You don’t have permission to manage this server’s bot dashboard.</p>
                <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>
              </div>
            </div>
          </div>`
        )
      );
    }

    // Allowed - attempt to fetch Utilix config & shop (if available)
    let configJson = { note: "Not available" };
    let shopJson = { note: "Not available" };

    if (jwt) {
      try {
        const [configRes, shopRes] = await Promise.all([
          fetch(`https://api.utilix.support/dashboard/${encodeURIComponent(guildId)}`, {
            headers: { Authorization: `Bearer ${jwt}` },
          }),
          fetch(`https://api.utilix.support/dashboard/${encodeURIComponent(guildId)}/shop`, {
            headers: { Authorization: `Bearer ${jwt}` },
          }),
        ]);

        if (configRes.ok) configJson = await configRes.json();
        else configJson = { error: `config request failed (${configRes.status})` };

        if (shopRes.ok) shopJson = await shopRes.json();
        else shopJson = { error: `shop request failed (${shopRes.status})` };
      } catch (err) {
        console.warn("Fetching utilix config/shop failed:", err);
        configJson = { error: "Failed to fetch config" };
        shopJson = { error: "Failed to fetch shop" };
      }
    }

    const content = `
      <div class="card">
        <div style="display:flex;gap:16px;align-items:center">
          ${
            guildIconUrl(guild)
              ? `<img src="${escapeHtml(guildIconUrl(guild))}" style="width:80px;height:80px;border-radius:12px" />`
              : `<div style="width:80px;height:80px;border-radius:12px;background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center">${escapeHtml(
                  (guild.name || "").charAt(0).toUpperCase()
                )}</div>`
          }
          <div>
            <h2 style="margin:0">${escapeHtml(guild.name)}</h2>
            <p style="color:var(--muted);margin:6px 0">Server ID: ${escapeHtml(guild.id)}</p>
          </div>
        </div>

        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.04);margin:12px 0"/>

        <h3>Config</h3>
        <pre>${escapeHtml(JSON.stringify(configJson, null, 2))}</pre>

        <h3 style="margin-top:12px">Shop Items</h3>
        <pre>${escapeHtml(JSON.stringify(shopJson, null, 2))}</pre>

        <div style="margin-top:12px">
          <a href="/dashboard" style="color:#a64ca6">← Back to servers</a>
        </div>
      </div>
    `;

    return res.send(renderLayout(user, content));
  } catch (err) {
    console.error("Dashboard error:", err);
    return res.status(500).send(renderLayout(user, `<div class="card"><h2>Error</h2><p>Something went wrong. Check server logs.</p></div>`));
  }
});

/* ---------------- misc routes ---------------- */

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  return res.send(
    `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Utilix</title></head><body style="font-family:Inter,Arial;background:radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);color:#fff;padding:40px"><h1>Utilix</h1><p><a href="/login" style="color:#a64ca6">Log in with Discord</a></p></body></html>`
  );
});

app.get("/me", (req, res) => {
  if (req.session.user) return res.json({ loggedIn: true, user: req.session.user });
  return res.json({ loggedIn: false });
});

/* ---------------- start ---------------- */

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
