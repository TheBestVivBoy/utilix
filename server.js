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
  return key.endsWith("_role_id") || /role/i.test(key) || key === "auto_roles_on_join";
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
  return prettyNames[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const sectionGroups = {
  "Bot Administrator Permissions": ["prefix", "bot_admin_role_id", "ticket_admin_1_role_id"],
  "Bot Customization": ["bot_profile_nick", "bot_profile_bio", "bot_profile_avatar_url", "bot_profile_banner_url"],
  "Moderation Roles": ["warn_role_id", "mute_role_id", "unmute_role_id", "unwarn_role_id", "ban_role_id", "unban_role_id", "kick_role_id", "minigames_staff_role_id", "ticket_staff_1_role_id", "invite_manager_role_id"],
  "Join / Leaves": ["welcome_message", "goodbye_message", "welcome_channel_id", "greeting_channel_id", "auto_roles_on_join"],
  "Logging": ["modlog_channel_id", "logs_channel_id", "log_events", "ban_threshold", "ticket_log_1_channel_id"],
};

const multiKeys = [
  "bot_admin_role_id", "ticket_admin_1_role_id",
  "warn_role_id", "mute_role_id", "unmute_role_id", "unwarn_role_id", "ban_role_id", "unban_role_id", "kick_role_id", "minigames_staff_role_id", "ticket_staff_1_role_id", "invite_manager_role_id",
  "greeting_channel_id", "auto_roles_on_join", "log_events",
];

// JSON reviver to fix number rounding
function jsonReviver(key, value) {
  return typeof value === 'number' ? String(value) : value;
}

async function fetchGuildData(guildId, jwt, extra = {}) {
  const headers = { Authorization: `Bearer ${jwt}` };
  try {
    const [configRes, shopRes, rolesRes, channelsRes, logEventsRes] = await Promise.all([
      fetch(`${API_BASE}/dashboard/${guildId}`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/shop`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/roles`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/channels`, { headers }).catch(() => ({ ok: false })),
      fetch(`${API_BASE}/dashboard/${guildId}/log_events`, { headers }).catch(() => ({ ok: false })),
    ]);
    const data = {
      config: configRes.ok ? JSON.parse(await configRes.text(), jsonReviver) : { allowed: false, config: {} },
      shop: shopRes.ok ? JSON.parse(await shopRes.text(), jsonReviver) : { success: false, items: [] },
      roles: rolesRes.ok ? JSON.parse(await rolesRes.text(), jsonReviver) : { success: false, roles: [] },
      channels: channelsRes.ok ? JSON.parse(await channelsRes.text(), jsonReviver) : { success: false, channels: [] },
      logEvents: logEventsRes.ok ? JSON.parse(await logEventsRes.text(), jsonReviver) : { success: false, events: [] },
      ...extra,
    };
    return data;
  } catch (err) {
    console.error("Error fetching guild data:", err);
    return { error: true };
  }
}

async function fetchDisabledCommands(guildId, jwt) {
  const headers = { Authorization: `Bearer ${jwt}` };
  try {
    const res = await fetch(`${API_BASE}/dashboard/${guildId}/disabled`, { headers }).catch(() => ({ ok: false }));
    return res.ok ? JSON.parse(await res.text(), jsonReviver) : { success: false, disabled: [], available: [] };
  } catch (err) {
    console.error("Error fetching disabled commands:", err);
    return { success: false, disabled: [], available: [] };
  }
}

function renderConfigSections(guildId, config, roles, channels, logEvents, sectionType = 'settings') {
  let html = `<div class="section" id="${sectionType}-section">`;
  const allGroupedKeys = Object.values(sectionGroups).flat();
  const configKeys = Object.keys(config.config || {});
  const targetGroups = sectionType === 'moderation'
    ? ["Moderation Roles"]
    : ["Bot Administrator Permissions", "Bot Customization", "Join / Leaves", "Logging", "General"];
  for (const title of targetGroups) {
    let sectionKeys = title === "General"
      ? configKeys.filter((k) => !allGroupedKeys.includes(k))
      : sectionGroups[title]?.filter((k) => configKeys.includes(k)) || [];
    if (sectionKeys.length === 0) continue;
    html += `<h2 style="font-size:1.5rem;margin-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.5rem;">${escapeHtml(title)}</h2><div class="card" style="grid-template-columns:1fr 1fr;gap:1.5rem;padding:1.5rem;margin-bottom:2rem;">`;
    for (const key of sectionKeys) {
      html += renderConfigItem(guildId, key, config.config[key], roles, channels, logEvents);
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function renderConfigItem(guildId, key, value, roles, channels, logEvents) {
  const isMulti = multiKeys.includes(key);
  const values = isMulti && typeof value === "string" ? value.split(",").filter(v => v) : [value];
  const pretty = getPrettyName(key);
  const roleData = JSON.stringify((roles.roles || []).map(r => ({ id: String(r.id), name: r.name || '' })));
  let inputHtml = "";
  if (isRoleKey(key) && isMulti) {
    inputHtml = `
      <div class="tag-input-wrapper" style="flex:1;position:relative;">
        <div class="tags" data-key="${escapeHtml(key)}" style="display:flex;gap:0.5rem;flex-wrap:wrap;padding:0.5rem;border:1px solid rgba(255,255,255,0.1);border-radius:4px;background:var(--panel);min-height:2.5rem;align-items:center;">
          ${values.filter(v => v).map(v => {
            const role = (roles.roles || []).find(r => r.id === v);
            return role ? `<span class="tag" data-id="${escapeHtml(v)}">${escapeHtml(role.name)} <button type="button" class="remove-tag" style="margin-left:0.3rem;color:#f55;border:none;background:none;cursor:pointer;">x</button></span>` : "";
          }).join("")}
          <input type="text" class="tag-input" placeholder="Type role name..." style="flex:1;border:none;background:none;color:var(--fg);outline:none;">
        </div>
        <div class="dropdown" style="display:none;position:absolute;background:var(--panel);border:1px solid rgba(255,255,255,0.1);border-radius:4px;max-height:150px;overflow-y:auto;width:100%;z-index:1000;">
          <div class="dropdown-options"></div>
        </div>
        <input type="hidden" name="value" value="${escapeHtml(values.join(","))}">
      </div>`;
  } else if (isRoleKey(key)) {
    inputHtml = `<select name="value" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
    inputHtml += `<option value="">None</option>`;
    (roles.roles || []).forEach((r) => {
      const selected = r.id === value ? "selected" : "";
      inputHtml += `<option value="${escapeHtml(r.id)}" ${selected}>${escapeHtml(r.name || '')}</option>`;
    });
    inputHtml += `</select>`;
  } else if (isChannelKey(key)) {
    inputHtml = `<select name="value" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);" ${key === "greeting_channel_id" ? "multiple size='3'" : ""}>`;
    inputHtml += `<option value="">None</option>`;
    (channels.channels || []).filter(c => c.type !== "category").forEach((c) => {
      const selected = key === "greeting_channel_id" ? values.includes(c.id) ? "selected" : "" : c.id === value ? "selected" : "";
      inputHtml += `<option value="${escapeHtml(c.id)}" ${selected}>${escapeHtml(c.name || '')} (${escapeHtml(c.type || '')})</option>`;
    });
    inputHtml += `</select>`;
  } else if (key === "log_events") {
    inputHtml = `<select name="value[]" multiple size="5" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
    (logEvents.events || []).forEach((e) => {
      const selected = values.includes(e.id) ? "selected" : "";
      inputHtml += `<option value="${escapeHtml(e.id)}" ${selected}>${escapeHtml(e.name || '')}</option>`;
    });
    inputHtml += `</select>`;
  } else if (isMessageKey(key)) {
    inputHtml = `<textarea name="value" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">${escapeHtml(value || "")}</textarea>`;
  } else if (isNumberKey(key)) {
    inputHtml = `<input type="number" name="value" value="${escapeHtml(value || "")}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  } else if (isUrlKey(key)) {
    inputHtml = `<input type="url" name="value" value="${escapeHtml(value || "")}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  } else {
    inputHtml = `<input type="text" name="value" value="${escapeHtml(value || "")}" style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  }
  let html = `<div class="config-item" style="display:flex;align-items:center;gap:0.5rem;justify-content:space-between;" data-key="${escapeHtml(key)}" data-roles='${escapeHtml(roleData)}'>`;
  html += `<label style="font-weight:600;min-width:150px;">${escapeHtml(pretty)}</label>`;
  html += `<form class="config-form" style="display:flex;gap:0.5rem;flex:1;">`;
  html += `<input type="hidden" name="key" value="${escapeHtml(key)}">`;
  html += inputHtml;
  html += `<button type="submit" style="padding:0.5rem 1rem;background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:transform 0.2s ease,box-shadow 0.2s ease;">Save</button>`;
  html += `</form></div>`;
  return html;
}

function renderShopSection(guildId, shop, roles) {
  let html = `<div class="section" id="shop-section" style="display:none;">`;
  html += '<h2 style="font-size:1.5rem;margin-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.5rem;">Shop</h2><div class="card" style="padding:1.5rem;margin-bottom:2rem;">';
  html += '<h3>Add Item</h3>';
  html += `<form action="/dashboard/${guildId}/shop" method="POST" style="display:grid;gap:0.5rem;margin-bottom:1rem;">`;
  html += `<label>Role:</label><select name="role_id" required style="padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  (roles.roles || []).forEach((r) => {
    html += `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name || '')}</option>`;
  });
  html += `</select>`;
  html += `<label>Name:</label><input name="name" required style="padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  html += `<label>Price:</label><input name="price" type="number" step="any" required style="padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  html += `<button type="submit" style="padding:0.5rem 1rem;background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:transform 0.2s ease,box-shadow 0.2s ease;">Add</button>`;
  html += `</form>`;
  html += '<h3 style="margin-top:1.5rem;">Items</h3>';
  if (shop.items && shop.items.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;">';
    html += '<thead><tr><th>Name</th><th>Role</th><th>Price</th><th>Active</th><th>Actions</th></tr></thead>';
    html += '<tbody>';
    shop.items.forEach((item) => {
      const role = (roles.roles || []).find((r) => r.id == item.role_id) || { name: 'Unknown' };
      html += `<tr><td>${escapeHtml(item.name || '')}</td><td>${escapeHtml(role.name)}</td><td>${escapeHtml(item.price || '')}</td><td>${item.active ? 'Yes' : 'No'}</td><td style="display:flex;gap:0.5rem;">`;
      html += `<form action="/dashboard/${guildId}/shop/${item.id}/update" method="POST" style="display:flex;gap:0.5rem;">`;
      html += `<input name="name" value="${escapeHtml(item.name || '')}" style="padding:0.3rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);width:100px;">`;
      html += `<input name="price" value="${escapeHtml(item.price || '')}" type="number" step="any" style="padding:0.3rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);width:80px;">`;
      html += `<button type="submit" style="padding:0.3rem 0.6rem;background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);">Update</button>`;
      html += `</form>`;
      html += `<form action="/dashboard/${guildId}/shop/${item.id}/toggle" method="POST"><button type="submit" style="padding:0.3rem 0.6rem;background:linear-gradient(90deg,#6c34cc,#4a2a99);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);">Toggle</button></form>`;
      html += `<form action="/dashboard/${guildId}/shop/${item.id}/delete" method="POST"><button type="submit" style="padding:0.3rem 0.6rem;background:#f55;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);">Delete</button></form>`;
      html += `</td></tr>`;
    });
    html += '</tbody></table>';
  } else {
    html += '<p>No items yet.</p>';
  }
  html += '</div></div>';
  return html;
}

function renderMemberSearchSection(guildId, member = null) {
  let html = `<div class="section" id="members-section" style="display:none;">`;
  html += '<h2 style="font-size:1.5rem;margin-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.5rem;">Member Lookup</h2><div class="card" style="padding:1.5rem;margin-bottom:2rem;">';
  html += `<form action="/dashboard/${guildId}/members" method="GET" style="display:flex;gap:0.5rem;margin-bottom:1rem;">`;
  html += `<input name="query" placeholder="ID or username" required style="flex:1;padding:0.5rem;border-radius:4px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">`;
  html += `<button type="submit" style="padding:0.5rem 1rem;background:linear-gradient(90deg,var(--accent),var(--accent2));color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:transform 0.2s ease,box-shadow 0.2s ease;">Search</button>`;
  html += `</form>`;
  if (member) {
    if (member.in_guild) {
      html += `<pre style="background:var(--panel);padding:1rem;border-radius:8px;border:1px solid rgba(255,255,255,0.05);">${escapeHtml(JSON.stringify(member.member, null, 2))}</pre>`;
    } else {
      html += '<p>Member not found in guild.</p>';
    }
  }
  html += '</div></div>';
  return html;
}

function renderDisabledCommandsSection(guildId, disabledData) {
  const { disabled = [], available = [] } = disabledData;
  const allCommands = [...new Set([...disabled, ...available])];
  let html = `<div class="section" id="commands-section" style="display:none;">`;
  html += '<h2 style="font-size:1.5rem;margin-bottom:1rem;border-bottom:1px solid rgba(255,255,255,0.1);padding-bottom:0.5rem;">Command Management</h2>';
  html += `<div class="card" style="padding:1.5rem;">`;

  if (allCommands.length === 0) {
    html += '<p>No commands available.</p>';
  } else {
    html += `<div style="display:grid;gap:0.75rem;">`;
    allCommands.forEach(cmd => {
      const isDisabled = disabled.includes(cmd);
      const toggleId = `toggle-${cmd.replace(/\s/g, '-')}`;
      html += `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:rgba(255,255,255,0.03);border-radius:8px;">
          <label for="${toggleId}" style="font-weight:500;cursor:pointer;flex:1;">${escapeHtml(cmd)}</label>
          <label class="switch">
            <input type="checkbox" id="${toggleId}" data-command="${escapeHtml(cmd)}" ${isDisabled ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>`;
    });
    html += `</div>`;
  }

  html += `</div></div>`;
  return html;
}

function renderLayout(user, contentHtml, isServerDashboard = false) {
  const av = escapeHtml(avatarUrl(user || {}));
  const userDisplay = user ? `${escapeHtml(user.username || '')}#${escapeHtml(user.discriminator || '')}` : "";
  const addBotUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(
    CLIENT_ID || ""
  )}&permissions=8&scope=bot%20applications.commands`;
  const searchBarHtml = `
    <div class="search-wrapper" style="position:fixed;top:80px;left:50%;transform:translateX(-50%);width:300px;display:flex;gap:0.5rem;z-index:1000;">
      <input type="text" id="search" placeholder="${isServerDashboard ? 'Search config...' : 'Search servers...'}"
        style="flex:1;padding:0.5rem;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:var(--panel);color:var(--fg);">
      <button id="clear-search" style="padding:0.5rem;background:#f55;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);">X</button>
    </div>
  `;
  const sidebarHtml = isServerDashboard ? `
    <nav class="nav-sidebar" id="nav-sidebar" style="position:fixed;top:80px;left:20px;width:220px;padding:1rem;background:var(--card);border-radius:12px;border:1px solid rgba(255,255,255,0.04);z-index:1000;"></nav>
  ` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Utilix</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
<style>
:root {
  --bg: #0b0a1e;
  --fg: #f2f2f7;
  --accent: #b266b2;
  --accent2: #7a44d4;
  --muted: #c0a0ff;
  --card: rgba(20,10,40,0.85);
  --panel: rgba(15,5,35,0.95);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: "Inter", system-ui, -apple-system, Segoe UI, Roboto, Arial;
  background: radial-gradient(circle at 20% 30%, #3b0a5f, var(--bg));
  color: var(--fg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  position: relative;
}
header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 72px;
  z-index: 1100;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  backdrop-filter: blur(10px);
  background: rgba(15,5,35,0.6);
  border-bottom: 1px solid rgba(255,255,255,0.05);
}
.logo {
  font-weight: 800;
  font-size: 1.25rem;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
nav.header-nav ul {
  display: flex;
  gap: 1.25rem;
  list-style: none;
  align-items: center;
  background: rgba(25,5,50,0.3);
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(12px);
}
nav.header-nav a {
  position: relative;
  color: var(--fg);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  padding: 0.55rem 1.1rem;
  border-radius: 999px;
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
  border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  transition: transform 0.3s ease;
}
nav.header-nav a:hover { color: var(--accent); transform: translateY(-1px); }
nav.header-nav a:hover::after { transform: translateX(-50%) scaleX(1); }
nav.header-nav a.active {
  background: linear-gradient(90deg, rgba(178,102,178,0.16), rgba(122,68,212,0.12));
  color: white;
  box-shadow: 0 0 12px rgba(178,102,178,0.12);
}
.auth-wrapper { display: flex; align-items: center; gap: 12px; }
.auth-wrapper img { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; }
.discord-btn {
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  color: white;
  font-weight: 600;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  text-decoration: none;
}
.logout-btn { font-size: 1.1rem; color: #f55; text-decoration: none; }
.page {
  flex: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: ${isServerDashboard ? '140px 20px 56px 260px' : '140px 20px 56px'};
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: row-reverse;
  gap: 2rem;
}
.content-area {
  flex: 1;
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.content-area.hidden { opacity: 0; transform: translateY(20px); }
h1, h2 { margin-bottom: 12px; font-weight: 600; }
h3 { margin-bottom: 8px; font-weight: 600; }
.servers {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 12px;
}
.server {
  background: var(--card);
  border-radius: 12px;
  padding: 1rem;
  text-align: center;
  border: 1px solid rgba(255,255,255,0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.server:hover { transform: translateY(-6px); box-shadow: 0 18px 40px rgba(0,0,0,0.6); }
.server img, .server-icon { width: 80px; height: 80px; border-radius: 16px; margin-bottom: 0.5rem; object-fit: cover; }
.server-icon { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.06); font-weight: 700; font-size: 1.5rem; }
.server-name { font-size: 0.95rem; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px; margin: 0 auto; }
.card { background: var(--card); padding: 16px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.04); margin-bottom: 2rem; }
table th, table td { padding: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: left; }
table th { font-weight: 600; }
.canvas-wrap { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
canvas#starfield { width: 100%; height: 100%; display: block; }
.tag-input-wrapper { position: relative; }
.tags { min-height: 2.5rem; display: flex; align-items: center; flex-wrap: wrap; }
.tag { background: rgba(255,255,255,0.1); padding: 0.3rem 0.6rem; border-radius: 4px; display: flex; align-items: center; }
.tag-input { min-width: 100px; border: none; background: none; color: var(--fg); outline: none; }
.dropdown { z-index: 1000; }
.dropdown-options div { padding: 0.5rem; cursor: pointer; }
.dropdown-options div:hover { background: rgba(255,255,255,0.1); }
.popup {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel);
  color: var(--fg);
  padding: 0.8rem 1.5rem;
  border-radius: 8px;
  border: 1px solid transparent;
  border-image: linear-gradient(90deg, var(--accent), var(--accent2)) 1;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  z-index: 2000;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.popup.show { opacity: 1; }
.nav-sidebar {
  width: 220px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.nav-sidebar button {
  padding: 1rem;
  background: linear-gradient(90deg, rgba(178,102,178,0.2), rgba(122,68,212,0.2));
  color: var(--fg);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 1rem;
  text-align: left;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
}
.nav-sidebar button:hover {
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.nav-sidebar button.active {
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  color: white;
}
.loading-screen {
  position: fixed;
  inset: 0;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--fg);
  border-top: 4px solid var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Toggle Switch */
.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
  flex-shrink: 0;
}
.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #444;
  transition: .3s;
  border-radius: 34px;
}
.slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}
input:checked + .slider {
  background-color: #66bb6a;
}
input:checked + .slider:before {
  transform: translateX(22px);
}

@media (max-width: 768px) {
  .page {
    flex-direction: column;
    padding: ${isServerDashboard ? '140px 20px 56px' : '140px 20px 56px'};
  }
  .nav-sidebar {
    position: relative;
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    top: 0;
    left: 0;
    padding: 0.5rem;
    margin-bottom: 1rem;
  }
  .nav-sidebar button {
    flex: 1 1 45%;
    text-align: center;
  }
  .search-wrapper {
    width: 100%;
    max-width: 300px;
    left: 50%;
    transform: translateX(-50%);
  }
  .card {
    grid-template-columns: 1fr;
  }
}
</style>
</head>
<body>
  <div id="loading-screen" class="loading-screen">
    <div class="loading-spinner"></div>
    <p style="margin-top:1rem;font-weight:600;">Loading Utilix Dashboard...</p>
  </div>
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
        <a href="/logout" class="logout-btn" title="Logout">Logout</a>
      </div>
    </div>
  </header>
  <div class="canvas-wrap"><canvas id="starfield"></canvas></div>
  <main class="page" data-guild-id="${contentHtml.includes('No access') || contentHtml.includes('Error') ? '' : contentHtml.match(/\/dashboard\/(\d+)/)?.[1] || ''}">
    ${sidebarHtml}
    <div class="content-area" id="content-area">${searchBarHtml}${contentHtml}</div>
    <div id="popup" class="popup">Saved</div>
  </main>
<script>
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resizeCanvas);
resizeCanvas();
let stars = [];
function createStars() {
  stars = [];
  for (let i = 0; i < 200; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.5,
      s: Math.random() * 0.5 + 0.1,
      c: 'hsl(' + Math.random() * 360 + ',70%,80%)'
    });
  }
}
function animate() {
  ctx.fillStyle = 'rgba(11,10,30,0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const s of stars) {
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

document.addEventListener('DOMContentLoaded', () => {
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    setTimeout(() => loadingScreen.style.display = 'none', 1000);
  }

  document.querySelectorAll('.tag-input-wrapper').forEach(wrapper => {
    const input = wrapper.querySelector('.tag-input');
    const tagsContainer = wrapper.querySelector('.tags');
    const dropdown = wrapper.querySelector('.dropdown');
    const dropdownOptions = dropdown.querySelector('.dropdown-options');
    const hiddenInput = wrapper.querySelector('input[name="value"]');
    let roles = [];
    try {
      roles = JSON.parse(wrapper.closest('.config-item').dataset.roles || '[]');
    } catch (e) {}
    input.addEventListener('input', () => {
      const query = input.value.toLowerCase();
      if (query.length < 1) { dropdown.style.display = 'none'; return; }
      const filtered = roles.filter(r => r.name.toLowerCase().includes(query));
      \`<button data-section="\${s.id}" \${s.id === 'settings-section' ? 'class="active"' : ''}>\${s.label}</button>\`
      dropdown.style.display = filtered.length > 0 ? 'block' : 'none';
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && dropdown.querySelector('.dropdown-options div')) {
        e.preventDefault();
        const first = dropdown.querySelector('.dropdown-options div');
        addTag(first.dataset.id, first.textContent);
      } else if (e.key === 'Backspace' && input.value === '' && tagsContainer.querySelectorAll('.tag').length > 0) {
        tagsContainer.querySelector('.tag:last-of-type')?.remove();
        updateHidden();
      }
    });
    dropdownOptions.addEventListener('click', e => {
      const div = e.target.closest('div[data-id]');
      if (div) addTag(div.dataset.id, div.textContent);
    });
    tagsContainer.addEventListener('click', e => {
      if (e.target.classList.contains('remove-tag')) {
        e.target.parentElement.remove();
        updateHidden();
      }
    });
    function addTag(id, name) {
      if (tagsContainer.querySelector(\`.tag[data-id="\${id}"]\`)) return;
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.dataset.id = id;
      tag.innerHTML = \`\${escapeHtml(name)} <button type="button" class="remove-tag" style="margin-left:0.3rem;color:#f55;border:none;background:none;cursor:pointer;">x</button>\`;
      tagsContainer.insertBefore(tag, input);
      input.value = '';
      dropdown.style.display = 'none';
      updateHidden();
    }
    function updateHidden() {
      hiddenInput.value = Array.from(tagsContainer.querySelectorAll('.tag')).map(t => t.dataset.id).join(',');
    }
    input.addEventListener('blur', () => setTimeout(() => dropdown.style.display = 'none', 200));
  });

  document.querySelectorAll('.config-form').forEach(form => {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(form);
      const key = fd.get('key');
      let value = fd.get('value');
      if (!value) value = fd.getAll('value[]').join(',');
      const guildId = document.querySelector('main').dataset.guildId;
      try {
        const res = await fetch(\`/dashboard/\${guildId}/config\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
        const popup = document.getElementById('popup');
        popup.textContent = res.ok ? 'Saved!' : 'Error';
        popup.style.color = res.ok ? 'var(--fg)' : '#f55';
        popup.classList.add('show');
        setTimeout(() => popup.classList.remove('show'), 2000);
      } catch (err) {
        console.error(err);
      }
    });
  });

  const guildId = document.querySelector('main').dataset.guildId;
  const popup = document.getElementById('popup');

  function showPopup(msg, isError = false) {
    popup.textContent = msg;
    popup.style.color = isError ? '#f55' : 'var(--fg)';
    popup.classList.add('show');
    setTimeout(() => popup.classList.remove('show'), 3000);
  }

  document.querySelectorAll('#commands-section input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', async function() {
      const command = this.dataset.command;
      const disable = this.checked;
      const endpoint = disable ? 'disable' : 'enable';
      try {
        const res = await fetch(\`/dashboard/\${guildId}/disabled/\${endpoint}\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ commands: [command] })
        });
        const data = await res.json();
        if (data.success) {
          let msg = disable ? \`Disabled: \${command}\` : \`Enabled: \${command}\`;
          if (data.changes.already_disabled) msg += \` (already disabled)\`;
          if (data.changes.already_enabled) msg += \` (already enabled)\`;
          showPopup(msg);
        } else {
          this.checked = !disable;
          showPopup('Failed to update', true);
        }
      } catch (err) {
        this.checked = !disable;
        showPopup('Network error', true);
      }
    });
  });

  const search = document.getElementById('search');
  const clearSearch = document.getElementById('clear-search');
  if (search && clearSearch) {
    search.addEventListener('input', () => {
      const q = search.value.toLowerCase();
      if (document.querySelector('.servers')) {
        document.querySelectorAll('.server').forEach(s => {
          s.style.display = s.querySelector('.server-name').textContent.toLowerCase().includes(q) ? '' : 'none';
        });
      } else {
        document.querySelectorAll('.config-item').forEach(i => {
          i.style.display = i.querySelector('label').textContent.toLowerCase().includes(q) ? 'flex' : 'none';
        });
        document.querySelectorAll('.card').forEach(c => {
          c.style.display = Array.from(c.querySelectorAll('.config-item')).some(i => i.style.display !== 'none') ? 'grid' : 'none';
        });
      }
    });
    clearSearch.addEventListener('click', () => {
      search.value = '';
      document.querySelectorAll('.server, .config-item, .card').forEach(el => el.style.display = '');
    });
  }

  const nav = document.getElementById('nav-sidebar');
  if (nav && guildId) {
    const sections = [
      { id: 'settings-section', label: 'Settings' },
      { id: 'moderation-section', label: 'Moderation' },
      { id: 'shop-section', label: 'Shop' },
      { id: 'members-section', label: 'Members' },
      { id: 'commands-section', label: 'Commands' }
    ];
    nav.innerHTML = sections.map(s => 
      `<button data-section="\${s.id}" \${s.id === 'settings-section' ? 'class="active"' : ''}>\${s.label}</button>`
    ).join('');
    nav.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      document.querySelectorAll('.section').forEach(sec => sec.style.display = 'none');
      document.querySelectorAll('.nav-sidebar button').forEach(b => b.classList.remove('active'));
      const target = document.getElementById(btn.dataset.section);
      if (target) target.style.display = 'block';
      btn.classList.add('active');
    });
    document.getElementById('settings-section').style.display = 'block';
  }
});
</script>
</body>
</html>`;
}

/* ---------------- OAuth & Dashboard Routes ---------------- */
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
    const userResp = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResp.json();
    if (!userData.id) throw new Error("Failed to fetch user data");
    const myJwt = jwtLib.sign({ sub: userData.id }, JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
    req.session.jwt = myJwt;
    req.session.discordAccessToken = tokenData.access_token;
    req.session.user = userData;
    const guildResp = await fetch("https://discord.com/api/users/@me/guilds", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    let guilds = await guildResp.json();
    if (!Array.isArray(guilds)) guilds = [];
    req.session.guilds = guilds;
    let botGuildIds = [];
    try {
      const botGuildsPath = path.join(__dirname, "bot_guilds.json");
      if (fs.existsSync(botGuildsPath)) {
        botGuildIds = JSON.parse(fs.readFileSync(botGuildsPath)).guild_ids || [];
      }
    } catch (err) {
      console.error("Failed to load bot_guilds.json:", err);
    }
    const botGuildSet = new Set(botGuildIds);
    const candidateGuilds = guilds.filter(g => botGuildSet.has(String(g.id)) && (parseInt(g.permissions || "0", 10) & 0x20) === 0x20);
    let results = {};
    if (candidateGuilds.length > 0) {
      try {
        const batchRes = await fetch(`${API_BASE}/checkPermsBatch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${myJwt}`,
          },
          body: JSON.stringify({ guildIds: candidateGuilds.map(g => String(g.id)) }),
        });
        if (batchRes.ok) {
          const batchText = await batchRes.text();
          results = JSON.parse(batchText, jsonReviver);
          results = results.results || {};
        }
      } catch (err) {
        console.error("Error calling /checkPermsBatch:", err);
      }
    }
    req.session.perms = results;
    const filteredGuilds = candidateGuilds.filter(g => results[g.id]?.allowed);
    const serversHtml = filteredGuilds
      .map((g) => {
        const name = truncateName(g.name || "");
        const icon = guildIconUrl(g);
        return `<div class="server"><a href="/dashboard/${g.id}">${
          icon
            ? `<img src="${escapeHtml(icon)}"/>`
            : `<div class="server-icon">${escapeHtml(name.charAt(0))}</div>`
        }<div class="server-name">${escapeHtml(name)}</div></a></div>`;
      })
      .join('');
    res.send(renderLayout(userData, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Error");
  }
});

app.get("/dashboard", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const perms = req.session.perms || {};
  const guilds = req.session.guilds || [];
  let botGuildIds = [];
  try {
    const botGuildsPath = path.join(__dirname, "bot_guilds.json");
    if (fs.existsSync(botGuildsPath)) {
      botGuildIds = JSON.parse(fs.readFileSync(botGuildsPath)).guild_ids || [];
    }
  } catch (err) {
    console.error("Failed to load bot_guilds.json:", err);
    botGuildIds = [];
  }
  const botGuildSet = new Set(botGuildIds);
  const candidateGuilds = guilds.filter(g => botGuildSet.has(String(g.id)) && (parseInt(g.permissions || "0", 10) & 0x20) === 0x20);
  const filteredGuilds = candidateGuilds.filter(g => perms[g.id]?.allowed);
  const serversHtml = filteredGuilds
    .map((g) => {
      const name = truncateName(g.name || "");
      const icon = guildIconUrl(g);
      return `<div class="server"><a href="/dashboard/${g.id}">${
        icon
          ? `<img src="${escapeHtml(icon)}"/>`
          : `<div class="server-icon">${escapeHtml(name.charAt(0))}</div>`
      }<div class="server-name">${escapeHtml(name)}</div></a></div>`;
    })
    .join('');
  res.send(renderLayout(user, `<h2>Your Servers</h2><div class="servers">${serversHtml}</div>`));
});

