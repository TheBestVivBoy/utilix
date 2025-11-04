require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const jwtLib = require("jsonwebtoken");
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
  return /_role_id$/i.test(key) || key === "auto_roles_on_join";
}
function isChannelKey(key) {
  return /_channel_id$/i.test(key);
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
  prefix: "Command Prefix",
  bot_admin_role_id: "Bot Admin",
  ticket_admin_1_role_id: "Ticket Admin",
  bot_profile_nick: "Bot Profile Name",
  bot_profile_bio: "Bot's Profile Bio",
  bot_profile_avatar_url: "Bot Profile Avatar URL",
  bot_profile_banner_url: "Bot Profile Banner URL",
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
  welcome_channel_id: "Welcome/Goodbye Channel",
  greeting_channel_id: "Greeting's Channel",
  auto_roles_on_join: "Auto Roles on Join",
  modlog_channel_id: "Modlogs",
  logs_channel_id: "Action Log",
  log_events: "Event Log",
  ban_threshold: "Ban Threshold",
  ticket_log_1_channel_id: "Ticket Logging / Transcripts",
};
function getPrettyName(key) {
  return prettyNames[key] || key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

/* ----- groups ----- */
const sectionGroups = {
  "Bot Administrator Permissions": ["prefix", "bot_admin_role_id", "ticket_admin_1_role_id"],
  "Bot Customization": ["bot_profile_nick", "bot_profile_bio", "bot_profile_avatar_url", "bot_profile_banner_url"],
  "Moderation Roles": [
    "warn_role_id", "mute_role_id", "unmute_role_id", "unwarn_role_id",
    "ban_role_id", "unban_role_id", "kick_role_id",
    "minigames_staff_role_id", "ticket_staff_1_role_id", "invite_manager_role_id"
  ],
  "Join / Leaves": ["welcome_message", "goodbye_message", "welcome_channel_id", "greeting_channel_id", "auto_roles_on_join"],
  "Logging": ["modlog_channel_id", "logs_channel_id", "log_events", "ban_threshold", "ticket_log_1_channel_id"],
};
const multiKeys = [
  "bot_admin_role_id", "ticket_admin_1_role_id",
  "warn_role_id", "mute_role_id", "unmute_role_id", "unwarn_role_id",
  "ban_role_id", "unban_role_id", "kick_role_id",
  "minigames_staff_role_id", "ticket_staff_1_role_id", "invite_manager_role_id",
  "greeting_channel_id", "auto_roles_on_join", "log_events",
];

/* ----- command ↔ config key mapping ----- */
const configKeyToCommand = {
  prefix: "prefix",
  bot_admin_role_id: "admin",
  ticket_admin_1_role_id: "ticketadmin",
  warn_role_id: "warn",
  mute_role_id: "mute",
  unmute_role_id: "unmute",
  unwarn_role_id: "unwarn",
  ban_role_id: "ban",
  unban_role_id: "unban",
  kick_role_id: "kick",
  minigames_staff_role_id: "minigames",
  ticket_staff_1_role_id: "ticketstaff",
  invite_manager_role_id: "invitemanager",
  welcome_message: "welcome",
  goodbye_message: "goodbye",
  welcome_channel_id: "welcome",
  greeting_channel_id: "greet",
  auto_roles_on_join: "autorole",
  modlog_channel_id: "modlog",
  logs_channel_id: "log",
  log_events: "logevents",
  ban_threshold: "banthreshold",
  ticket_log_1_channel_id: "ticketlog",
};

/* ---------------- fetch guild data ---------------- */
async function fetchGuildData(guildId, jwt, extra = {}) {
  const headers = { Authorization: `Bearer ${jwt}` };
  try {
    const [
      configRes, shopRes, rolesRes, channelsRes, logEventsRes, disabledRes
    ] = await Promise.all([
      fetch(`${API_BASE}/dashboard/${guildId}`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/shop`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/roles`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/channels`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/log_events`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/disabled`, { headers }).catch(() => ({ ok: false })),
    ]);

    const data = {
      config: configRes.ok ? await configRes.json() : { allowed: false, config: {} },
      shop: shopRes.ok ? await shopRes.json() : { success: false, items: [] },
      roles: rolesRes.ok ? await rolesRes.json() : { success: false, roles: [] },
      channels: channelsRes.ok ? await channelsRes.json() : { success: false, channels: [] },
      logEvents: logEventsRes.ok ? await logEventsRes.json() : { success: false, events: [] },
      disabled: disabledRes.ok ? await disabledRes.json() : { disabled: [], available: [] },
      ...extra,
    };
    return data;
  } catch (err) {
    console.error("Error fetching guild data:", err);
    return { error: true };
  }
}

/* ---------------- render sections ---------------- */
function renderConfigSections(guildId, config, roles, channels, logEvents, sectionType = "settings", disabledSet = new Set()) {
  let html = `<div class="section" id="${sectionType}-section">`;
  const allGroupedKeys = Object.values(sectionGroups).flat();
  const configKeys = Object.keys(config.config || {});
  const targetGroups = sectionType === "moderation"
    ? ["Moderation Roles"]
    : ["Bot Administrator Permissions", "Bot Customization", "Join / Leaves", "Logging", "Other Settings"];

  for (const title of targetGroups) {
    let sectionKeys = title === "Other Settings"
      ? configKeys.filter(k => !allGroupedKeys.includes(k))
      : sectionGroups[title]?.filter(k => configKeys.includes(k)) || [];
    if (sectionKeys.length === 0) continue;

    html += `<h2 class="section-title">${escapeHtml(title)}</h2>`;
    html += `<div class="card-grid">`;
    for (const key of sectionKeys) {
      html += renderPermissionCard(guildId, key, config.config[key], roles, channels, logEvents, disabledSet);
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

/* ----- single permission card ----- */
function renderPermissionCard(guildId, key, value, roles, channels, logEvents, disabledSet) {
  const isMulti = multiKeys.includes(key);
  const values = isMulti && typeof value === "string" ? value.split(",").filter(v => v) : [value];
  const pretty = getPrettyName(key);
  const cmd = configKeyToCommand[key];
  const toggleChecked = cmd ? !disabledSet.has(cmd) : false;
  const roleJson = JSON.stringify((roles.roles || []).map(r => ({ id: r.id, name: r.name || "" })));

  // ---------- INPUT ----------
  let inputHtml = "";
  if (isRoleKey(key) && isMulti) {
    inputHtml = `
      <div class="tag-wrapper" data-roles='${roleJson}'>
        <div class="tags" data-key="${escapeHtml(key)}">
          ${values.filter(v => v).map(v => {
            const r = (roles.roles || []).find(x => x.id === v);
            return r ? `<span class="tag" data-id="${escapeHtml(v)}">${escapeHtml(r.name)} <button type="button" class="remove-tag">x</button></span>` : "";
          }).join("")}
          <input type="text" class="tag-input" placeholder="Search role…">
        </div>
        <div class="dropdown"><div class="dropdown-options"></div></div>
        <input type="hidden" name="value" value="${escapeHtml(values.join(","))}">
      </div>`;
  } else if (isRoleKey(key)) {
    inputHtml = `<select name="value" class="select-role">
      <option value="">None</option>
      ${(roles.roles || []).map(r => `<option value="${escapeHtml(r.id)}"${r.id === value ? " selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}</select>`;
  } else if (isChannelKey(key)) {
    inputHtml = `<select name="value" ${key === "greeting_channel_id" ? 'multiple size="3"' : ''} class="select-channel">
      <option value="">None</option>
      ${(channels.channels || []).filter(c => c.type !== "category").map(c => {
        const sel = key === "greeting_channel_id" ? values.includes(c.id) ? " selected" : "" : c.id === value ? " selected" : "";
        return `<option value="${escapeHtml(c.id)}"${sel}>${escapeHtml(c.name)} (${escapeHtml(c.type)})</option>`;
      }).join("")}</select>`;
  } else if (key === "log_events") {
    inputHtml = `<select name="value[]" multiple size="5" class="select-log">
      ${(logEvents.events || []).map(e => `<option value="${escapeHtml(e.id)}"${values.includes(e.id) ? " selected" : ""}>${escapeHtml(e.name)}</option>`).join("")}</select>`;
  } else if (isMessageKey(key)) {
    inputHtml = `<textarea name="value" class="input-text">${escapeHtml(value || "")}</textarea>`;
  } else if (isNumberKey(key)) {
    inputHtml = `<input type="number" name="value" value="${escapeHtml(value || "")}" class="input-number">`;
  } else if (isUrlKey(key)) {
    inputHtml = `<input type="url" name="value" value="${escapeHtml(value || "")}" class="input-url">`;
  } else {
    inputHtml = `<input type="text" name="value" value="${escapeHtml(value || "")}" class="input-text">`;
  }

  // ---------- CARD ----------
  const card = `
    <div class="perm-card" data-key="${escapeHtml(key)}">
      <div class="perm-header">
        <label class="perm-label">${escapeHtml(pretty)}</label>
        ${cmd ? `
        <label class="switch">
          <input type="checkbox" class="cmd-toggle" data-cmd="${escapeHtml(cmd)}" ${toggleChecked ? "checked" : ""}>
          <span class="slider"></span>
        </label>` : ''}
      </div>
      <form class="perm-form">
        <input type="hidden" name="key" value="${escapeHtml(key)}">
        ${inputHtml}
        <button type="submit" class="save-btn">Save</button>
      </form>
    </div>`;
  return card;
}

/* ----- command toggles section ----- */
function renderCommandToggles(guildId, disabledData) {
  const { disabled = [], available = [] } = disabledData;
  const disabledSet = new Set(disabled);
  let html = `<div class="section" id="commands-section" style="display:none;">
    <h2 class="section-title">Command Toggles</h2>
    <div class="card-grid">`;
  available.forEach(cmd => {
    const on = !disabledSet.has(cmd);
    html += `
      <label class="cmd-item">
        <input type="checkbox" class="cmd-toggle" data-cmd="${escapeHtml(cmd)}" ${on ? "checked" : ""}>
        ${escapeHtml(cmd)}
      </label>`;
  });
  html += `</div></div>`;
  return html;
}

/* ----- shop, member lookup, etc. (unchanged) ----- */
function renderShopSection(guildId, shop, roles) {
  let html = `<div class="section" id="shop-section" style="display:none;">
    <h2 class="section-title">Shop</h2><div class="card">`;
  html += `<form action="/dashboard/${guildId}/shop" method="POST" class="shop-add">
      <select name="role_id" required><option value="">Select Role</option>
      ${(roles.roles || []).map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("")}</select>
      <input name="name" placeholder="Item name" required>
      <input name="price" type="number" placeholder="Price" required>
      <button type="submit">Add Item</button>
    </form>`;
  if (shop.items && shop.items.length) {
    html += `<table class="shop-table"><thead><tr><th>Name</th><th>Role</th><th>Price</th><th>Active</th><th>Actions</th></tr></thead><tbody>`;
    shop.items.forEach(item => {
      const role = (roles.roles || []).find(r => r.id == item.role_id) || { name: "???" };
      html += `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(role.name)}</td>
        <td>${escapeHtml(item.price)}</td>
        <td>${item.active ? "Yes" : "No"}</td>
        <td class="shop-actions">
          <form action="/dashboard/${guildId}/shop/${item.id}/update" method="POST" class="inline">
            <input name="name" value="${escapeHtml(item.name)}">
            <input name="price" type="number" value="${escapeHtml(item.price)}">
            <button type="submit">Update</button>
          </form>
          <form action="/dashboard/${guildId}/shop/${item.id}/toggle" method="POST" class="inline"><button type="submit">Toggle</button></form>
          <form action="/dashboard/${guildId}/shop/${item.id}/delete" method="POST" class="inline"><button type="submit" style="background:#f55;">Delete</button></form>
        </td>
      </tr>`;
    });
    html += `</tbody></table>`;
  } else html += `<p>No items yet.</p>`;
  html += `</div></div>`;
  return html;
}
function renderMemberSearchSection(guildId, member = null) {
  let html = `<div class="section" id="members-section" style="display:none;">
    <h2 class="section-title">Member Lookup</h2><div class="card">
      <form action="/dashboard/${guildId}/members" method="GET">
        <input name="query" placeholder="ID or username…" required>
        <button type="submit">Search</button>
      </form>`;
  if (member) {
    html += member.in_guild
      ? `<pre class="member-pre">${escapeHtml(JSON.stringify(member.member, null, 2))}</pre>`
      : `<p>Member not in guild.</p>`;
  }
  html += `</div></div>`;
  return html;
}

/* ---------------- layout ---------------- */
function renderLayout(user, contentHtml, isServerDashboard = false) {
  const av = escapeHtml(avatarUrl(user || {}));
  const userDisplay = user ? `${escapeHtml(user.username)}#${escapeHtml(user.discriminator)}` : "";
  const addBotUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(CLIENT_ID)}&permissions=8&scope=bot%20applications.commands`;

  const searchBar = `
    <div id="fixed-search" class="fixed-search">
      <input type="text" id="search-input" placeholder="${isServerDashboard ? "Search config…" : "Search servers…"}">
    </div>`;

  const sidebar = isServerDashboard ? `
    <nav class="nav-sidebar" id="nav-sidebar"></nav>` : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Utilix Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
:root{--bg:#0b0a1e;--fg:#f2f2f7;--accent:#b266b2;--accent2:#7a44d4;--card:rgba(20,10,40,.85);--panel:rgba(15,5,35,.95);}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',system-ui;background:radial-gradient(circle at 20% 30%,#3b0a5f,var(--bg));color:var(--fg);min-height:100vh;display:flex;flex-direction:column;overflow-x:hidden;}
header{position:fixed;top:0;left:0;width:100%;height:72px;z-index:1100;display:flex;justify-content:space-between;align-items:center;padding:1rem 2rem;backdrop-filter:blur(10px);background:rgba(15,5,35,.6);border-bottom:1px solid rgba(255,255,255,.05);}
.logo{font-weight:800;font-size:1.25rem;background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
nav.header-nav ul{display:flex;gap:1.25rem;list-style:none;align-items:center;background:rgba(25,5,50,.3);padding:.4rem .9rem;border-radius:999px;border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(12px);}
nav.header-nav a{color:var(--fg);text-decoration:none;font-weight:600;padding:.55rem 1.1rem;border-radius:999px;position:relative;}
nav.header-nav a:hover{color:var(--accent);}
nav.header-nav a.active{background:linear-gradient(90deg,rgba(178,102,178,.16),rgba(122,68,212,.12));color:white;}
.discord-btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;padding:.6rem 1.2rem;border-radius:999px;text-decoration:none;font-weight:600;}
.page{flex:1;max-width:1200px;margin:0 auto;padding:${isServerDashboard ? "140px 20px 56px 260px" : "140px 20px 56px"};display:flex;gap:2rem;}
.content-area{flex:1;transition:opacity .3s,transform .3s;}
.content-area.hidden{opacity:0;transform:translateY(20px);}
.section-title{font-size:1.5rem;margin:1.5rem 0 .5rem;border-bottom:1px solid rgba(255,255,255,.1);padding-bottom:.5rem;}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem;}
.perm-card{background:var(--card);border-radius:12px;padding:1rem;border:1px solid rgba(255,255,255,.04);}
.perm-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;}
.perm-label{font-weight:600;}
.perm-form{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;}
.perm-form input,.perm-form select,.perm-form textarea{flex:1;padding:.5rem;border-radius:4px;border:1px solid rgba(255,255,255,.1);background:var(--panel);color:var(--fg);}
.save-btn{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;border:none;border-radius:8px;padding:.5rem 1rem;cursor:pointer;font-weight:600;}
.switch{position:relative;display:inline-block;width:44px;height:24px;}
.switch input{opacity:0;width:0;height:0;}
.slider{position:absolute;cursor:pointer;inset:0;background:#444;border-radius:34px;transition:.3s;}
.slider:before{position:absolute;content:"";height:18px;width:18px;left:3px;bottom:3px;background:var(--fg);border-radius:50%;transition:.3s;}
input:checked + .slider{background:linear-gradient(90deg,var(--accent),var(--accent2));}
input:checked + .slider:before{transform:translateX(20px);}
.tag-wrapper{position:relative;}
.tags{display:flex;gap:.4rem;flex-wrap:wrap;padding:.4rem;border:1px solid rgba(255,255,255,.1);border-radius:4px;background:var(--panel);min-height:38px;align-items:center;}
.tag{background:rgba(255,255,255,.1);padding:.2rem .5rem;border-radius:4px;display:flex;align-items:center;gap:.3rem;}
.tag button{background:none;border:none;color:#f55;cursor:pointer;}
.dropdown{position:absolute;top:100%;left:0;right:0;background:var(--panel);border:1px solid rgba(255,255,255,.1);border-radius:4px;max-height:150px;overflow-y:auto;display:none;z-index:10;}
.dropdown-options div{padding:.4rem .6rem;cursor:pointer;}
.dropdown-options div:hover{background:rgba(255,255,255,.1);}
.fixed-search{position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:1000;width:320px;}
.fixed-search input{width:100%;padding:.6rem;border-radius:8px;border:1px solid rgba(255,255,255,.1);background:var(--panel);color:var(--fg);}
.nav-sidebar{position:fixed;top:80px;left:20px;width:220px;background:var(--card);border-radius:12px;padding:1rem;border:1px solid rgba(255,255,255,.04);z-index:1000;display:flex;flex-direction:column;gap:.4rem;}
.nav-sidebar button{padding:.8rem;background:linear-gradient(90deg,rgba(178,102,178,.2),rgba(122,68,212,.2));color:var(--fg);border:none;border-radius:8px;cursor:pointer;font-weight:600;text-align:left;transition:.2s;}
.nav-sidebar button:hover{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;}
.nav-sidebar button.active{background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;}
.popup{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--panel);color:var(--fg);padding:.8rem 1.5rem;border-radius:8px;border:1px solid transparent;border-image:linear-gradient(90deg,var(--accent),var(--accent2)) 1;box-shadow:0 4px 12px rgba(0,0,0,.5);z-index:2000;opacity:0;transition:opacity .3s;}
.popup.show{opacity:1;}
@media(max-width:768px){.page{flex-direction:column;padding:${isServerDashboard ? "140px 20px 56px" : "140px 20px 56px"};}
.nav-sidebar{position:relative;width:100%;flex-direction:row;flex-wrap:wrap;justify-content:center;padding:.5rem;margin-bottom:1rem;}
.fixed-search{width:100%;max-width:300px;left:50%;transform:translateX(-50%);}}
</style></head><body>
<div id="loading" style="position:fixed;inset:0;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:3000;">
  <div style="width:40px;height:40px;border:4px solid var(--fg);border-top:4px solid var(--accent);border-radius:50%;animation:spin 1s linear infinite;"></div>
  <p style="margin-top:1rem;font-weight:600;">Loading…</p>
</div>
<header>
  <div style="display:flex;align-items:center;gap:16px;">
    <div class="logo">Utilix</div>
    <nav class="header-nav"><ul>
      <li><a href="/index" class="active">Home</a></li>
      <li><a href="/setup">Setup</a></li>
      <li><a href="/faq">FAQ</a></li>
      <li><a href="/changelog">Changelog</a></li>
    </ul></nav>
  </div>
  <div style="display:flex;align-items:center;gap:12px;">
    <a class="discord-btn" href="/dashboard">Manage Servers</a>
    <a class="discord-btn" href="${escapeHtml(addBotUrl)}" target="_blank" rel="noopener">Add Bot</a>
    <div style="display:flex;align-items:center;gap:8px;">
      <img src="${av}" width="36" height="36" style="border-radius:50%;">
      <div style="font-weight:600;">${userDisplay}</div>
      <a href="/logout" style="color:#f55;font-size:1.1rem;">Exit</a>
    </div>
  </div>
</header>
<main class="page" data-guild-id="${contentHtml.match(/\/dashboard\/(\d+)/)?.[1] || ''}">
  ${sidebar}
  <div class="content-area" id="content-area">${searchBar}${contentHtml}<div id="popup" class="popup">Saved</div></div>
</main>
<script>
/* ---- helpers ---- */
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
document.getElementById('loading').style.display='none';
/* ---- fixed search ---- */
const searchInput=document.getElementById('search-input');
if(searchInput){
  const isServerDash=!!document.querySelector('.perm-card');
  searchInput.addEventListener('input',()=>{
    const q=searchInput.value.toLowerCase();
    if(isServerDash){
      document.querySelectorAll('.perm-card').forEach(c=>{
        const label=c.querySelector('.perm-label').textContent.toLowerCase();
        c.style.display=label.includes(q)?'':'none';
      });
      document.querySelectorAll('.card-grid').forEach(g=>{
        const visible=g.querySelectorAll('.perm-card[style*="display:"]');
        g.style.display=visible.length?'grid':'none';
      });
    }else{
      document.querySelectorAll('.server').forEach(s=>{
        const name=s.querySelector('.server-name').textContent.toLowerCase();
        s.style.display=name.includes(q)?'':'none';
      });
    }
  });
}
/* ---- tag input (multi-role) ---- */
document.querySelectorAll('.tag-wrapper').forEach(w=>{
  const tags=w.querySelector('.tags'), input=w.querySelector('.tag-input'), dropdown=w.querySelector('.dropdown'), options=dropdown.querySelector('.dropdown-options'), hidden=w.querySelector('input[name="value"]');
  let roles=[];
  try{roles=JSON.parse(w.dataset.roles||'[]');}catch(e){}
  const updateHidden=()=>{hidden.value=Array.from(tags.querySelectorAll('.tag')).map(t=>t.dataset.id).join(',');};
  input.addEventListener('input',()=>{
    const q=input.value.toLowerCase();
    if(!q){dropdown.style.display='none';return;}
    const filtered=roles.filter(r=>r.name.toLowerCase().includes(q));
    options.innerHTML = filtered.map(r => \`<div data-id="\${esc(r.id)}">\${esc(r.name)}</div>\`).join('');
    dropdown.style.display=filtered.length?'block':'none';
  });
  options.addEventListener('click',e=>{
    const div=e.target.closest('div[data-id]');
    if(!div)return;
    const id=div.dataset.id, name=div.textContent;
    if(tags.querySelector(\`.tag[data-id="\${id}"]\))return;
    const tag=document.createElement('span');tag.className='tag';tag.dataset.id=id;
    tag.innerHTML = esc(name) + ' <button type="button" class="remove-tag">x</button>';
    tags.insertBefore(tag,input);updateHidden();input.value='';dropdown.style.display='none';
  });
  tags.addEventListener('click',e=>{if(e.target.classList.contains('remove-tag')){e.target.parentElement.remove();updateHidden();}});
  input.addEventListener('blur',()=>{setTimeout(()=>{dropdown.style.display='none';},200);});
});
/* ---- form submit (config) ---- */
document.querySelectorAll('.perm-form').forEach(f=>{
  f.addEventListener('submit',async e=>{
    e.preventDefault();
    const fd=new FormData(f);
    const key=fd.get('key');
    let value=fd.get('value');
    if(!value && fd.getAll('value[]').length) value=fd.getAll('value[]').join(',');
    const guildId=document.querySelector('main.page').dataset.guildId;
    const res=await fetch(\`/dashboard/\${guildId}/config\`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,value})});
    const popup=document.getElementById('popup');
    if(res.ok){popup.textContent='Saved';}else{popup.textContent='Error';popup.style.color='#f55';}
    popup.classList.add('show');setTimeout(()=>{popup.classList.remove('show');popup.style.color='';},2000);
  });
});
/* ---- command toggle ---- */
document.querySelectorAll('.cmd-toggle').forEach(cb=>{
  cb.addEventListener('change',async function(){
    const cmd=this.dataset.cmd, enable=this.checked, guildId=document.querySelector('main.page').dataset.guildId;
    const body={commands: enable?[]:[cmd]};
    const res=await fetch(\`/dashboard/\${guildId}/disabled\`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const popup=document.getElementById('popup');
    if(res.ok){
      popup.textContent=enable?'Enabled':'Disabled';
    }else{
      this.checked=!enable;
      popup.textContent='Failed';popup.style.color='#f55';
    }
    popup.classList.add('show');setTimeout(()=>{popup.classList.remove('show');popup.style.color='';},1500);
  });
});
/* ---- sidebar navigation ---- */
const nav=document.getElementById('nav-sidebar');
if(nav && document.querySelector('main.page').dataset.guildId){
  const sections=[
    {id:'settings-section',label:'Settings'},
    {id:'moderation-section',label:'Moderation'},
    {id:'commands-section',label:'Commands'},
    {id:'shop-section',label:'Shop'},
    {id:'members-section',label:'Member Lookup'}
  ];
  nav.innerHTML=sections.map(s=>\`<button data-section="\${s.id}" class="\${s.id==='settings-section'?'active':''}">\${s.label}</button>\`).join('');
  nav.addEventListener('click',e=>{
    const btn=e.target.closest('button');
    if(!btn)return;
    const sec=btn.dataset.section;
    document.querySelectorAll('.section').forEach(s=>s.style.display=s.id===sec?'block':'none');
    nav.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
  });
  document.getElementById('settings-section').style.display='block';
}
</script>
</body></html>`;
}

/* ---------------- OAuth ---------------- */
app.get("/login", (req, res) => {
  const url = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=identify%20guilds`;
  res.redirect(url);
});
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");
  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        scope: "identify guilds",
      }),
    });
    const token = await tokenRes.json();
    if (!token.access_token) throw new Error("No access token");

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const user = await userRes.json();

    const jwt = jwtLib.sign({ sub: user.id }, JWT_SECRET, { algorithm: "HS256", expiresIn: "1h" });
    req.session.jwt = jwt;
    req.session.discordAccessToken = token.access_token;
    req.session.user = user;

    const guildsRes = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    const guilds = await guildsRes.json();
    req.session.guilds = Array.isArray(guilds) ? guilds : [];

    // ---- bot guilds fallback ----
    let botIds = [];
    try {
      const p = path.join(__dirname, "bot_guilds.json");
      if (fs.existsSync(p)) botIds = JSON.parse(fs.readFileSync(p)).guild_ids || [];
    } catch (e) {}
    const botSet = new Set(botIds.map(String));

    // ---- permission batch ----
    const candidates = (req.session.guilds || []).filter(g => botSet.has(String(g.id)) && (parseInt(g.permissions || "0", 10) & 0x20) === 0x20);
    const perms = {};
    if (candidates.length) {
      const batch = await fetch(`${API_BASE}/checkPermsBatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ guildIds: candidates.map(g => g.id) }),
      });
      if (batch.ok) Object.assign(perms, (await batch.json()).results || {});
    }
    req.session.perms = perms;

    const allowed = candidates.filter(g => perms[g.id]?.allowed);
    const serversHtml = allowed.map(g => {
      const name = truncateName(g.name);
      const icon = guildIconUrl(g);
      return `<div class="server"><a href="/dashboard/${g.id}">
        ${icon ? `<img src="${escapeHtml(icon)}" alt="">` : `<div class="server-icon">${esc(name[0])}</div>`}
        <div class="server-name">${esc(name)}</div></a></div>`;
    }).join("");

    res.send(renderLayout(user, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
  } catch (e) {
    console.error(e);
    res.status(500).send("Auth error");
  }
});

/* ---------------- Dashboard list ---------------- */
app.get("/dashboard", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const perms = req.session.perms || {};
  const guilds = req.session.guilds || [];
  let botIds = [];
  try {
    const p = path.join(__dirname, "bot_guilds.json");
    if (fs.existsSync(p)) botIds = JSON.parse(fs.readFileSync(p)).guild_ids || [];
  } catch (e) {}
  const botSet = new Set(botIds.map(String));
  const candidates = guilds.filter(g => botSet.has(String(g.id)) && (parseInt(g.permissions || "0", 10) & 0x20) === 0x20);
  const allowed = candidates.filter(g => perms[g.id]?.allowed);
  const html = allowed.map(g => {
    const name = truncateName(g.name);
    const icon = guildIconUrl(g);
    return `<div class="server"><a href="/dashboard/${g.id}">
      ${icon ? `<img src="${escapeHtml(icon)}">` : `<div class="server-icon">${esc(name[0])}</div>`}
      <div class="server-name">${esc(name)}</div></a></div>`;
  }).join("");
  res.send(renderLayout(user, `<h2>Your Servers</h2><div class="servers">${html}</div>`));
});

