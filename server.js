// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const jwtLib = require("jsonwebtoken");

// node-fetch wrapper for CommonJS dynamic import
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const app = express();
app.use(bodyParser.json());
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
const JWT_SECRET = process.env.JWT_SECRET;
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
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap:1rem;
  justify-content:start;
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

/* cards */
.card{ background:var(--card); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.04); }

/* starfield */
.canvas-wrap{ position:fixed; inset:0; z-index:0; pointer-events:none; }
canvas#starfield{ width:100%; height:100%; display:block; }
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
const ctx = canvas.getContext('2d');
function resizeCanvas(){ canvas.width = innerWidth; canvas.height = innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
let stars = [];
function createStars(){ stars=[]; for(let i=0;i<200;i++){ stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.5,s:Math.random()*0.5+0.1,c:'hsl('+Math.random()*360+',70%,80%)'});} }
function animate(){ ctx.fillStyle='rgba(11,10,30,0.3)'; ctx.fillRect(0,0,canvas.width,canvas.height); for(const s of stars){ s.y-=s.s; if(s.y<0) s.y=canvas.height; ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2); ctx.fillStyle=s.c; ctx.fill(); } requestAnimationFrame(animate); }
createStars(); animate();
</script>
</body>
</html>`;
}

/* ---------------- OAuth ---------------- */

app.get("/login", (req, res) => {
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
    if (!tokenData.access_token) return res.status(500).send("Token error");

    // fetch user
    const userResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResp.json();

    // mint our own JWT for Utilix API
    const myJwt = jwtLib.sign({ sub: userData.id }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    req.session.jwt = myJwt;
    req.session.discordAccessToken = tokenData.access_token;
    req.session.user = userData;

    // guilds
    const guildResp = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    let guilds = await guildResp.json();
    if (!Array.isArray(guilds)) guilds = [];

    // filter
    let botGuilds = [];
    try {
      const raw = fs.readFileSync(path.join(__dirname, "bot_guilds.json"), "utf8");
      botGuilds = JSON.parse(raw);
    } catch {}
    req.session.guilds =
      botGuilds.length > 0 ? guilds.filter((g) => botGuilds.includes(g.id)) : guilds;

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Error");
  }
});

/* ---------------- Dashboard ---------------- */

app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const guilds = req.session.guilds || [];

  const serversHtml = guilds
    .map((g) => {
      const name = truncateName(g.name || "");
      const icon = guildIconUrl(g);
      return `<div class="server"><a href="/dashboard/${g.id}">${
        icon
          ? `<img src="${escapeHtml(icon)}"/>`
          : `<div class="server-icon">${escapeHtml(name.charAt(0))}</div>`
      }<div class="server-name">${escapeHtml(name)}</div></a></div>`;
    })
    .join("");

  res.send(renderLayout(user, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
});

/* ---------------- Individual Server ---------------- */

app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const jwt = req.session.jwt;
  const guildId = req.params.id;
  const guild = (req.session.guilds || []).find((g) => g.id === guildId);

  if (!guild) {
    return res.send(renderLayout(user, `<div class="card"><h2>No access</h2></div>`));
  }

  try {
    const MANAGE_GUILD = 0x20;
    const hasManage = (parseInt(guild.permissions || "0", 10) & MANAGE_GUILD) === MANAGE_GUILD;

    let botCheck = { allowed: false };
    const botCheckRes = await fetch("https://api.utilix.support/checkPerms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ guildId }),
    });
    if (botCheckRes.ok) botCheck = await botCheckRes.json();

    if (!hasManage || !botCheck.allowed) {
      return res.send(
        renderLayout(user, `<div class="card"><h2>${guild.name}</h2><p>No permission</p></div>`)
      );
    }

    // fetch Utilix API config/shop
    const [configRes, shopRes] = await Promise.all([
      fetch(`https://api.utilix.support/dashboard/${guildId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
      fetch(`https://api.utilix.support/dashboard/${guildId}/shop`, {
        headers: { Authorization: `Bearer ${jwt}` },
      }),
    ]);
    const config = configRes.ok ? await configRes.json() : { error: true };
    const shop = shopRes.ok ? await shopRes.json() : { error: true };

    res.send(
      renderLayout(
        user,
        `<div class="card"><h2>${guild.name}</h2><pre>${escapeHtml(
          JSON.stringify(config, null, 2)
        )}</pre><pre>${escapeHtml(JSON.stringify(shop, null, 2))}</pre></div>`
      )
    );
  } catch (err) {
    console.error(err);
    res.send(renderLayout(user, `<div class="card"><h2>Error</h2></div>`));
  }
});

/* ---------------- misc ---------------- */

app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));
app.get("/", (req, res) => res.redirect("/dashboard"));
app.get("/me", (req, res) =>
  res.json(req.session.user ? { loggedIn: true, user: req.session.user } : { loggedIn: false })
);

/* ---------------- start ---------------- */

app.listen(PORT, () => console.log(`Server running http://localhost:${PORT}`));
