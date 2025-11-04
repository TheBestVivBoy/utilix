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
      : sectionGroups[title] || [];
    if (!sectionKeys.length) continue;
    html += `<h2>${title}</h2>`;
    for (const key of sectionKeys) {
      const val = config.config[key] ?? "";
      const disabled = disabledSet.has(key) ? "disabled" : "";
      const name = getPrettyName(key);
      if (multiKeys.includes(key)) {
        html += `<div class="multi-input" data-key="${key}">`;
        const ids = Array.isArray(val) ? val : (val ? [val] : []);
        for (const id of ids) {
          const roleName = roles.find(r => r.id === id)?.name || id;
          html += `<span class="tag" data-id="${id}">${escapeHtml(roleName)} <button type="button" class="remove-tag">x</button></span>`;
        }
        html += `<input type="text" placeholder="Add role..." class="multi-role-input" ${disabled}>`;
        html += `</div>`;
      } else {
        html += `<div class="input-group"><label>${name}</label><input type="text" value="${escapeHtml(val)}" ${disabled}></div>`;
      }
    }
  }
  html += "</div>";
  return html;
}

/* ---------------- routes ---------------- */
app.get("/", (req, res) => {
  res.send("<h1>Utilix Dashboard Server Running</h1>");
});

app.get("/guild/:guildId", async (req, res) => {
  const jwt = req.session.jwt;
  if (!jwt) return res.redirect("/login");
  const guildId = req.params.guildId;
  const data = await fetchGuildData(guildId, jwt);
  if (data.error || !data.config.allowed) return res.send("You cannot access this guild.");
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Guild Dashboard</title>
      <style>
        .tag { background:#eee;padding:2px 5px;margin:2px;display:inline-block;border-radius:3px; }
        .remove-tag { margin-left:5px;color:red;cursor:pointer; }
        .input-group { margin-bottom:10px; }
      </style>
    </head>
    <body>
      ${renderConfigSections(guildId, data.config, data.roles.roles, data.channels.channels, data.logEvents.events)}
      <script>
        document.querySelectorAll('.multi-role-input').forEach(input=>{
          input.addEventListener('keypress', e=>{
            if(e.key==='Enter'&&input.value.trim()){
              const container=input.parentElement;
              const tag=document.createElement('span');
              tag.className='tag';
              tag.dataset.id=input.value.trim();
              tag.innerHTML = input.value.trim()+' <button type="button" class="remove-tag">x</button>';
              container.insertBefore(tag,input);
              input.value='';
            }
          });
          input.parentElement.addEventListener('click', e=>{
            if(e.target.classList.contains('remove-tag')){
              e.target.parentElement.remove();
            }
          });
        });
      </script>
    </body>
    </html>
  `;
  res.send(html);
});

/* ---------------- login placeholder ---------------- */
app.get("/login", (req, res) => {
  res.send("Login route placeholder. Implement OAuth2 here.");
});

/* ---------------- start server ---------------- */
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