/* ---------------- Server dashboard ---------------- */
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const guild = (req.session.guilds || []).find(g => g.id === guildId);
  if (!guild) return res.send(renderLayout(req.session.user, `<div class="card"><h2>No access</h2></div>`));
  const hasManage = (parseInt(guild.permissions || "0", 10) & 0x20) === 0x20;
  const allowed = (req.session.perms || {})[guildId]?.allowed;
  if (!hasManage || !allowed) return res.send(renderLayout(req.session.user, `<div class="card"><h2>${escapeHtml(guild.name)}</h2><p>No permission</p></div>`));

  const data = await fetchGuildData(guildId, req.session.jwt);
  if (data.error) return res.send(renderLayout(req.session.user, `<div class="card"><h2>Error loading data</h2></div>`));

  const disabledSet = new Set(data.disabled.disabled || []);
  let content = `<h1>${escapeHtml(guild.name)}</h1>`;
  content += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, "settings", disabledSet);
  content += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, "moderation", disabledSet);
  content += renderCommandToggles(guildId, data.disabled);
  content += renderShopSection(guildId, data.shop, data.roles);
  content += renderMemberSearchSection(guildId);
  res.send(renderLayout(req.session.user, content, true));
});

/* ---------------- Member lookup ---------------- */
app.get("/dashboard/:id/members", async (req, res) => {
  if (!req.session.jwt) return res.redirect("/login");
  const guildId = req.params.id;
  const query = req.query.query;
  if (!query) return res.redirect(`/dashboard/${guildId}`);
  const r = await fetch(`${API_BASE}/dashboard/${guildId}/members?query=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${req.session.jwt}` },
  });
  const member = r.ok ? await r.json() : { success: false };
  const data = await fetchGuildData(guildId, req.session.jwt, { member: member.success ? member : null });
  const guild = (req.session.guilds || []).find(g => g.id === guildId);
  let html = `<h1>${escapeHtml(guild.name)}</h1>`;
  html += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, "settings");
  html += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, "moderation");
  html += renderCommandToggles(guildId, data.disabled);
  html += renderShopSection(guildId, data.shop, data.roles);
  html += renderMemberSearchSection(guildId, data.member);
  res.send(renderLayout(req.session.user, html, true));
});

