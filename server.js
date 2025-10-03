// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

// dynamic import wrapper for node-fetch
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

/* ----------------- Helpers ----------------- */
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/[&<>"']/g, (m) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return map[m];
  });
}

function avatarUrl(user) {
  if (user?.avatar) {
    const ext = user.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}`;
  }
  const idx = user?.discriminator ? parseInt(user.discriminator) % 5 : 0;
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function guildIconUrl(guild) {
  if (guild?.icon) {
    const ext = guild.icon.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}`;
  }
  return null;
}

function truncateName(name, max = 20) {
  if (!name) return "";
  return name.length > max ? name.slice(0, max) + "…" : name;
}

/* ----------------- Layout ----------------- */
function renderLayout(user, contentHtml) {
  const av = avatarUrl(user);
  const userDisplay = `${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Utilix</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet"/>
<style>
:root {
  --bg: #0b0a1e; --fg:#f2f2f7; --accent:#a64ca6; --accent2:#6c34cc;
  --muted:#c0a0ff; --card:rgba(20,10,40,0.8);
}
*{box-sizing:border-box;margin:0;padding:0}
body{
  font-family:"Inter",sans-serif;
  background:radial-gradient(circle at 20% 30%, #3b0a5f, var(--bg));
  color:var(--fg); min-height:100vh; display:flex; flex-direction:column;
}
header{
  position:fixed;top:0;left:0;width:100%;height:72px;z-index:1000;
  display:flex;justify-content:space-between;align-items:center;
  padding:1rem 2rem;background:rgba(15,5,35,0.6);backdrop-filter:blur(10px);
  border-bottom:1px solid rgba(255,255,255,0.05);
}
.logo{
  font-weight:800;font-size:1.25rem;
  background:linear-gradient(90deg,var(--accent),var(--accent2));
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;
}
nav.header-nav ul{
  display:flex;gap:1.25rem;list-style:none;align-items:center;
  background:rgba(25,5,50,0.3);padding:0.4rem 0.9rem;border-radius:999px;
  backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.08);
}
nav.header-nav a{
  position:relative;color:var(--fg);text-decoration:none;font-weight:600;font-size:0.95rem;
  padding:0.55rem 1.1rem;border-radius:999px;
}
nav.header-nav a::after{
  content:"";position:absolute;left:50%;bottom:6px;
  transform:translateX(-50%) scaleX(0);transform-origin:center;
  width:60%;height:2px;border-radius:2px;
  background:linear-gradient(90deg,var(--accent),var(--accent2));
  transition:transform 0.3s ease;
}
nav.header-nav a:hover{color:var(--accent);}
nav.header-nav a:hover::after{transform:translateX(-50%) scaleX(1);}
nav.header-nav a.active{background:linear-gradient(90deg,rgba(166,76,166,0.16),rgba(108,52,204,0.12));color:#fff}
.auth-wrapper{display:flex;align-items:center;gap:12px;}
.auth-wrapper img{border-radius:50%;}
.discord-btn{
  background:linear-gradient(90deg,var(--accent),var(--accent2));color:#fff;
  font-weight:600;padding:0.6rem 1.2rem;border-radius:999px;text-decoration:none;
}
.logout-btn{color:#f55;text-decoration:none;font-weight:600;}
.page{flex:1;max-width:1200px;margin:0 auto;padding:96px 20px 56px;}
.servers{
  display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:1rem;justify-content:start;margin-top:1rem;
}
.server{
  background:var(--card);padding:1rem;border-radius:12px;text-align:center;
  transition:transform 0.18s ease;
}
.server:hover{transform:translateY(-6px);}
.server img,.server-icon{width:80px;height:80px;border-radius:16px;margin-bottom:0.5rem;}
.server-icon{display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.06);font-weight:700;}
.server-name{font-size:0.95rem;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.card{background:var(--card);padding:16px;border-radius:12px;}
canvas#starfield{position:fixed;inset:0;z-index:0;pointer-events:none;}
</style>
</head>
<body>
<header>
  <div style="display:flex;align-items:center;gap:16px">
    <div class="logo">Utilix</div>
    <nav class="header-nav"><ul>
      <li><a href="/index" class="active">Home</a></li>
      <li><a href="/setup">Setup</a></li>
      <li><a href="/faq">FAQ</a></li>
      <li><a href="/changelog">Changelog</a></li>
    </ul></nav>
  </div>
  <div style="display:flex;align-items:center;gap:12px">
    <a class="discord-btn" href="/dashboard">Manage Servers</a>
    <a class="discord-btn" href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands" target="_blank">Add to Server</a>
    <div class="auth-wrapper">
      <img src="${av}" width="32" height="32"/>
      <span>${userDisplay}</span>
      <a href="/logout" class="logout-btn">⎋</a>
    </div>
  </div>
</header>
<canvas id="starfield"></canvas>
<main class="page">${contentHtml}</main>
<script>
const c=document.getElementById('starfield'),x=c.getContext('2d');
function rs(){c.width=innerWidth;c.height=innerHeight}window.onresize=rs;rs();
let s=[];for(let i=0;i<200;i++)s.push({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.5,v:Math.random()*0.5+0.1});
!function a(){x.fillStyle='rgba(11,10,30,0.3)';x.fillRect(0,0,c.width,c.height);
for(const t of s){t.y-=t.v;if(t.y<0)t.y=c.height;x.beginPath();x.arc(t.x,t.y,t.r,0,2*Math.PI);x.fillStyle='hsl('+Math.random()*360+',70%,80%)';x.fill()}requestAnimationFrame(a)}();
</script>
</body>
</html>`;
}

