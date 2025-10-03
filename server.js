// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const jwtLib = require("jsonwebtoken");

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

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const JWT_SECRET = process.env.JWT_SECRET; // our own secret for Utilix API
const PORT = process.env.PORT || 3000;

/* ---------- helpers ---------- */
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
  const disc = parseInt(user.discriminator || "0", 10) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${disc}.png`;
}
function guildIconUrl(g) {
  if (!g || !g.icon) return null;
  const ext = g.icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.${ext}`;
}
function truncateName(name = "", max = 20) {
  return name.length > max ? name.slice(0, max) + "…" : name;
}

/* ---------- layout renderer ---------- */
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
body{
  font-family:"Inter",system-ui,Arial;
  background:radial-gradient(circle at 20% 30%, #3b0a5f, var(--bg));
  color:var(--fg); min-height:100vh; display:flex; flex-direction:column;
}
header{
  position:fixed; top:0; left:0; width:100%; height:72px; z-index:1100;
  display:flex; justify-content:space-between; align-items:center;
  padding:1rem 2rem; backdrop-filter:blur(10px); background:rgba(15,5,35,0.6);
  border-bottom:1px solid rgba(255,255,255,0.05);
}
.logo{ font-weight:800; font-size:1.25rem;
  background:linear-gradient(90deg,var(--accent),var(--accent2));
  -webkit-background-clip:text; -webkit-text-fill-color:transparent;
}
nav.header-nav ul{ display:flex; gap:1.25rem; list-style:none; align-items:center;
  background: rgba(25,5,50,0.3); padding:0.4rem 0.9rem; border-radius:999px;
  border:1px solid rgba(255,255,255,0.08); backdrop-filter: blur(12px);
}
nav.header-nav a{ position:relative; color:var(--fg); text-decoration:none; font-weight:600;
  font-size:0.95rem; padding:0.55rem 1.1rem; border-radius:999px;
}
nav.header-nav a::after{ content:""; position:absolute; left:50%; bottom:6px;
  transform:translateX(-50%) scaleX(0); transform-origin:center;
  width:60%; height:2px; border-radius:2px;
  background:linear-gradient(90deg,var(--accent),var(--accent2));
  transition: transform 0.3s ease;
}
nav.header-nav a:hover{ color:var(--accent); transform:translateY(-1px);}
nav.header-nav a:hover::after{ transform:translateX(-50%) scaleX(1);}
.auth-wrapper{ display:flex; align-items:center; gap:12px; }
.auth-wrapper img{ width:36px;height:36px;border-radius:50%; }
.discord-btn{
  background:linear-gradient(90deg,var(--accent),var(--accent2)); color:white;
  font-weight:600; padding:0.6rem 1.2rem; border-radius:999px; text-decoration:none;
}
.logout-btn{ font-size:1.1rem; color:#f55; text-decoration:none; }
.page{ flex:1; max-width:1200px; margin:0 auto; padding:96px 20px 56px; }
.servers{
  display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap:1rem; justify-content:start; margin-top:12px;
}
.server{ background:var(--card); border-radius:12px; padding:1rem; text-align:center; }
.server img,.server-icon{
  width:80px;height:80px;border-radius:16px;margin-bottom:0.5rem;object-fit:cover;
}
.server-icon{ display:flex; align-items:center; justify-content:center;
  background:rgba(255,255,255,0.06); font-weight:700; font-size:1.5rem; }
.server-name{ font-size:0.95rem; color:var(--muted); white-space:nowrap;
  overflow:hidden; text-overflow:ellipsis; max-width:140px; margin:0 auto; }
.card{ background:var(--card); padding:16px; border-radius:12px; }
</style>
</head>
<body>
<header>
  <div style="display:flex;align-items:center;gap:16px">
    <div class="logo">Utilix</div>
    <nav class="header-nav">
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
    <a class="discord-btn" href="${escapeHtml(addBotUrl)}" target="_blank">Add to Server</a>
    <div class="auth-wrapper">
      <img src="${av}" alt="avatar"/>
      <div style="font-weight:600">${userDisplay}</div>
      <a href="/logout" class="logout-btn">⎋</a>
    </div>
  </div>
</header>
<main class="page">${contentHtml}</main>
</body></html>`;
}

/* ---------- login & callback ---------- */
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
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) return res.send("Token error");

    // fetch user
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json();

    // mint our JWT
    const myJwt = jwtLib.sign({ sub: userData.id }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });

    req.session.jwt = myJwt; // our JWT for Utilix API
    req.session.discordAccessToken = tokenData.access_token; // keep discord token
    req.session.user = userData;

    // guilds
    const guildRes = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    let guilds = await guildRes.json();
    if (!Array.isArray(guilds)) guilds = [];
    req.session.guilds = guilds;

    res.redirect("/dashboard");
  } catch (err) {
    console.error(err);
    res.status(500).send("Callback error");
  }
});

/* ---------- dashboard ---------- */
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const guilds = req.session.guilds || [];
  const serversHtml = guilds
    .map((g) => {
      const display = truncateName(g.name);
      const icon = guildIconUrl(g);
      const iconHtml = icon
        ? `<img src="${escapeHtml(icon)}"/>`
        : `<div class="server-icon">${escapeHtml(display[0])}</div>`;
      return `<div class="server"><a href="/dashboard/${g.id}">${iconHtml}<div class="server-name">${escapeHtml(display)}</div></a></div>`;
    })
    .join("");
  res.send(renderLayout(user, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
});

/* ---------- individual server ---------- */
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const jwt = req.session.jwt;
  const guildId = req.params.id;
  const guild = (req.session.guilds || []).find((g) => g.id === guildId);
  if (!guild) return res.send(renderLayout(user, `<div class="card"><h2>No access</h2></div>`));

  try {
    // check perms via Utilix API with our minted JWT
    const checkRes = await fetch("https://api.utilix.support/checkPerms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ guildId }),
    });
    const check = await checkRes.json();
    if (!check.allowed) {
      return res.send(
        renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name)}</h2><p>No permission</p></div>`)
      );
    }
    res.send(
      renderLayout(
        user,
        `<div class="card"><h2>${escapeHtml(guild.name)} Dashboard</h2><p>Template / to be added soon</p></div>`
      )
    );
  } catch (e) {
    console.error(e);
    res.status(500).send(renderLayout(user, `<div class="card"><h2>Error</h2></div>`));
  }
});

/* ---------- misc ---------- */
app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));
app.get("/", (req, res) => (req.session.user ? res.redirect("/dashboard") : res.send(`<a href="/login">Login</a>`)));

app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