/* ---------------- Config update ---------------- */
app.post("/dashboard/:id/config", async (req, res) => {
  if (!req.session.jwt) return res.status(401).json({ error: "Unauthenticated" });
  const { key, value } = req.body;
  const guildId = req.params.id;
  const r = await fetch(`${API_BASE}/dashboard/${guildId}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` },
    body: JSON.stringify({ key, value }),
  });
  res.json(r.ok ? { success: true } : { error: "Failed" });
});

/* ---------------- Shop routes ---------------- */
app.post("/dashboard/:id/shop", async (req, res) => {
  if (!req.session.jwt) return res.redirect("/login");
  const { role_id, name, price } = req.body;
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/shop`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` },
    body: JSON.stringify({ role_id, name, price }),
  });
  res.redirect(r.ok ? `/dashboard/${req.params.id}` : `/dashboard/${req.params.id}`);
});
app.post("/dashboard/:id/shop/:item_id/update", async (req, res) => {
  const { name, price } = req.body;
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/shop/${req.params.item_id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` },
    body: JSON.stringify({ name, price }),
  });
  res.redirect(`/dashboard/${req.params.id}`);
});
app.post("/dashboard/:id/shop/:item_id/toggle", async (req, res) => {
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/shop/${req.params.item_id}/toggle`, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.session.jwt}` },
  });
  res.redirect(`/dashboard/${req.params.id}`);
});
app.post("/dashboard/:id/shop/:item_id/delete", async (req, res) => {
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/shop/${req.params.item_id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${req.session.jwt}` },
  });
  res.redirect(`/dashboard/${req.params.id}`);
});