/* ----------------- Auth ----------------- */
app.get("/login", (req, res) => {
  const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(url);
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code");

  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      grant_type: "authorization_code", code,
      redirect_uri: REDIRECT_URI, scope: "identify guilds",
    });

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const token = await tokenRes.json();
    if (!token.access_token) return res.send("Token error");

    req.session.jwt = token.access_token;

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = await userRes.json();

    const guildRes = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    let guilds = await guildRes.json();
    if (!Array.isArray(guilds)) guilds = [];

    let botGuilds = [];
    try {
      botGuilds = JSON.parse(fs.readFileSync(path.join(__dirname, "bot_guilds.json"), "utf8"));
    } catch {}
    const filtered = botGuilds.length ? guilds.filter((g) => botGuilds.includes(g.id)) : guilds;

    req.session.user = user;
    req.session.guilds = filtered;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Auth failed");
  }
});

/* ----------------- Dashboard ----------------- */
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guilds = req.session.guilds || [];
  const serversHtml = guilds
    .map((g) => {
      const name = truncateName(g.name);
      const icon = guildIconUrl(g);
      const iconHtml = icon
        ? `<img src="${icon}" alt="${escapeHtml(name)}">`
        : `<div class="server-icon">${escapeHtml(name[0])}</div>`;
      return `<div class="server"><a href="/dashboard/${g.id}">${iconHtml}<div class="server-name">${escapeHtml(name)}</div></a></div>`;
    })
    .join("");
  res.send(renderLayout(req.session.user, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
});

/* ----------------- Server Dashboard ----------------- */
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
      const botRes = await fetch("https://api.utilix.support/checkPerms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, guildId }),
      });
      botCheck = await botRes.json();
    } catch {}

    if (!hasPerm || !botCheck.allowed) {
      return res.send(renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name)}</h2><p>No permission</p></div>`));
    }

    res.send(renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name)} Dashboard</h2><p>Template / To be added soon.</p></div>`));
  } catch (err) {
    console.error("Dash error:", err);
    res.status(500).send("Error");
  }
});

/* ----------------- Misc ----------------- */
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/", (req, res) => {
  if (req.session.user) return res.redirect("/dashboard");
  res.send(`<a href="/login">Log in with Discord</a>`);
});

app.get("/me", (req, res) => {
  if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
  else res.json({ loggedIn: false });
});

/* ----------------- Start ----------------- */
app.listen(PORT, () => console.log("Running on http://localhost:" + PORT));
