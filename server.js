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

    const guildResponse = await fetch(
      "https://discord.com/api/users/@me/guilds",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    let guilds = await guildResponse.json();
    if (!Array.isArray(guilds)) guilds = [];

    let botGuilds = [];
    try {
      const filePath = path.join(__dirname, "bot_guilds.json");
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) botGuilds = parsed.map(String);
    } catch {
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
   Template Renderer
   ------------------------- */
function renderLayout(user, contentHtml) {
  const avatarUrl = discordAvatarUrl(user);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Utilix</title>
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
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", sans-serif;
      background: radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);
      color: var(--fg);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      position: relative;
    }
    header {
      position: fixed; top: 0; left: 0; width: 100%;
      display:flex; justify-content:space-between; align-items:center;
      background: rgba(15,5,35,0.6); backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255,255,255,0.05);
      height:72px; padding:1rem 2rem; z-index:1000;
    }
    .logo { font-weight:800; font-size:1.25rem;
      background: linear-gradient(90deg,var(--accent),var(--accent2));
      -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
    nav.header-nav ul {
      display:flex; gap:1.25rem; list-style:none;
      background: rgba(25,5,50,0.3);
      padding:0.4rem 0.9rem; border-radius:999px;
      border:1px solid rgba(255,255,255,0.08);
    }
    nav.header-nav a {
      position:relative; color:var(--fg); text-decoration:none;
      font-weight:600; font-size:0.95rem; padding:0.55rem 1.1rem;
    }
    nav.header-nav a::after {
      content:""; position:absolute; left:50%; bottom:6px;
      transform:translateX(-50%) scaleX(0); transform-origin:center;
      width:60%; height:2px;
      background:linear-gradient(90deg,var(--accent),var(--accent2));
      transition:transform 0.3s ease;
    }
    nav.header-nav a:hover::after { transform:translateX(-50%) scaleX(1); }
    .discord-btn {
      background: linear-gradient(90deg,var(--accent),var(--accent2));
      color:white; font-weight:600; padding:0.5rem 0.9rem;
      border-radius:999px; text-decoration:none;
    }
    .auth-wrapper { display:flex; align-items:center; gap:12px; }
    .auth-wrapper img { border-radius:50%; width:36px; height:36px; }
    main { flex:1; padding:110px 20px 40px; max-width:1200px; margin:0 auto; }
    .servers {
      display:grid;
      grid-template-columns: repeat(auto-fill,minmax(180px,1fr));
      gap:1.25rem;
      justify-items:start; /* LEFT ALIGN */
    }
    .server {
      background:var(--card);
      border-radius:14px; padding:1rem; text-align:center;
    }
    .server img,.server-icon { width:80px; height:80px; border-radius:16px; margin-bottom:0.6rem; }
    .server-icon {
      background:rgba(255,255,255,0.08);
      display:flex; align-items:center; justify-content:center;
      font-weight:700; font-size:1.4rem;
    }
    .server-name {
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      max-width:180px; margin:0 auto; color:var(--muted);
    }
    canvas#starfield {
      position:fixed; top:0; left:0; width:100%; height:100%;
      z-index:0; pointer-events:none;
    }
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
      <a href="/dashboard" class="discord-btn">Manage Servers</a>
      <a href="https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands" class="discord-btn">Add to Server</a>
      <div class="auth-wrapper">
        <img src="${escapeHtml(avatarUrl)}"/>
        <span>${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}</span>
        <a href="/logout" style="color:#f55;text-decoration:none;font-weight:700">⎋</a>
      </div>
    </div>
  </header>
  <canvas id="starfield"></canvas>
  <main>
    ${contentHtml}
  </main>
  <script>
    const canvas=document.getElementById('starfield');
    const ctx=canvas.getContext('2d');let stars=[];
    function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
    window.addEventListener('resize',resize);resize();
    function createStars(){stars=[];for(let i=0;i<200;i++){stars.push({x:Math.random()*canvas.width,y:Math.random()*canvas.height,r:Math.random()*1.5,s:Math.random()*0.5+0.1,c:'hsl('+(Math.random()*360)+',70%,80%)'});}}
    function animate(){ctx.fillStyle='rgba(11,10,30,0.3)';ctx.fillRect(0,0,canvas.width,canvas.height);for(let s of stars){s.y-=s.s;if(s.y<0)s.y=canvas.height;ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fillStyle=s.c;ctx.fill();}requestAnimationFrame(animate);}
    createStars();animate();
  </script>
</body>
</html>`;
}

/* -------------------------
   Routes
   ------------------------- */
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guilds = req.session.guilds || [];
  const serversHtml = guilds
    .map((g) => {
      const displayName = g.name.length > 20 ? g.name.substring(0,20)+"…" : g.name;
      const icon = guildIconUrl(g);
      const iconHtml = icon
        ? `<img src="${icon}" alt="${escapeHtml(displayName)}"/>`
        : `<div class="server-icon">${escapeHtml(firstChar(displayName))}</div>`;
      return `<div class="server"><a href="/dashboard/${g.id}">${iconHtml}<div class="server-name">${escapeHtml(displayName)}</div></a></div>`;
    })
    .join("");
  res.send(renderLayout(req.session.user, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
});

app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const guild = (req.session.guilds||[]).find((g)=>g.id===guildId);
  if (!guild) return res.send(renderLayout(req.session.user, `<h2>No access to this server.</h2>`));

  try {
    const MANAGE_GUILD = 0x20;
    const hasManageGuild = (parseInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;
    const response = await fetch("https://api.utilix.support/checkPerms", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({userId:req.session.user.id,guildId:guild.id})
    });
    const botCheck = await response.json();

    if (!hasManageGuild || !botCheck.allowed) {
      return res.send(renderLayout(req.session.user, `<h2>${escapeHtml(guild.name)}</h2><p>You don’t have permission to manage this server’s bot dashboard.</p>`));
    }
    res.send(renderLayout(req.session.user, `<h2>${escapeHtml(guild.name)} Dashboard</h2><p>Placeholder dashboard content here.</p>`));
  } catch (err) {
    console.error(err);
    res.status(500).send("Error checking permissions");
  }
});

app.get("/logout", (req,res)=>req.session.destroy(()=>res.redirect("/")));
app.get("/", (req,res)=>req.session.user ? res.redirect("/dashboard") : res.send(`<a href="/login">Log in with Discord</a>`));
app.get("/me",(req,res)=>res.json({loggedIn:!!req.session.user,user:req.session.user||null}));

app.listen(PORT, ()=>console.log(`Server running at http://localhost:${PORT}`));