/* ---------------- Disabled commands ---------------- */
app.get("/dashboard/:id/disabled", async (req, res) => {
  if (!req.session.jwt) return res.status(401).json({ error: "Unauthenticated" });
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/disabled`, {
    headers: { Authorization: `Bearer ${req.session.jwt}` },
  });
  res.json(r.ok ? await r.json() : { success: false });
});
app.put("/dashboard/:id/disabled", async (req, res) => {
  if (!req.session.jwt) return res.status(401).json({ error: "Unauthenticated" });
  const { commands } = req.body;
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/disabled`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` },
    body: JSON.stringify({ commands }),
  });
  res.json(r.ok ? await r.json() : { success: false });
});
app.post("/dashboard/:id/disabled/disable", async (req, res) => {
  if (!req.session.jwt) return res.status(401).json({ error: "Unauthenticated" });
  const { commands } = req.body;
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/disabled/disable`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` },
    body: JSON.stringify({ commands }),
  });
  res.json(r.ok ? await r.json() : { success: false });
});
app.post("/dashboard/:id/disabled/enable", async (req, res) => {
  if (!req.session.jwt) return res.status(401).json({ error: "Unauthenticated" });
  const { commands } = req.body;
  const r = await fetch(`${API_BASE}/dashboard/${req.params.id}/disabled/enable`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` },
    body: JSON.stringify({ commands }),
  });
  res.json(r.ok ? await r.json() : { success: false });
});

/* ---------------- Misc ---------------- */
app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));
app.get("/", (req, res) => res.redirect("/dashboard"));
app.get("/me", (req, res) => res.json(req.session.user ? { loggedIn: true, user: req.session.user } : { loggedIn: false }));

app.listen(PORT, () => console.log(`Dashboard listening on ${PORT}`));
