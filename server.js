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
const API_BASE = "https://api.utilix.support";

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

function isRoleKey(key) {
  return key.endsWith("_role_id") || /role/i.test(key);
}

function isChannelKey(key) {
  return key.endsWith("_channel_id") || /channel/i.test(key);
}

function isMessageKey(key) {
  return /message/i.test(key);
}

function isNumberKey(key) {
  return /threshold/i.test(key);
}

function isUrlKey(key) {
  return /url/i.test(key);
}

const prettyNames = {
  bot_admin_role_id: "Bot Admin",
  ticket_admin_1_role_id: "Ticket Admin",
  bot_profile_nick: "Bot Profile Name",
  bot_profile_bio: "Bot's profile bio",
  bot_profile_avatar_url: "Bot Profile avatar url",
  bot_profile_banner_url: "Bot Profile Banner url",
  warn_role_id: "Warn Role Permission",
  mute_role_id: "Mute Role Permission",
  unmute_role_id: "Unmute Role Permission",
  unwarn_role_id: "Unwarn Role Permission",
  ban_role_id: "Ban Role Permission",
  unban_role_id: "Unban Role Permission",
  kick_role_id: "Kick Role Permission",
  minigames_staff_role_id: "Minigame Staff Role Permission",
  ticket_staff_1_role_id: "Ticket Staff Role Permission",
  invite_manager_role_id: "Invite Manager Role Permission",
  welcome_message: "Welcome Message",
  goodbye_message: "Goodbye Message",
  welcome_channel: "Welcome/Goodbye Channel",
  greeting_channel: "Greeting's Channel",
  modlog_channel_id: "Modlogs",
  logs_channel_id: "Action Log",
  log_events: "Event Log",
  ban_threshold: "Ban threshold",
  ticket_log_1_channel_id: "Ticket Logging / Ticket Transcripts",
};