app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const user = req.session.user;
  const jwt = req.session.jwt;
  const guildId = req.params.id;
  const guild = (req.session.guilds || []).find((g) => g.id === guildId);
  const perms = req.session.perms || {};
  if (!guild) {
    return res.send(renderLayout(user, `<div class="card"><h2>No access</h2></div>`, false));
  }
  const MANAGE_GUILD = 0x20;
  const hasManage = (parseInt(guild.permissions || "0", 10) & MANAGE_GUILD) === MANAGE_GUILD;
  if (!hasManage || !perms[guildId]?.allowed) {
    return res.send(
      renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name || '')}</h2><p>No permission</p></div>`, false)
    );
  }
  try {
    const [data, disabledData] = await Promise.all([
      fetchGuildData(guildId, jwt),
      fetchDisabledCommands(guildId, jwt)
    ]);
    if (data.error) throw new Error("Failed to fetch guild data");
    let contentHtml = `<h1>${escapeHtml(guild.name || '')}</h1>`;
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, 'settings');
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, 'moderation');
    contentHtml += renderShopSection(guildId, data.shop, data.roles);
    contentHtml += renderMemberSearchSection(guildId);
    contentHtml += renderDisabledCommandsSection(guildId, disabledData);
    res.send(renderLayout(user, contentHtml, true));
  } catch (err) {
    console.error("Error in /dashboard/:id:", err);
    res.send(renderLayout(user, `<div class="card"><h2>Error</h2></div>`, false));
  }
});

app.get("/dashboard/:id/members", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const query = req.query.query;
  if (!query) return res.redirect(`/dashboard/${guildId}`);
  try {
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const memberRes = await fetch(`${API_BASE}/dashboard/${guildId}/members?query=${encodeURIComponent(query)}`, { headers });
    let memberText = await memberRes.text();
    const member = memberRes.ok ? JSON.parse(memberText, jsonReviver) : { success: false };
    const data = await fetchGuildData(guildId, req.session.jwt, { member: member.success ? member : null });
    const guild = (req.session.guilds || []).find((g) => g.id === guildId);
    let contentHtml = `<h1>${escapeHtml(guild.name || '')}</h1>`;
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, 'settings');
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, 'moderation');
    contentHtml += renderShopSection(guildId, data.shop, data.roles);
    contentHtml += renderMemberSearchSection(guildId, data.member);
    res.send(renderLayout(req.session.user, contentHtml, true));
  } catch (err) {
    console.error("Error in /dashboard/:id/members:", err);
    res.redirect(`/dashboard/${guildId}`);
  }
});

/* ---------------- Config & Disabled Endpoints ---------------- */
app.post("/dashboard/:id/config", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  const guildId = req.params.id;
  let { key, value } = req.body;
  if (Array.isArray(value)) value = value.join(",");
  value = String(value);
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const updateRes = await fetch(`${API_BASE}/dashboard/${guildId}/config`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ key, value }),
    });
    res.json(updateRes.ok ? { success: true } : { error: "Error saving config" });
  } catch (err) {
    console.error("Error in /dashboard/:id/config:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.get("/dashboard/:id/disabled", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  const guildId = req.params.id;
  try {
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/disabled`, { headers });
    let apiText = await apiRes.text();
    const data = apiRes.ok ? JSON.parse(apiText, jsonReviver) : { success: false, disabled: [], available: [] };
    res.json(data);
  } catch (err) {
    console.error("Error fetching disabled:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.put("/dashboard/:id/disabled", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  const guildId = req.params.id;
  const { commands } = req.body;
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/disabled`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ commands: commands.map(c => String(c)) }),
    });
    let apiText = await apiRes.text();
    const data = apiRes.ok ? JSON.parse(apiText, jsonReviver) : { success: false };
    res.json(data);
  } catch (err) {
    console.error("Error updating disabled:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/dashboard/:id/disabled/disable", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  const guildId = req.params.id;
  const { commands } = req.body;
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/disabled/disable`, {
      method: "POST",
      headers,
      body: JSON.stringify({ commands: commands.map(c => String(c)) }),
    });
    let apiText = await apiRes.text();
    const data = apiRes.ok ? JSON.parse(apiText, jsonReviver) : { success: false };
    res.json(data);
  } catch (err) {
    console.error("Error disabling commands:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

app.post("/dashboard/:id/disabled/enable", async (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
  const guildId = req.params.id;
  const { commands } = req.body;
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/disabled/enable`, {
      method: "POST",
      headers,
      body: JSON.stringify({ commands: commands.map(c => String(c)) }),
    });
    let apiText = await apiRes.text();
    const data = apiRes.ok ? JSON.parse(apiText, jsonReviver) : { success: false };
    res.json(data);
  } catch (err) {
    console.error("Error enabling commands:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

/* ---------------- Shop Actions ---------------- */
app.post("/dashboard/:id/shop", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const { role_id, name, price } = req.body;
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const addRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop`, {
      method: "POST",
      headers,
      body: JSON.stringify({ role_id: String(role_id), name, price: String(price) }),
    });
    if (addRes.ok) res.redirect(`/dashboard/${guildId}`);
    else res.status(400).send("Error adding item");
  } catch (err) {
    console.error("Error in /dashboard/:id/shop:", err);
    res.status(500).send("Internal error");
  }
});

app.post("/dashboard/:id/shop/:item_id/update", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const itemId = req.params.item_id;
  const { name, price } = req.body;
  try {
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const updateRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop/${itemId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name, price: String(price) }),
    });
    if (updateRes.ok) res.redirect(`/dashboard/${guildId}`);
    else res.status(400).send("Error updating item");
  } catch (err) {
    console.error("Error in /dashboard/:id/shop/:item_id/update:", err);
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
    if (toggleRes.ok) res.redirect(`/dashboard/${guildId}`);
    else res.status(400).send("Error toggling item");
  } catch (err) {
    console.error("Error in /dashboard/:id/shop/:item_id/toggle:", err);
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
    if (deleteRes.ok) res.redirect(`/dashboard/${guildId}`);
    else res.status(400).send("Error deleting item");
  } catch (err) {
    console.error("Error in /dashboard/:id/shop/:item_id/delete:", err);
    res.status(500).send("Internal error");
  }
});

/* ---------------- Misc ---------------- */
app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));
app.get("/", (req, res) => res.redirect("/dashboard"));
app.get("/me", (req, res) =>
  res.json(req.session.user ? { loggedIn: true, user: req.session.user } : { loggedIn: false })
);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