function getPrettyName(key) {
  return prettyNames[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const sectionGroups = {
  "Bot Administrator Permissions": ["bot_admin_role_id", "ticket_admin_1_role_id"],
  "Bot Customization": ["bot_profile_nick", "bot_profile_bio", "bot_profile_avatar_url", "bot_profile_banner_url"],
  "Moderation Roles": ["warn_role_id", "mute_role_id", "unmute_role_id", "unwarn_role_id", "ban_role_id", "unban_role_id", "kick_role_id", "minigames_staff_role_id", "ticket_staff_1_role_id", "invite_manager_role_id"],
  "Join / Leaves": ["welcome_message", "goodbye_message", "welcome_channel", "greeting_channel"],
  "Logging": ["modlog_channel_id", "logs_channel_id", "log_events", "ban_threshold", "ticket_log_1_channel_id"],
};

const multiKeys = [
  "bot_admin_role_id", "ticket_admin_1_role_id",
  "warn_role_id", "mute_role_id", "unmute_role_id", "unwarn_role_id", "ban_role_id", "unban_role_id", "kick_role_id", "minigames_staff_role_id", "ticket_staff_1_role_id", "invite_manager_role_id",
  "greeting_channel", "log_events"
];

async function fetchGuildData(guildId, jwt, extra = {}) {
  const headers = { Authorization: `Bearer ${jwt}` };
  const [configRes, shopRes, rolesRes, channelsRes] = await Promise.all([
    fetch(`${API_BASE}/dashboard/${guildId}`, { headers }),
    fetch(`${API_BASE}/dashboard/${guildId}/shop`, { headers }),
    fetch(`${API_BASE}/dashboard/${guildId}/roles`, { headers }),
    fetch(`${API_BASE}/dashboard/${guildId}/channels`, { headers }),
  ]);

  const data = {
    config: configRes.ok ? await configRes.json() : { allowed: false, config: {} },
    shop: shopRes.ok ? await shopRes.json() : { success: false, items: [] },
    roles: rolesRes.ok ? await rolesRes.json() : { success: false, roles: [] },
    channels: channelsRes.ok ? await channelsRes.json() : { success: false, channels: [] },
    ...extra,
  };
  return data;
}

function renderConfigSections(guildId, config, roles, channels) {
  let html = "";
  const allGroupedKeys = Object.values(sectionGroups).flat();
  const configKeys = Object.keys(config.config || {});

  for (const [title, keys] of Object.entries(sectionGroups)) {
    const sectionKeys = keys.filter((k) => configKeys.includes(k));
    if (sectionKeys.length === 0) continue;

    html += `<h2>${escapeHtml(title)}</h2><div class="card" style="display:grid;gap:1rem;">`;
    for (const key of sectionKeys) {
      html += renderConfigItem(guildId, key, config.config[key], roles, channels);
    }
    html += `</div>`;
  }

  // General section for ungrouped keys
  const generalKeys = configKeys.filter((k) => !allGroupedKeys.includes(k));
  if (generalKeys.length > 0) {
    html += `<h2>General</h2><div class="card" style="display:grid;gap:1rem;">`;
    for (const key of generalKeys) {
      html += renderConfigItem(guildId, key, config.config[key], roles, channels);
    }
    html += `</div>`;
  }

  return html;
}

function renderConfigItem(guildId, key, value, roles, channels) {
  const isMulti = multiKeys.includes(key);
  const values = isMulti && typeof value === "string" ? value.split(",") : [value];
  const nameAttr = isMulti && (isRoleKey(key) || isChannelKey(key)) ? "value[]" : "value";
  const pretty = getPrettyName(key);

  let inputHtml = "";
  if (isRoleKey(key)) {
    inputHtml = `<select name="${nameAttr}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);" ${isMulti ? "multiple" : ""}>`;
    inputHtml += `<option value="">None</option>`;
    (roles.roles || []).forEach((r) => {
      const selected = isMulti ? values.includes(r.id) ? "selected" : "" : r.id === value ? "selected" : "";
      inputHtml += `<option value="${escapeHtml(r.id)}" ${selected}>${escapeHtml(r.name)}</option>`;
    });
    inputHtml += `</select>`;
  } else if (isChannelKey(key)) {
    inputHtml = `<select name="${nameAttr}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);" ${isMulti ? "multiple" : ""}>`;
    inputHtml += `<option value="">None</option>`;
    (channels.channels || []).forEach((c) => {
      const selected = isMulti ? values.includes(c.id) ? "selected" : "" : c.id === value ? "selected" : "";
      inputHtml += `<option value="${escapeHtml(c.id)}" ${selected}>${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`;
    });
    inputHtml += `</select>`;
  } else if (isMessageKey(key)) {
    inputHtml = `<textarea name="value" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">${escapeHtml(value || "")}</textarea>`;
  } else if (isNumberKey(key)) {
    inputHtml = `<input type="number" name="value" value="${escapeHtml(value || "")}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  } else if (isUrlKey(key)) {
    inputHtml = `<input type="url" name="value" value="${escapeHtml(value || "")}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  } else if (isMulti) {
    inputHtml = `<input type="text" name="value" value="${escapeHtml(value || "")}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);" placeholder="Comma separated values">`;
  } else {
    inputHtml = `<input type="text" name="value" value="${escapeHtml(value || "")}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  }

  let html = `<div style="display:flex;align-items:center;gap:0.5rem;justify-content:space-between;">`;
  html += `<label style="font-weight:600;min-width:150px;">${escapeHtml(pretty)}</label>`;
  html += `<form action="/dashboard/${guildId}/config" method="POST" style="display:flex;gap:0.5rem;flex:1;">`;
  html += `<input type="hidden" name="key" value="${escapeHtml(key)}">`;
  html += inputHtml;
  html += `<button type="submit" style="padding:0.5rem 1rem;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;">Update</button>`;
  html += `</form></div>`;
  return html;
}

function renderShopSection(guildId, shop, roles) {
  let html = '<h2>Shop</h2><div class="card">';
  html += '<h3>Add Item</h3>';
  html += `<form action="/dashboard/${guildId}/shop" method="POST" style="display:grid;gap:0.5rem;margin-bottom:1rem;">`;
  html += `<label>Role:</label><select name="role_id" required style="padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  (roles.roles || []).forEach((r) => {
    html += `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`;
  });
  html += `</select>`;
  html += `<label>Name:</label><input name="name" required style="padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  html += `<label>Price:</label><input name="price" type="number" required style="padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  html += `<button type="submit" style="padding:0.5rem 1rem;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;">Add</button>`;
  html += `</form>`;

  html += '<h3>Items</h3>';
  if (shop.items && shop.items.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<thead><tr><th>Name</th><th>Role</th><th>Price</th><th>Active</th><th>Actions</th></tr></thead>';
    html += '<tbody>';
    shop.items.forEach((item) => {
      const role = (roles.roles || []).find((r) => r.id == item.role_id) || { name: 'Unknown' };
      html += `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(role.name)}</td><td>${escapeHtml(item.price)}</td><td>${item.active ? 'Yes' : 'No'}</td><td style="display:flex;gap:0.5rem;">`;
      html += `<form action="/dashboard/${guildId}/shop/${item.id}/update" method="POST" style="display:flex;gap:0.5rem;">`;
      html += `<input name="name" value="${escapeHtml(item.name)}" style="padding:0.3rem;width:100px;">`;
      html += `<input name="price" value="${escapeHtml(item.price)}" type="number" style="padding:0.3rem;width:80px;">`;
      html += `<button type="submit" style="padding:0.3rem 0.6rem;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;">Update</button>`;
      html += `</form>`;
      html += `<form action="/dashboard/${guildId}/shop/${item.id}/toggle" method="POST"><button type="submit" style="padding:0.3rem 0.6rem;background:#6c34cc;color:white;border:none;border-radius:4px;cursor:pointer;">Toggle</button></form>`;
      html += `<form action="/dashboard/${guildId}/shop/${item.id}/delete" method="POST"><button type="submit" style="padding:0.3rem 0.6rem;background:#f55;color:white;border:none;border-radius:4px;cursor:pointer;">Delete</button></form>`;
      html += `</td></tr>`;
    });
    html += '</tbody></table>';
  } else {
    html += '<p>No items yet.</p>';
  }
  html += '</div>';
  return html;
}

function renderMemberSearchSection(guildId, member = null) {
  let html = '<h2>Member Lookup</h2><div class="card">';
  html += `<form action="/dashboard/${guildId}/members" method="GET" style="display:flex;gap:0.5rem;margin-bottom:1rem;">`;
  html += `<input name="query" placeholder="ID or username" required style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  html += `<button type="submit" style="padding:0.5rem 1rem;background:var(--accent);color:white;border:none;border-radius:4px;cursor:pointer;">Search</button>`;
  html += `</form>`;
  if (member) {
    if (member.in_guild) {
      html += `<pre>${escapeHtml(JSON.stringify(member.member, null, 2))}</pre>`;
    } else {
      html += '<p>Member not found in guild.</p>';
    }
  }
  html += '</div>';
  return html;
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
h3{ margin-bottom:8px; }

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
.card{ background:var(--card); padding:16px; border-radius:12px; border:1px solid rgba(255,255,255,0.04); margin-bottom:2rem; }

/* tables */
table th, table td { padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: left; }
table th { font-weight: 600; }

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
    let botGuildData;
    try {
      const raw = fs.readFileSync(path.join(__dirname, "bot_guilds.json"), "utf8");
      botGuildData = JSON.parse(raw);
    } catch {}

    const guildIds = botGuildData?.guild_ids || [];

    req.session.guilds =
      guildIds.length > 0 ? guilds.filter((g) => guildIds.includes(g.id)) : guilds;

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
    const botCheckRes = await fetch(`${API_BASE}/checkPerms`, {
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
        renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name)}</h2><p>No permission</p></div>`)
      );
    }

    const data = await fetchGuildData(guildId, jwt);

    let contentHtml = `<h1>${escapeHtml(guild.name)}</h1>`;
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels);
    contentHtml += renderShopSection(guildId, data.shop, data.roles);
    contentHtml += renderMemberSearchSection(guildId);

    res.send(renderLayout(user, contentHtml));
  } catch (err) {
    console.error(err);
    res.send(renderLayout(user, `<div class="card"><h2>Error</h2></div>`));
  }
});

app.get("/dashboard/:id/members", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const query = req.query.query;
  if (!query) return res.redirect(`/dashboard/${guildId}`);

  try {
    // Assume permission checks passed since we redirect from protected page
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const memberRes = await fetch(`${API_BASE}/dashboard/${guildId}/members?query=${encodeURIComponent(query)}`, { headers });
    const member = memberRes.ok ? await memberRes.json() : { success: false };

    const data = await fetchGuildData(guildId, req.session.jwt, { member: member.success ? member : null });

    const guild = (req.session.guilds || []).find((g) => g.id === guildId);
    let contentHtml = `<h1>${escapeHtml(guild.name)}</h1>`;
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels);
    contentHtml += renderShopSection(guildId, data.shop, data.roles);
    contentHtml += renderMemberSearchSection(guildId, data.member);

    res.send(renderLayout(req.session.user, contentHtml));
  } catch (err) {
    console.error(err);
    res.redirect(`/dashboard/${guildId}`);
  }
});

/* ---------------- Config Updates ---------------- */

app.post("/dashboard/:id/config", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  let { key, value } = req.body;

  if (Array.isArray(value)) {
    value = value.join(",");
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.session.jwt}`,
    };
    const updateRes = await fetch(`${API_BASE}/dashboard/${guildId}/config`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ key, value }),
    });

    if (updateRes.ok) {
      res.redirect(`/dashboard/${guildId}`);
    } else {
      res.status(400).send("Error updating config");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

/* ---------------- Shop Actions ---------------- */

app.post("/dashboard/:id/shop", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const { role_id, name, price } = req.body;

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.session.jwt}`,
    };
    const addRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role_id, name, price }),
    });

    if (addRes.ok) {
      res.redirect(`/dashboard/${guildId}`);
    } else {
      res.status(400).send("Error adding item");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

app.post("/dashboard/:id/shop/:item_id/update", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const itemId = req.params.item_id;
  const { name, price } = req.body;

  try {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${req.session.jwt}`,
    };
    const updateRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop/${itemId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name, price }),
    });

    if (updateRes.ok) {
      res.redirect(`/dashboard/${guildId}`);
    } else {
      res.status(400).send("Error updating item");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

app.post("/dashboard/:id/shop/:item_id/toggle", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const itemId = req.params.item_id;

  try {
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const toggleRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop/${itemId}/toggle`, {
      method: "POST",
      headers,
    });

    if (toggleRes.ok) {
      res.redirect(`/dashboard/${guildId}`);
    } else {
      res.status(400).send("Error toggling item");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
  }
});

app.post("/dashboard/:id/shop/:item_id/delete", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const itemId = req.params.item_id;

  try {
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const deleteRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop/${itemId}`, {
      method: "DELETE",
      headers,
    });

    if (deleteRes.ok) {
      res.redirect(`/dashboard/${guildId}`);
    } else {
      res.status(400).send("Error deleting item");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal error");
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
