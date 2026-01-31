import dotenv from "dotenv";
import express from "express";
import bodyParser from "body-parser";
import session from "express-session";
import path from "path";
import fs from "fs";
import jwtLib from "jsonwebtoken";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
//hi from utilix
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Block check start here 
const DASHBOARD_LOCKED_TO = process.env.DASHBOARD_LOCKED_TO
  ?.split(',')
  .map(id => id.trim())
  .filter(id => /^\d{17,19}$/.test(id))   
  || [];
//block end here

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
  if (channelKeyExclusions.has(key)) return false;
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

function slugifyLabel(label = "") {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .trim() || "general";
}

function normalizeDiscordId(value) {
  if (value === undefined || value === null) return "";
  const str = String(value).trim();
  if (!str) return "";
  if (/^\d+$/.test(str)) return str;
  const match = str.match(/(\d{6,})/);
  return match ? match[1] : str;
}

const prettyNames = {
  prefix: "Command Prefix",
  bot_admin_role_id: "Bot Admin",
  ticket_admin_1_role_id: "Ticket Admin Role",
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
  greeting_channel_id: "Greeting Channels",
  auto_roles_on_join: "Auto Roles on Join",
  modlog_channel_id: "Modlogs",
  logs_channel_id: "Action Log",
  log_events: "Event Log",
  ban_threshold: "Ban Threshold",
  ticket_log_1_channel_id: "Ticket Logging / Transcripts",
  store_payment_user_id: "Shop Revenue Recipient",
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
  "Economy": ["store_payment_user_id"],
};

const multiKeys = [
  "bot_admin_role_id", "ticket_admin_1_role_id",
  "warn_role_id", "mute_role_id", "unmute_role_id", "unwarn_role_id", "ban_role_id", "unban_role_id", "kick_role_id", "minigames_staff_role_id", "ticket_staff_1_role_id", "invite_manager_role_id",
  "greeting_channel_id", "auto_roles_on_join", "log_events",
];

const channelKeyExclusions = new Set(["ai_channel_retain_mode", "ai_channel_retain_value"]);

const aiModelOptions = [
  { value: "auto", label: "Auto (best available)" },
  { value: "gpt-5", label: "gpt-5" },
  { value: "gpt-5-mini", label: "gpt-5-mini" },
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
  { value: "gpt-5-nano", label: "gpt-5-nano" },
];

const aiRetainModeOptions = [
  { value: "off", label: "Off" },
  { value: "minutes", label: "Minutes" },
  { value: "messages", label: "Messages" },
];

// Map role keys to command names
const roleToCommand = {
  ban_role_id: "ban",
  unban_role_id: "unban",
  kick_role_id: "kick",
  mute_role_id: "mute",
  unmute_role_id: "unmute",
  warn_role_id: "warn",
  unwarn_role_id: "unwarn",
  minigames_staff_role_id: "minigames",
  ticket_staff_1_role_id: "ticket",
  invite_manager_role_id: "invites",
};

const jsonReviver = (key, value) =>
  typeof value === "number" ? String(value) : value;

function clientWantsJson(req) {
  const accept = req.headers?.accept || "";
  return accept.includes("application/json") || req.headers["x-requested-with"] === "fetch";
}

async function parseApiResponseBody(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw, jsonReviver);
  } catch (err) {
    return { raw };
  }
}

function responseUnauthorized(res) {
  if (!res) return false;
  return res.status === 401 || res.status === 403;
}

async function fetchGuildData(guildId, jwt, extra = {}) {
  const headers = { Authorization: `Bearer ${jwt}`, Accept: "application/json" };
  try {
    const response = await fetch(`${API_BASE}/dashboard/${guildId}/bundle`, { headers });
    if (responseUnauthorized(response)) {
      return { unauthorized: true };
    }
    const text = await response.text();
    if (!response.ok) {
      console.error("Failed to load dashboard bundle", response.status, text);
      return { error: true };
    }
    const payload = text ? JSON.parse(text, jsonReviver) : {};
    const data = {
      config: payload.config || { allowed: false, config: {} },
      shop: payload.shop || { success: false, items: [] },
      roles: payload.roles || { success: false, roles: [] },
      channels: payload.channels || { success: false, channels: [] },
      logEvents: payload.logEvents || { success: false, events: [] },
      disabled: payload.disabled || { disabled: [], available: [] },
      ...extra,
    };
    return data;
  } catch (err) {
    console.error("Error fetching guild data:", err);
    return { error: true };
  }
}

function renderConfigSections(guildId, config, roles, channels, logEvents, disabled, sectionType = "settings") {
  const configPayload = config && typeof config.config === "object" ? config.config : (config || {});
  const allGroupedKeys = Object.values(sectionGroups).flat();
  const knownKeys = new Set([...Object.keys(prettyNames), ...allGroupedKeys, "store_payment_user_id"]);
  const targetGroups =
    sectionType === "moderation"
      ? ["Moderation Roles"]
      : ["Bot Administrator Permissions", "Bot Customization", "Join / Leaves", "Logging", "Economy", "General"];
  const safeRoles = Array.isArray(roles?.roles) ? roles.roles : [];
  const roleDatasetValue = escapeHtml(
    JSON.stringify(safeRoles.map((role) => ({ id: String(role.id), name: role.name || "" })))
  );
  const isSettingsSection = sectionType === "settings";
  const categoryEntries = [];
  for (const title of targetGroups) {
    const baseKeys = sectionGroups[title] || [];
    let sectionKeys;
    if (title === "General") {
      const generalKeys = Object.keys(configPayload).filter((key) => !allGroupedKeys.includes(key));
      const defaultGeneral = Array.from(knownKeys).filter((key) => !allGroupedKeys.includes(key));
      sectionKeys = generalKeys.length ? generalKeys : defaultGeneral;
    } else if (baseKeys.length) {
      sectionKeys = baseKeys;
    } else {
      sectionKeys = Object.keys(configPayload).filter((key) => baseKeys.includes(key));
    }

    // Removed knownKeys.has(key) so every key from configPayload can render
    sectionKeys = Array.from(new Set(sectionKeys)).filter((key) => key !== "guild_id" && key !== "allowed");

    if (sectionKeys.length === 0) continue;
    const categorySlug = slugifyLabel(`${sectionType}-${title}`);
    let block = `<h2 class="section-title">${escapeHtml(title)}</h2>`;
    block += `<div class="card settings-card">`;

    sectionKeys.forEach((key) => {
      const roleAttr = isRoleKey(key) ? ` data-roles="${roleDatasetValue}"` : "";
      const value = Object.prototype.hasOwnProperty.call(configPayload, key) ? configPayload[key] : "";
      block += `<div class="config-item" data-key="${escapeHtml(key)}"${roleAttr}>`;
      block += renderConfigItem(guildId, key, value, roles, channels, logEvents);
      block += `</div>`;
    });

    block += `</div>`;
    categoryEntries.push({ slug: categorySlug, title, content: block });
  }

  const sectionAttr = isSettingsSection ? "" : ' style="display:none;"';
  if (!categoryEntries.length) {
    return `<section class="section" id="${sectionType}-section"${sectionAttr}></section>`;
  }

  const navHtml =
    categoryEntries.length > 1
      ? `<div class="category-tabs" data-section="${sectionType}">
          ${categoryEntries
            .map(
              (entry, index) =>
                `<button type="button" data-category="${entry.slug}"${index === 0 ? ' class="active"' : ""}>${escapeHtml(entry.title)}</button>`
            )
            .join("")}
          <span class="category-tabs__slider"></span>
        </div>`
      : "";

  const categoriesHtml = categoryEntries
    .map(
      (entry, index) =>
        `<div class="config-category${index === 0 ? " is-active" : ""}" data-category="${entry.slug}">${entry.content}</div>`
    )
    .join("");

  return `<section class="section" id="${sectionType}-section"${sectionAttr}>${navHtml}${categoriesHtml}</section>`;
}

function parseMultiValues(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (item === null || item === undefined ? "" : String(item)))
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (raw === undefined || raw === null) return [];
  const stringRaw = String(raw).trim();
  if (!stringRaw) return [];
  if (
    (stringRaw.startsWith("[") && stringRaw.endsWith("]")) ||
    (stringRaw.startsWith("{") && stringRaw.endsWith("}"))
  ) {
    try {
      const parsed = JSON.parse(stringRaw);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      // fall through
    }
  }
  const normalized = stringRaw.replace(/^\[|\]$/g, "");
  const hasDelimiter = /,|\n/.test(normalized);
  if (!hasDelimiter) {
    return [normalized.replace(/^["'\s]+|["'\s]+$/g, "")].filter(Boolean);
  }
  return normalized
    .split(/[,\n]+/)
    .map((segment) => segment.trim().replace(/^["']+|["']+$/g, ""))
    .filter(Boolean);
}

function renderConfigItem(guildId, key, value, roles, channels, logEvents) {
  const isMulti = multiKeys.includes(key);
  const normalizedValue = value === undefined || value === null ? "" : value;
  const rawStringValue = Array.isArray(normalizedValue) ? normalizedValue.join(",") : String(normalizedValue);
  const stringValue = rawStringValue.trim().replace(/^["']+|["']+$/g, "");
  const roleList = Array.isArray(roles?.roles) ? roles.roles : [];
  const roleMap = new Map(roleList.map((role) => [String(role.id), role]));
  const channelList = Array.isArray(channels?.channels) ? channels.channels : [];
  const channelMap = new Map(channelList.map((channel) => [String(channel.id), channel]));
  const parsedValues = parseMultiValues(normalizedValue).map((v) => String(v).trim()).filter((v) => v);
  const values = isMulti ? parsedValues : [stringValue];
  const pretty = getPrettyName(key);
  let inputHtml = "";

  if (isRoleKey(key) && isMulti) {
    const normalizedPairs = values.map((raw) => {
      const normalized = normalizeDiscordId(raw);
      return { raw, normalized: normalized || raw };
    });
    const normalizedValues = normalizedPairs.map((pair) => pair.normalized).filter(Boolean);
    const tagsHtml = normalizedPairs
      .map(({ raw, normalized }) => {
        if (!normalized) return "";
        const role = roleMap.get(String(normalized));
        const label = role?.name || `Unresolved Role (${normalized})`;
        const extraClass = role ? "" : " tag--missing";
        return `<span class="tag${extraClass}" data-id="${escapeHtml(String(normalized))}"><span class="tag-text">${escapeHtml(
          label
        )}</span><button type="button" class="tag-remove" aria-label="Remove ${escapeHtml(label)}">&times;</button></span>`;
      })
      .join("");
    inputHtml = `
      <div class="tag-input-wrapper">
        <div class="tags">
          ${tagsHtml}
          <input type="text" class="tag-input" placeholder="Search role...">
        </div>
        <div class="dropdown">
          <div class="dropdown-options"></div>
        </div>
        <input type="hidden" name="value" value="${escapeHtml(normalizedValues.join(","))}">
      </div>`;
  } else if (isRoleKey(key)) {
    const normalizedSingle = normalizeDiscordId(stringValue);
    const missingRoleOption =
      normalizedSingle && !roleMap.has(String(normalizedSingle))
        ? `<option value="${escapeHtml(String(normalizedSingle))}" selected class="option-missing">Unresolved Role (${escapeHtml(
            stringValue || normalizedSingle
          )})</option>`
        : "";
    inputHtml = `<select name="value" class="form-control">
      <option value="">None</option>
      ${roleList
        .map(
          (r) =>
            `<option value="${escapeHtml(String(r.id))}" ${String(r.id) === normalizedSingle ? "selected" : ""}>${escapeHtml(
              r.name || ""
            )}</option>`
        )
        .join("")}
      ${missingRoleOption}
    </select>`;
  } else if (key === "ai_enabled") {
    inputHtml = `<select name="value" class="form-control">
      <option value="1" ${stringValue === "1" ? "selected" : ""}>Enabled</option>
      <option value="0" ${stringValue === "0" ? "selected" : ""}>Disabled</option>
    </select>`;
  } else if (key === "ai_model") {
    inputHtml = `<select name="value" class="form-control">
      ${aiModelOptions
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}" ${option.value === stringValue ? "selected" : ""}>${escapeHtml(
              option.label
            )}</option>`
        )
        .join("")}
    </select>`;
  } else if (key === "ai_channel_retain_mode") {
    inputHtml = `<select name="value" class="form-control">
      ${aiRetainModeOptions
        .map(
          (option) =>
            `<option value="${escapeHtml(option.value)}" ${option.value === stringValue ? "selected" : ""}>${escapeHtml(
              option.label
            )}</option>`
        )
        .join("")}
    </select>`;
  } else if (key === "ai_channel_retain_value") {
    inputHtml = `<input type="number" min="0" max="500" name="value" value="${escapeHtml(stringValue)}" class="form-control">`;
  } else if (key === "ai_max_output_tokens") {
    inputHtml = `<input type="number" min="1" max="5000" name="value" value="${escapeHtml(stringValue)}" class="form-control">`;
  } else if (isChannelKey(key)) {
    const isMultiChannel = key === "greeting_channel_id";
    const channelValues = isMultiChannel ? values : [stringValue];
    const normalizedChannelValues = channelValues
      .map((raw) => normalizeDiscordId(raw) || raw)
      .filter((value) => value !== "");
    const channelSet = new Set(normalizedChannelValues);
    const normalizedSingleChannel = normalizeDiscordId(stringValue);
    const missingChannels = isMultiChannel
      ? normalizedChannelValues.filter((v) => v && !channelMap.has(String(v)))
      : normalizedSingleChannel && !channelMap.has(String(normalizedSingleChannel))
        ? [normalizedSingleChannel]
        : [];
    const missingChannelOptions = missingChannels
      .map(
        (value) =>
          `<option value="${escapeHtml(String(value))}" selected class="option-missing">Unresolved Channel (${escapeHtml(
            String(value)
          )})</option>`
      )
      .join("");
    inputHtml = `<select name="value" class="form-control${isMultiChannel ? " form-control--multi" : ""}" ${
      isMultiChannel ? "multiple size='4'" : ""
    }>
      <option value="">None</option>
      ${channelList
        .filter((c) => c.type !== "category")
        .map((c) => {
          const selected = isMultiChannel
            ? channelSet.has(String(c.id))
            : String(c.id) === normalizedSingleChannel;
          return `<option value="${escapeHtml(String(c.id))}" ${selected ? "selected" : ""}>${escapeHtml(
            c.name || ""
          )} (${escapeHtml(c.type || "")})</option>`;
        })
        .join("")}
      ${missingChannelOptions}
    </select>`;
  } else if (key === "log_events") {
    const options = Array.isArray(logEvents?.events)
      ? logEvents.events.map((event) => ({
          id: String(event.value ?? event.id ?? event.key ?? ""),
          name: event.label || event.name || event.value || "",
        }))
      : [];
    inputHtml = `<select name="value[]" multiple size="6" class="form-control form-control--multi">
      ${options
        .map(({ id, name }) => {
          if (!id) return "";
          return `<option value="${escapeHtml(id)}" ${values.includes(id) ? "selected" : ""}>${escapeHtml(name)}</option>`;
        })
        .join("")}
    </select>`;
  } else if (isMessageKey(key)) {
    inputHtml = `<textarea name="value" class="form-control form-control--textarea">${escapeHtml(stringValue)}</textarea>`;
  } else if (isNumberKey(key)) {
    inputHtml = `<input type="number" name="value" value="${escapeHtml(stringValue)}" class="form-control">`;
  } else if (isUrlKey(key)) {
    inputHtml = `<input type="url" name="value" value="${escapeHtml(stringValue)}" class="form-control">`;
  } else {
    inputHtml = `<input type="text" name="value" value="${escapeHtml(stringValue)}" class="form-control">`;
  }

  return `
    <label class="config-label">${escapeHtml(pretty)}</label>
    <form class="config-form">
      <input type="hidden" name="key" value="${escapeHtml(key)}">
      ${inputHtml}
      <button type="submit" class="primary-btn save-btn">Save</button>
    </form>`;
}

function normalizeCommandEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const command = entry.id || entry.command || entry.name || entry.value;
        const label = entry.label || entry.name || entry.title || command;
        if (!command) return null;
        return { command: String(command), label: String(label || command) };
      }
      if (!entry) return null;
      return { command: String(entry), label: String(entry) };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function renderCommandItems(commands, disabledSet) {
  if (!commands.length) {
    return '<p class="empty-state">No commands to manage.</p>';
  }


  const formatLabel = (label) =>
    label
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  return commands
    .map(({ command, label }) => {
      const slug = command.trim();
      if (!slug) return "";
      const friendly = label || slug;
      const isDisabled = disabledSet.has(slug);
      return `<div class="command-item"><div class="command-info"><span class="command-name">${escapeHtml(
        friendly
      )}</span><span class="command-slug">${escapeHtml(slug)}</span></div><div class="config-toggle"><label class="switch"><input type="checkbox" data-command="${escapeHtml(
        slug
      )}" ${isDisabled ? "" : "checked"}><span class="slider"></span></label></div></div>`;
    })
    .join("");
}


function renderCommandSection(guildId, disabled) {
  const disabledList = Array.isArray(disabled?.disabled) ? disabled.disabled.map((value) => String(value)) : [];
  const availableRaw = Array.isArray(disabled?.available) ? disabled.available : [];
  const baseCommands = normalizeCommandEntries(availableRaw);
  const commands = baseCommands;

  if (!commands.length) {
    return `<section class="section" id="commands-section" style="display:none;">
      <h2 class="section-title">Command Access</h2>
      <div class="card command-card">
        <p class="section-description">We could not load commands for this guild. Try refreshing or re-linking your session.</p>
      </div>
    </section>`;
  }

  const disabledSet = new Set(disabledList);
  const payload = escapeHtml(JSON.stringify({ commands: baseCommands, disabled: disabledList }));

  let html = `<section class="section" id="commands-section" style="display:none;" data-command-payload="${payload}">`;
  html += '<h2 class="section-title">Command Access</h2>';
  html += '<div class="card command-card">';
  html +=
    '<p class="section-description">Disable commands across your entire guild. Turn a toggle off to block it everywhere.</p>';
  html += '<div class="command-grid">';
  html += renderCommandItems(commands, disabledSet);
  html += '</div></div></section>';
  return html;
}

function formatShopField(value, fallback = "—") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function renderShopItemCard(guildId, item, roleMap) {
  const safeGuildId = escapeHtml(String(guildId));
  const safeId = escapeHtml(String(item.id));
  const roleName = roleMap.get(String(item.role_id)) || "Unknown Role";
  const active = Boolean(item.active ?? item.is_active);
  const stock = item.stock === null || item.stock === undefined ? "∞" : String(item.stock);
  const maxPerUser = item.max_per_user === null || item.max_per_user === undefined ? "∞" : String(item.max_per_user);
  const expiresAfter = item.expires_after ? `${item.expires_after} min` : "Never";
  const cooldown = item.cooldown ? `${item.cooldown} min` : "None";
  const giftable = item.giftable ? "Yes" : "No";
  const description = item.description ? `<div class="shop-item-card__description">${escapeHtml(item.description)}</div>` : "";

  return `<div class="shop-item-card" data-item-id="${safeId}">
    <div class="shop-item-card__header">
      <div>
        <div class="shop-item-card__headline">${escapeHtml(item.name || "Untitled Item")}</div>
        <div class="shop-item-card__role">${escapeHtml(roleName)}</div>
      </div>
      <div class="shop-item-card__price">
        <span>${escapeHtml(String(item.price ?? 0))}</span>
        <small>credits</small>
      </div>
      <span class="status-chip ${active ? "status-chip--success" : "status-chip--muted"}">${active ? "Active" : "Hidden"}</span>
    </div>
    <div class="shop-item-card__meta">
      <div><span>Stock</span>${escapeHtml(stock)}</div>
      <div><span>Per User</span>${escapeHtml(maxPerUser)}</div>
      <div><span>Cooldown</span>${escapeHtml(cooldown)}</div>
      <div><span>Expires After</span>${escapeHtml(expiresAfter)}</div>
      <div><span>Giftable</span>${escapeHtml(giftable)}</div>
    </div>
    ${description}
    <div class="shop-item-card__actions">
      <form action="/dashboard/${safeGuildId}/shop/${safeId}/update" method="POST" data-shop-form="update" data-item-id="${safeId}">
        <div class="form-row form-row--split">
          <input name="name" value="${escapeHtml(item.name || "")}" class="form-control" placeholder="Name">
          <input name="price" value="${escapeHtml(String(item.price ?? ""))}" type="number" step="any" class="form-control" placeholder="Price">
        </div>
        <div class="form-row form-row--split">
          <input name="stock" value="${item.stock ?? ""}" type="number" min="0" class="form-control" placeholder="Stock (blank = ∞)">
          <input name="max_per_user" value="${item.max_per_user ?? ""}" type="number" min="0" class="form-control" placeholder="Per user limit">
          <input name="cooldown" value="${item.cooldown ?? ""}" type="number" min="0" class="form-control" placeholder="Cooldown (min)">
          <input name="expires_after" value="${item.expires_after ?? ""}" type="number" min="0" class="form-control" placeholder="Expires after (min)">
        </div>
        <div class="form-row">
          <textarea name="description" class="form-control form-control--textarea" placeholder="Description">${escapeHtml(item.description || "")}</textarea>
        </div>
        <div class="form-row form-row--inline">
          <input type="hidden" name="giftable" value="off">
          <label class="checkbox-input"><input type="checkbox" name="giftable" value="on" ${item.giftable ? "checked" : ""}>Giftable</label>
        </div>
        <div class="form-actions">
          <button type="submit" class="ghost-btn">Save Changes</button>
        </div>
      </form>
      <div class="action-buttons">
        <form action="/dashboard/${safeGuildId}/shop/${safeId}/toggle" method="POST" data-shop-form="toggle" data-item-id="${safeId}">
          <button type="submit" class="secondary-btn">${active ? "Disable" : "Enable"}</button>
        </form>
        <form action="/dashboard/${safeGuildId}/shop/${safeId}/delete" method="POST" data-shop-form="delete" data-item-id="${safeId}">
          <button type="submit" class="danger-btn">Delete</button>
        </form>
      </div>
    </div>
  </div>`;
}

function renderShopItemsHtml(guildId, items = [], roles = {}) {
  const roleMap = new Map((roles.roles || []).map((role) => [String(role.id), role.name || "Unknown Role"]));
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="empty-state">No items yet. Start by adding your first reward above.</p>';
  }
  const cards = items.map((item) => renderShopItemCard(guildId, item, roleMap)).join("");
  return `<div class="shop-items-grid">${cards}</div>`;
}

function renderShopSection(guildId, shop, roles) {
  const safeGuildId = escapeHtml(String(guildId));
  const roleOptions = escapeHtml(JSON.stringify((roles.roles || []).map((role) => ({ id: String(role.id), name: role.name || '' }))));
  let html = `<section class="section" id="shop-section" style="display:none;" data-roles="${roleOptions}">`;
  html += '<h2 class="section-title">Community Shop</h2>';
  html += `<div class="card shop-card">`;
  html += `<form action="/dashboard/${safeGuildId}/shop" method="POST" class="stack-form shop-form" data-shop-form="create">`;
  html += `<div class="form-row">
    <label class="field-label">Role</label>
    <select name="role_id" required class="form-control">
      ${(roles.roles || []).map((r) => `<option value="${escapeHtml(String(r.id))}">${escapeHtml(r.name || '')}</option>`).join('')}
    </select>
  </div>`;
  html += `<div class="form-row">
    <label class="field-label">Name</label>
    <input name="name" required class="form-control" placeholder="Item name">
  </div>`;
  html += `<div class="form-row">
    <label class="field-label">Price</label>
    <input name="price" type="number" step="any" required class="form-control" placeholder="0">
  </div>`;
  html += `<div class="form-row">
    <label class="field-label">Description</label>
    <textarea name="description" class="form-control form-control--textarea" placeholder="Optional description shown to customers"></textarea>
  </div>`;
  html += `<div class="form-row form-row--split">
    <div>
      <label class="field-label">Stock</label>
      <input name="stock" type="number" min="0" class="form-control" placeholder="Unlimited">
    </div>
    <div>
      <label class="field-label">Per User Limit</label>
      <input name="max_per_user" type="number" min="0" class="form-control" placeholder="Unlimited">
    </div>
    <div>
      <label class="field-label">Cooldown (min)</label>
      <input name="cooldown" type="number" min="0" class="form-control" placeholder="0">
    </div>
    <div>
      <label class="field-label">Expires After (min)</label>
      <input name="expires_after" type="number" min="0" class="form-control" placeholder="Never">
    </div>
  </div>`;
  html += `<div class="form-row form-row--inline">
    <div>
      <input type="hidden" name="giftable" value="off">
      <label class="checkbox-input"><input type="checkbox" name="giftable" value="on" checked>Giftable</label>
    </div>
    <div>
      <input type="hidden" name="is_active" value="off">
      <label class="checkbox-input"><input type="checkbox" name="is_active" value="on" checked>Active</label>
    </div>
  </div>`;
  html += `<div class="form-actions">
    <button type="submit" class="primary-btn">Add Item</button>
  </div>`;
  html += `</form>`;
  html += `<div class="shop-items" data-shop-items>`;
  html += renderShopItemsHtml(guildId, shop.items || [], roles);
  html += `</div>`;
  html += `</div></section>`;
  return html;
}

function formatMemberTimestamp(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function roleColorHex(value) {
  const numeric = Number(value);
  if (!numeric || numeric <= 0) return "#99aab5";
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(numeric)));
  return `#${clamped.toString(16).padStart(6, "0")}`;
}

function renderMemberCard(member) {
  if (!member) return "";
  const primaryName = member.display_name || member.global_name || member.username || "Member";
  const discriminator =
    member.discriminator && member.discriminator !== "0" ? `#${member.discriminator}` : "";
  const tagLine = member.username ? `${member.username}${discriminator}` : "";
  const avatar = member.avatar_url
    ? `<img src="${escapeHtml(member.avatar_url)}" alt="${escapeHtml(primaryName)}" class="member-avatar">`
    : `<div class="member-avatar member-avatar--fallback">${escapeHtml(primaryName.charAt(0).toUpperCase())}</div>`;
  const roles = Array.isArray(member.roles) ? member.roles : [];
  const highest =
    member.highest_role_id && roles.find((role) => String(role.id) === String(member.highest_role_id));
  const stats = [
    { label: "User ID", value: member.id || "Unknown" },
    { label: "Account Created", value: formatMemberTimestamp(member.created_at) },
    { label: "Joined Server", value: formatMemberTimestamp(member.joined_at) },
    { label: "Highest Role", value: highest?.name || "None" },
  ];
  if (member.communication_disabled_until) {
    stats.push({
      label: "Timeout Ends",
      value: formatMemberTimestamp(member.communication_disabled_until),
    });
  }
  const badges = [];
  if (member.bot) badges.push("Bot Account");
  if (member.pending) badges.push("Pending Approval");
  const badgeHtml = badges.length
    ? `<div class="member-badges">${badges.map((badge) => `<span class="member-badge">${escapeHtml(badge)}</span>`).join("")}</div>`
    : "";
  const rolesHtml = roles.length
    ? roles
        .map(
          (role) =>
            `<span class="role-chip" style="--role-color:${roleColorHex(role.color)}">${escapeHtml(role.name)}</span>`
        )
        .join("")
    : '<span class="empty-state">No roles assigned</span>';
  const statsHtml = stats
    .map(
      (stat) =>
        `<div class="member-stat"><span class="member-stat__label">${escapeHtml(
          stat.label
        )}</span><span class="member-stat__value">${escapeHtml(String(stat.value))}</span></div>`
    )
    .join("");

  return `<div class="member-card">
    <div class="member-card__header">
      ${avatar}
      <div>
        <div class="member-card__name">${escapeHtml(primaryName)}</div>
        <div class="member-card__tag">${escapeHtml(tagLine)}</div>
      </div>
    </div>
    ${badgeHtml}
    <div class="member-card__grid">${statsHtml}</div>
    <div class="member-card__roles">
      <div class="member-card__roles-label">Roles (${roles.length})</div>
      <div class="member-card__roles-list">${rolesHtml}</div>
    </div>
  </div>`;
}

function renderMemberSearchSection(guildId, member = null) {
  const safeGuildId = escapeHtml(String(guildId));
  let resultHtml = '<p class="empty-state">Search by user ID or username to explore member details.</p>';
  if (member) {
    if (member.in_guild && member.member) {
      resultHtml = renderMemberCard(member.member);
    } else {
      resultHtml = '<p class="empty-state">Member not found.</p>';
    }
  }
  let html = `<section class="section" id="members-section" style="display:none;">`;
  html += '<h2 class="section-title">Member Lookup</h2>';
  html += `<div class="card">`;
  html += `<form action="/dashboard/${safeGuildId}/members" method="GET" class="inline-form member-search-form">
    <input name="query" placeholder="ID or username" required class="form-control">
    <button type="submit" class="primary-btn">Search</button>
  </form>`;
  html += `<div class="member-result" id="member-result">${resultHtml}</div>`;
  html += '</div></section>';
  return html;
}


function renderLayout(user, contentHtml, isServerDashboard = false, activeGuildId = null) {
  const av = escapeHtml(avatarUrl(user || {}));
  const userDisplay = user ? `${escapeHtml(user.username || '')}#${escapeHtml(user.discriminator || '')}` : "";
  const addBotUrl = `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(CLIENT_ID || "")}&permissions=8&scope=bot%20applications.commands`;
  const guildAttr = ` data-guild-id="${activeGuildId ? escapeHtml(String(activeGuildId)) : ""}"`;
  const pageClass = `page${isServerDashboard ? " page--with-nav" : ""}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Utilix Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
<style>
* {
  font-family: Arial, sans-serif !important;
}
:root {
  --bg: #050114;
  --bg-alt: #120b2c;
  --fg: #f5f4ff;
  --fg-muted: rgba(245,244,255,0.66);
  --accent: #b266f2;
  --accent2: #6c3ff6;
  --panel: rgba(17,11,35,0.84);
  --panel-alt: rgba(22,15,45,0.76);
  --border: rgba(255,255,255,0.08);
  --border-strong: rgba(255,255,255,0.16);
  --shadow-lg: 0 22px 60px rgba(7,4,25,0.45);
  --shadow-sm: 0 18px 30px rgba(9,5,27,0.32);
  --radius-lg: 18px;
  --radius-md: 12px;
  --radius-sm: 8px;
  --transition: 220ms ease;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  background:
    radial-gradient(circle at 20% 20%, rgba(122,68,212,0.22), transparent 45%),
    radial-gradient(circle at 80% 10%, rgba(178,102,242,0.18), transparent 40%),
    var(--bg);
  color: var(--fg);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow-x: hidden;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background: radial-gradient(circle at 50% 0%, rgba(110,52,220,0.18), transparent 65%);
  pointer-events: none;
  z-index: 0;
}
a { color: inherit; text-decoration: none; transition: color var(--transition), opacity var(--transition); }
a:hover { color: var(--accent); }
button { font-family: inherit; border: none; background: none; color: inherit; cursor: pointer; transition: all var(--transition); }
header {
  position: fixed;
  top: 0; left: 0; right: 0;
  height: 80px;
  padding: 0 2.4rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(8,4,22,0.78);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 12px 45px rgba(5,3,18,0.45);
  z-index: 1200;
}
.header-left { display: flex; align-items: center; gap: 1.8rem; }
.logo-group { display: flex; flex-direction: column; gap: 2px; }
.logo {
  font-size: 1.45rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  background: linear-gradient(90deg, var(--accent), var(--accent2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.logo-tagline {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--fg-muted);
}
.header-nav ul {
  display: flex;
  gap: 1rem;
  list-style: none;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
}
.header-nav a {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.95rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--fg-muted);
}
.header-nav a.active {
  background: linear-gradient(90deg, rgba(178,102,242,0.22), rgba(108,63,246,0.22));
  color: var(--fg);
  box-shadow: 0 12px 30px rgba(108,63,246,0.25);
}
.header-nav a:hover { color: var(--fg); }
.header-right { display: flex; align-items: center; gap: 1rem; }
.discord-btn {
  padding: 0.55rem 1.15rem;
  border-radius: 999px;
  background: linear-gradient(120deg, var(--accent), var(--accent2));
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  box-shadow: 0 12px 38px rgba(108,63,246,0.35);
}
.discord-btn:hover { transform: translateY(-1px); box-shadow: 0 15px 40px rgba(108,63,246,0.4); }
.discord-btn--ghost { background: rgba(255,255,255,0.06); color: var(--fg); box-shadow: none; border: 1px solid rgba(255,255,255,0.08); }
.discord-btn--ghost:hover { background: rgba(255,255,255,0.12); }
.auth-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--border);
}
.auth-wrapper img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.2);
}
.user-display { font-weight: 600; font-size: 0.85rem; }
.logout-btn { color: #ff7b9c; font-size: 0.85rem; font-weight: 600; }
.logout-btn:hover { opacity: 0.8; }
.canvas-wrap { position: fixed; inset: 0; z-index: 0; pointer-events: none; }
canvas#starfield { width: 100%; height: 100%; display: block; }
.page {
  flex: 1;
  width: min(1180px, calc(100% - 48px));
  margin: 0 auto;
  padding: 140px 0 72px;
  display: flex;
  gap: 2.4rem;
  position: relative;
  z-index: 1;
}
.page--with-nav { align-items: flex-start; }
.content-area { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1.75rem; }
.search-wrapper {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  background: var(--panel);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 108px;
  z-index: 50;
  backdrop-filter: blur(18px);
}
.search-icon { font-size: 1.05rem; color: var(--fg-muted); }
#search {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--fg);
  font-size: 0.95rem;
  font-weight: 500;
  outline: none;
}
#search::placeholder { color: var(--fg-muted); }
#clear-search {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255,255,255,0.08);
  color: var(--fg);
  visibility: hidden;
  opacity: 0;
}
#clear-search.is-visible { visibility: visible; opacity: 1; }
#clear-search:hover { background: rgba(255,255,255,0.16); }
.nav-sidebar {
  width: 250px;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  background: var(--panel);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  padding: 1rem;
  box-shadow: var(--shadow-sm);
  position: sticky;
  top: 120px;
}
.nav-sidebar button {
  width: 100%;
  padding: 0.85rem 1rem;
  border-radius: var(--radius-md);
  text-align: left;
  background: rgba(255,255,255,0.04);
  font-weight: 600;
  color: var(--fg-muted);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}
.nav-sidebar button:hover {
  background: linear-gradient(120deg, rgba(178,102,242,0.22), rgba(114,63,246,0.24));
  color: var(--fg);
  transform: translateX(2px);
}
.nav-sidebar button.active {
  background: linear-gradient(120deg, rgba(178,102,242,0.3), rgba(108,63,246,0.36));
  color: var(--fg);
  box-shadow: 0 15px 40px rgba(108,63,246,0.35);
}
.section { display: none; animation: fadeInUp 0.6s ease forwards; }
.section:first-of-type { display: block; }
.section-title {
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--fg);
  margin-bottom: 0.9rem;
}
.section-subtitle { font-size: 1.05rem; font-weight: 600; color: var(--fg); margin: 2rem 0 0.75rem; }
.card {
  background: var(--panel);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  padding: 1.75rem;
  box-shadow: var(--shadow-sm);
  backdrop-filter: blur(12px);
}
.stack-form { display: flex; flex-direction: column; gap: 1rem; }
.form-row--inline { display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; }
.form-row--split { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.85rem; }
.checkbox-input {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 600;
  color: var(--fg);
}
.form-row { display: flex; flex-direction: column; gap: 0.35rem; }
.field-label { font-size: 0.78rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-muted); font-weight: 600; }
.form-actions { display: flex; justify-content: flex-end; }
.shop-items-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  margin-top: 1.2rem;
}
.shop-item-card {
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--radius-lg);
  padding: 1.2rem;
  background: rgba(255,255,255,0.02);
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
}
.shop-item-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.shop-item-card__headline {
  font-weight: 700;
  font-size: 1.05rem;
  color: var(--fg);
}
.shop-item-card__role { color: var(--fg-muted); font-size: 0.85rem; }
.shop-item-card__price {
  text-align: right;
  margin-right: 0.5rem;
}
.shop-item-card__price span {
  display: block;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--fg);
}
.shop-item-card__price small {
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  color: var(--fg-muted);
}
.shop-item-card__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.6rem;
  font-size: 0.85rem;
}
.shop-item-card__meta span { color: var(--fg-muted); font-size: 0.75rem; letter-spacing: 0.1em; text-transform: uppercase; display: block; margin-bottom: 0.2rem; }
.shop-item-card__description {
  font-size: 0.9rem;
  color: var(--fg);
  background: rgba(255,255,255,0.03);
  border-radius: var(--radius-md);
  padding: 0.75rem;
}
.shop-item-card__actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.shop-item-card form { width: 100%; }

.member-search-form { gap: 0.75rem; flex-wrap: nowrap; }
.member-search-form .form-control { flex: 1; }
h1 { font-size: 1.9rem; font-weight: 700; letter-spacing: 0.02em; color: var(--fg); }
h1 + .servers { margin-top: 1.2rem; }
p { line-height: 1.6; color: var(--fg-muted); }
.command-card { display: flex; flex-direction: column; gap: 1.25rem; }
.section-description { color: var(--fg-muted); font-size: 0.9rem; line-height: 1.6; }
.command-grid { display: grid; gap: 0.85rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.command-item { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1rem; border-radius: var(--radius-md); background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.04); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02); transition: transform var(--transition), border-color var(--transition), box-shadow var(--transition); }
.command-item:hover { border-color: rgba(178,102,242,0.35); box-shadow: 0 18px 32px rgba(108,63,246,0.18); transform: translateY(-2px); }
.command-info { display: flex; flex-direction: column; gap: 0.25rem; }
.command-name {
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--fg);
  font-variant-ligatures: none;
  text-transform: none;
}
.command-slug {
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  color: var(--fg-muted);
  font-family: "JetBrains Mono","Fira Code",monospace;
  font-variant-ligatures: none;
  text-transform: none;
  white-space: nowrap;
}
.settings-card { display: grid; gap: 1rem; }
.config-item {
  display: flex;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 1.1rem 1.25rem;
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.04);
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
  animation: fadeInUp 0.45s ease both;
  animation-delay: calc(var(--i, 0) * 40ms);
}
.config-item:hover {
  transform: translateY(-2px);
  border-color: rgba(178,102,242,0.35);
  box-shadow: 0 18px 40px rgba(108,63,246,0.25);
}
.config-label {
  flex: 0 0 220px;
  font-weight: 600;
  color: var(--fg);
  letter-spacing: 0.02em;
  line-height: 1.4;
}
.config-toggle { display: flex; align-items: center; justify-content: flex-end; flex: 1; }
.config-form { flex: 1; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; justify-content: flex-end; }
.config-form > .form-control,
.config-form > .tag-input-wrapper,
.config-form > textarea,
.config-form > select { flex: 1 1 260px; }
.save-btn { flex-shrink: 0; }
.form-control {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: var(--fg);
  font-size: 0.95rem;
  transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
}
.form-control:focus {
  border-color: rgba(178,102,242,0.55);
  box-shadow: 0 0 0 4px rgba(178,102,242,0.18);
  outline: none;
  background: rgba(255,255,255,0.08);
}
.form-control--textarea { min-height: 120px; resize: vertical; }
.form-control--multi { min-height: 140px; }
.form-control--compact { max-width: 160px; }
.primary-btn {
  padding: 0.6rem 1.2rem;
  border-radius: var(--radius-md);
  background: linear-gradient(120deg, var(--accent), var(--accent2));
  color: #fff;
  font-weight: 600;
  box-shadow: 0 18px 40px rgba(108,63,246,0.32);
}
.primary-btn:hover { transform: translateY(-1px); box-shadow: 0 20px 50px rgba(108,63,246,0.4); }
.ghost-btn {
  padding: 0.55rem 1rem;
  border-radius: var(--radius-md);
  background: rgba(255,255,255,0.08);
  color: var(--fg);
  font-weight: 600;
}
.ghost-btn:hover { background: rgba(255,255,255,0.16); }
.ghost-btn--icon {
  padding: 0;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  font-size: 1.1rem;
}
.secondary-btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  background: rgba(114,63,246,0.18);
  color: var(--fg);
  font-weight: 600;
  border: 1px solid rgba(114,63,246,0.35);
}
.secondary-btn:hover { background: rgba(114,63,246,0.3); }
.danger-btn {
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
  background: rgba(255,93,128,0.16);
  color: #ff809f;
  font-weight: 600;
  border: 1px solid rgba(255,128,159,0.3);
}
.danger-btn:hover { background: rgba(255,93,128,0.26); }
.tag-input-wrapper { position: relative; width: 100%; }
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.45rem;
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  min-height: 45px;
  align-items: center;
}
.tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  background: rgba(178,102,242,0.25);
  color: #fff;
  font-size: 0.85rem;
  box-shadow: inset 0 0 0 1px rgba(178,102,242,0.4);
}
.tag--missing {
  background: rgba(255,128,159,0.25);
  box-shadow: inset 0 0 0 1px rgba(255,128,159,0.5);
}
.tag-text { font-weight: 600; }
.tag-remove {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,0,0,0.2);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
}
.tag-remove:hover { background: rgba(0,0,0,0.35); }
.tag-input { flex: 1; border: none; background: transparent; color: var(--fg); min-width: 120px; outline: none; }
.dropdown {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  left: 0; right: 0;
  background: var(--panel);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  max-height: 180px;
  overflow-y: auto;
  z-index: 30;
}
.dropdown-options div { padding: 0.55rem 0.75rem; cursor: pointer; transition: background var(--transition); }
.dropdown-options div:hover { background: rgba(178,102,242,0.25); }
.option-missing { color: #ff9fbd; font-style: italic; }
.table-wrap { overflow-x: auto; margin-top: 1.2rem; border-radius: var(--radius-lg); border: 1px solid var(--border); }
.data-table { width: 100%; border-collapse: separate; border-spacing: 0; background: rgba(255,255,255,0.02); }
.data-table th, .data-table td { padding: 0.85rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: left; font-size: 0.9rem; }
.data-table thead th { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.12em; color: var(--fg-muted); background: rgba(255,255,255,0.04); }
.data-table tbody tr:hover { background: rgba(178,102,242,0.16); }
.data-table tbody tr:last-child td { border-bottom: none; }
.actions-heading { width: 220px; }
.actions-cell { min-width: 220px; }
.action-buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.inline-form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.empty-state { color: var(--fg-muted); font-size: 0.9rem; margin-top: 1.2rem; }
.code-block {
  background: rgba(0,0,0,0.35);
  border-radius: var(--radius-md);
  padding: 1.1rem;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.85rem;
  overflow: auto;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2);
}
.category-tabs {
  display: inline-flex;
  gap: 0.4rem;
  padding: 0.4rem;
  border-radius: 999px;
  background: rgba(12,8,32,0.85);
  border: 1px solid rgba(255,255,255,0.08);
  position: relative;
  margin-bottom: 1.25rem;
  box-shadow: 0 10px 25px rgba(5,3,18,0.35);
}
.category-tabs button {
  position: relative;
  z-index: 2;
  border-radius: 999px;
  padding: 0.55rem 1.1rem;
  font-weight: 600;
  color: var(--fg-muted);
  transition: color var(--transition);
}
.category-tabs button.active {
  color: #fff;
}
.category-tabs__slider {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: 120px;
  border-radius: 999px;
  background: linear-gradient(120deg, rgba(178,102,242,0.35), rgba(108,63,246,0.6));
  box-shadow: 0 12px 30px rgba(108,63,246,0.35);
  transition: transform 250ms ease, width 250ms ease;
  z-index: 1;
}
.config-category {
  display: none;
}
.config-category.is-active {
  display: block;
  animation: fadeInUp 0.5s ease;
}
.section.search-active .category-tabs {
  opacity: 0.5;
  pointer-events: none;
}
.section.search-active .config-category {
  display: block !important;
}
.member-result { margin-top: 1.2rem; }
.member-card {
  background: rgba(6,4,24,0.9);
  border-radius: var(--radius-lg);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 1.2rem;
  box-shadow: var(--shadow-sm);
}
.member-card__header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}
.member-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid rgba(255,255,255,0.15);
  box-shadow: 0 8px 22px rgba(0,0,0,0.45);
}
.member-avatar--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.08);
  font-size: 1.6rem;
  font-weight: 700;
}
.member-card__name {
  font-size: 1.4rem;
  font-weight: 700;
}
.member-card__tag {
  color: var(--fg-muted);
  font-size: 0.95rem;
}
.member-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.member-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.2);
  font-size: 0.8rem;
  background: rgba(255,255,255,0.05);
}
.member-card__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;
}
.member-stat {
  padding: 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255,255,255,0.07);
  background: rgba(255,255,255,0.03);
  min-height: 72px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.member-stat__label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--fg-muted);
}
.member-stat__value {
  font-weight: 600;
  margin-top: 0.3rem;
}
.member-card__roles {
  margin-top: 0.5rem;
}
.member-card__roles-label {
  text-transform: uppercase;
  font-size: 0.75rem;
  color: var(--fg-muted);
  letter-spacing: 0.14em;
  margin-bottom: 0.4rem;
}
.member-card__roles-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.role-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  background: rgba(255,255,255,0.06);
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.12);
  position: relative;
}
.role-chip::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--role-color, #99aab5);
  border: 1px solid rgba(0,0,0,0.3);
}
.servers {
  display: grid;
  gap: 1.2rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin-top: 1.5rem;
}
.server {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1.1rem;
  border-radius: var(--radius-lg);
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transform: translateY(0);
  transition: transform var(--transition), box-shadow var(--transition), border-color var(--transition);
  animation: fadeInUp 0.5s ease both;
  animation-delay: calc(var(--i, 0) * 60ms);
}
.server::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(178,102,242,0.22), rgba(108,63,246,0.18));
  opacity: 0;
  transition: opacity var(--transition);
}
.server:hover { transform: translateY(-4px); border-color: rgba(178,102,242,0.4); box-shadow: 0 22px 48px rgba(108,63,246,0.3); }
.server:hover::before { opacity: 1; }
.server > a { position: relative; display: flex; align-items: center; gap: 0.9rem; width: 100%; }
.server img, .server-icon {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  box-shadow: 0 12px 24px rgba(0,0,0,0.35);
}
.server-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, var(--accent), var(--accent2));
  font-weight: 700;
  font-size: 1.1rem;
  color: #fff;
}
.server-name { font-size: 0.95rem; font-weight: 600; letter-spacing: 0.03em; color: var(--fg); }
.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.status-chip--success { background: rgba(104,214,154,0.18); color: #7ff7b6; border: 1px solid rgba(104,214,154,0.4); }
.status-chip--muted { background: rgba(255,255,255,0.08); color: var(--fg-muted); border: 1px solid rgba(255,255,255,0.12); }
.popup {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--panel);
  border: 1px solid rgba(178,102,242,0.45);
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  color: var(--fg);
  box-shadow: var(--shadow-sm);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--transition), transform var(--transition);
  z-index: 1500;
}
.popup.show { opacity: 1; transform: translate(-50%, -12px); }
.loading-screen {
  position: fixed;
  inset: 0;
  background: rgba(5,1,20,0.92);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  gap: 1.1rem;
  transition: opacity 0.45s ease;
}
.loading-screen.hide { opacity: 0; pointer-events: none; }
.loading-spinner {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 4px solid rgba(255,255,255,0.12);
  border-top-color: var(--accent);
  animation: spin 1s linear infinite;
}
.loading-copy { font-weight: 600; color: var(--fg); letter-spacing: 0.04em; }
.server-loading {
  position: fixed;
  inset: 0;
  background: rgba(5,1,20,0.92);
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  z-index: 1800;
  transition: opacity 0.45s ease;
}
.server-loading.is-visible { display: flex; }
.server-loading.is-ready { opacity: 0; pointer-events: none; }
.switch { position: relative; width: 54px; height: 28px; display: inline-block; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  inset: 0;
  background: rgba(255,255,255,0.12);
  border-radius: 999px;
  transition: all var(--transition);
}
.slider:before {
  content: "";
  position: absolute;
  width: 22px;
  height: 22px;
  left: 4px;
  top: 3px;
  background: #fff;
  border-radius: 50%;
  transition: all var(--transition);
  box-shadow: 0 10px 20px rgba(0,0,0,0.25);
}
input:checked + .slider { background: linear-gradient(120deg, var(--accent), var(--accent2)); }
input:checked + .slider:before { transform: translateX(24px); }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes fadeInUp { 0% { opacity: 0; transform: translate3d(0,16px,0); } 100% { opacity: 1; transform: translateZ(0); } }
@media (max-width: 1080px) {
  .page { flex-direction: column; width: min(960px, calc(100% - 40px)); padding: 120px 0 64px; }
  .nav-sidebar { position: static; width: 100%; flex-direction: row; flex-wrap: wrap; justify-content: center; }
  .nav-sidebar button { flex: 1 1 220px; text-align: center; }
  .config-item { flex-direction: column; align-items: stretch; }
  .config-label { flex: 1 1 auto; }
  .config-toggle { justify-content: flex-start; }
}
@media (max-width: 720px) {
  header { padding: 0 1.2rem; height: auto; flex-wrap: wrap; gap: 1rem; padding-top: 1rem; padding-bottom: 1rem; }
  .header-left { width: 100%; justify-content: space-between; }
  .header-nav ul { width: 100%; justify-content: space-between; }
  .header-right { width: 100%; justify-content: space-between; flex-wrap: wrap; }
  .page { width: calc(100% - 32px); padding-top: 140px; }
  .search-wrapper { position: static; }
  .config-form { justify-content: flex-start; }
  .form-control--compact { max-width: none; }
  .action-buttons { flex-direction: column; align-items: stretch; }
  .inline-form { width: 100%; }
}
@media (max-width: 520px) {
  .header-nav { display: none; }
  .logo-group { flex-direction: row; align-items: center; gap: 0.5rem; }
  .logo-tagline { letter-spacing: 0.12em; }
  .discord-btn--ghost { flex: 1; text-align: center; }
  .search-wrapper { flex-direction: column; align-items: flex-start; }
  #clear-search { align-self: flex-end; }
  .section-title { font-size: 1.2rem; }
}
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: rgba(178,102,242,0.35); border-radius: 999px; }
::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
</style>
</head>
<body>
  <div id="loading-screen" class="loading-screen">
    <div class="loading-spinner"></div>
    <p class="loading-copy">Loading...</p>
  </div>
  <header>
    <div class="header-left">
      <div class="logo-group">
        <div class="logo">Utilix</div>
        <span class="logo-tagline">Dashboard</span>
      </div>
      <nav class="header-nav" aria-label="Primary navigation">
        <ul>
          <li><a href="/index">Home</a></li>
          <li><a href="/setup">Setup</a></li>
          <li><a href="/faq">FAQ</a></li>
          <li><a href="/changelog">Changelog</a></li>
        </ul>
      </nav>
    </div>
    <div class="header-right">
      <a class="discord-btn discord-btn--ghost" href="/dashboard">Servers</a>
      <a class="discord-btn" href="${escapeHtml(addBotUrl)}" target="_blank" rel="noopener">Add Bot</a>
      <div class="auth-wrapper">
        <img src="${av}" alt="User avatar"/>
        <span class="user-display">${userDisplay}</span>
        <a href="/logout" class="logout-btn">Logout</a>
      </div>
    </div>
  </header>
  <div class="canvas-wrap"><canvas id="starfield"></canvas></div>
<main class="${pageClass}"${guildAttr}>
    ${isServerDashboard ? `<nav class="nav-sidebar" id="nav-sidebar" aria-label="Dashboard navigation"></nav>` : ''}
    <div class="content-area">
      <div class="search-wrapper">
        <span class="search-icon" aria-hidden="true">&#128269;</span>
        <input type="text" id="search" placeholder="${isServerDashboard ? "Search settings..." : "Search servers..."}">
        <button id="clear-search" class="ghost-btn ghost-btn--icon" type="button" aria-label="Clear search">&times;</button>
      </div>
      ${contentHtml}
      <div id="popup" class="popup">Saved</div>
    </div>
  </main>
  ${isServerDashboard ? `<div id="server-loading" class="server-loading" aria-live="polite">
    <div class="loading-spinner"></div>
    <p class="loading-copy">Preparing server dashboard...</p>
  </div>` : ''}

<script>
function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const canvas = document.getElementById('starfield');
const ctx = canvas.getContext('2d');
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize); resize();
let stars = [];
for (let i = 0; i < 220; i++) {
  stars.push({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + 0.5,
    s: Math.random() * 0.6 + 0.1,
    color: "hsla(" + (Math.random() * 360) + ", 70%, 80%, 0.8)"
  });
}
function animate() {
  ctx.fillStyle = 'rgba(5,4,20,0.3)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const star of stars) {
    star.y -= star.s;
    if (star.y < 0) star.y = canvas.height;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    ctx.fillStyle = star.color;
    ctx.fill();
  }
  requestAnimationFrame(animate);
}
animate();

document.addEventListener('DOMContentLoaded', () => {
  const loading = document.getElementById('loading-screen');
  if (loading) {
    setTimeout(() => {
      loading.classList.add('hide');
      setTimeout(() => loading.remove(), 600);
    }, 600);
  }

  document.querySelectorAll('.config-item').forEach((item, index) => item.style.setProperty('--i', index));
  document.querySelectorAll('.servers .server').forEach((item, index) => item.style.setProperty('--i', index));

  document.querySelectorAll('.tag-input-wrapper').forEach((wrapper) => {
    const input = wrapper.querySelector('.tag-input');
    const tagsContainer = wrapper.querySelector('.tags');
    const dropdown = wrapper.querySelector('.dropdown');
    const dropdownOptions = dropdown.querySelector('.dropdown-options');
    const hiddenInput = wrapper.querySelector('input[name="value"]');
    let roles = [];
    try {
      const holder = wrapper.closest('.config-item');
      roles = holder?.dataset.roles ? JSON.parse(holder.dataset.roles) : [];
    } catch (err) {}

    const hideDropdown = () => {
      dropdownOptions.innerHTML = '';
      dropdown.style.display = 'none';
    };

    input.addEventListener('input', () => {
      const query = input.value.toLowerCase();
      if (query.length < 1) {
        hideDropdown();
        return;
      }
      const filtered = roles.filter((role) => role.name.toLowerCase().includes(query));
      dropdownOptions.innerHTML = filtered
        .map((role) => '<div data-id="' + escapeHtml(role.id) + '">' + escapeHtml(role.name) + '</div>')
        .join('');
      dropdown.style.display = filtered.length > 0 ? 'block' : 'none';
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const first = dropdownOptions.querySelector('div');
        if (first) {
          event.preventDefault();
          addTag(first.dataset.id, first.textContent || first.dataset.id);
        }
      } else if (event.key === 'Backspace' && !input.value && tagsContainer.querySelectorAll('.tag').length > 0) {
        tagsContainer.lastElementChild?.remove();
        updateHidden();
      }
    });

    dropdownOptions.addEventListener('click', (event) => {
      const option = event.target.closest('div[data-id]');
      if (!option) return;
      addTag(option.dataset.id, option.textContent || option.dataset.id);
    });

    tagsContainer.addEventListener('click', (event) => {
      if (event.target.classList.contains('tag-remove')) {
        event.target.closest('.tag')?.remove();
        updateHidden();
      }
    });

    function addTag(id, name) {
      const safeId = window.CSS && CSS.escape ? CSS.escape(id) : String(id).replace(/([^a-zA-Z0-9_-])/g, '\$1');
      if (!id || tagsContainer.querySelector('.tag[data-id="' + safeId + '"]')) return;
      const span = document.createElement('span');
      span.className = 'tag';
      span.dataset.id = id;
      span.innerHTML = '<span class="tag-text">' + escapeHtml(name) + '</span><button type="button" class="tag-remove" aria-label="Remove ' + escapeHtml(name) + '">&times;</button>';
      tagsContainer.insertBefore(span, input);
      input.value = '';
      hideDropdown();
      updateHidden();
    }

    function updateHidden() {
      hiddenInput.value = Array.from(tagsContainer.querySelectorAll('.tag')).map((tag) => tag.dataset.id).join(',');
    }

    input.addEventListener('blur', () => setTimeout(hideDropdown, 150));
  });

  const popup = document.getElementById('popup');
  function showPopup(message, isError = false) {
    if (!popup) return;
    popup.textContent = message;
    popup.style.borderColor = isError ? '#ff7b9c' : 'rgba(178,102,242,0.45)';
    popup.style.color = isError ? '#ff7b9c' : 'var(--fg)';
    popup.classList.add('show');
    setTimeout(() => popup.classList.remove('show'), 2600);
  }

  document.querySelectorAll('.config-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const fd = new FormData(form);
      const key = fd.get('key');
      let value = fd.get('value');
      if (!value && fd.getAll('value[]').length) {
        value = fd.getAll('value[]').join(',');
      }
      const guildId = document.querySelector('main.page')?.dataset.guildId;
      if (!guildId) return;
      try {
        const res = await fetch('/dashboard/' + guildId + '/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value })
        });
        const needsDelayMessage = key === 'bot_profile_avatar_url' || key === 'bot_profile_banner_url';
        const successMsg = needsDelayMessage ? 'Saved, changes may take up to 24 hours to apply' : 'Saved!';
        showPopup(res.ok ? successMsg : 'Error saving', !res.ok);
      } catch (err) {
        console.error(err);
        showPopup('Network error', true);
      }
    });
  });

  const guildId = document.querySelector('main.page')?.dataset.guildId;

  document.querySelectorAll('.category-tabs').forEach((tabs) => {
    const buttons = Array.from(tabs.querySelectorAll('button[data-category]'));
    if (!buttons.length) return;
    const section = tabs.closest('.section');
    const categories = section ? Array.from(section.querySelectorAll('.config-category')) : [];
    const slider = tabs.querySelector('.category-tabs__slider');

    const activateCategory = (slug) => {
      categories.forEach((category) => {
        category.classList.toggle('is-active', category.dataset.category === slug);
      });
    };

    const moveSlider = (button) => {
      if (!slider || !button) return;
      const offset = button.offsetLeft;
      slider.style.width = button.offsetWidth + 'px';
      slider.style.transform = 'translateX(' + offset + 'px)';
    };

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        if (button.classList.contains('active')) return;
        buttons.forEach((btn) => btn.classList.toggle('active', btn === button));
        activateCategory(button.dataset.category);
        requestAnimationFrame(() => moveSlider(button));
      });
    });

    const initial = tabs.querySelector('button.active') || buttons[0];
    if (initial) {
      activateCategory(initial.dataset.category);
      requestAnimationFrame(() => moveSlider(initial));
    }
  });

  window.addEventListener('resize', () => {
    document.querySelectorAll('.category-tabs').forEach((tabs) => {
      const active = tabs.querySelector('button.active');
      const slider = tabs.querySelector('.category-tabs__slider');
      if (!active || !slider) return;
      slider.style.width = active.offsetWidth + 'px';
      slider.style.transform = 'translateX(' + active.offsetLeft + 'px)';
    });
  });

  const search = document.getElementById('search');
  const clearSearch = document.getElementById('clear-search');

  const toggleClearButton = (value) => {
    if (!clearSearch) return;
    clearSearch.classList.toggle('is-visible', Boolean(value));
  };

  const applySearch = (query) => {
    const q = (query || '').trim().toLowerCase();
    if (document.querySelector('.servers')) {
      const items = Array.from(document.querySelectorAll('.server'));
      let matches = 0;
      items.forEach((item) => {
        const name = item.querySelector('.server-name')?.textContent.toLowerCase() || '';
        const show = !q || name.includes(q);
        item.style.display = show ? '' : 'none';
        if (show) matches += 1;
      });
      document.querySelector('.servers')?.classList.toggle('has-results', matches > 0);
    } else {
      const categories = Array.from(document.querySelectorAll('.config-category'));
      categories.forEach((category) => {
        let visibleItems = 0;
        category.querySelectorAll('.config-item').forEach((item) => {
          const label = item.querySelector('.config-label')?.textContent.toLowerCase() || '';
          const match = !q || label.includes(q);
          if (q) {
            item.style.display = match ? 'flex' : 'none';
          } else {
            item.style.display = '';
          }
          if (match) visibleItems += 1;
        });
        category.classList.toggle('category-has-results', visibleItems > 0);
      });

      const configSections = Array.from(document.querySelectorAll('.section')).filter((section) =>
        section.querySelector('.config-category')
      );
      configSections.forEach((section) => {
        if (q) {
          section.classList.add('search-active');
          section.querySelectorAll('.config-category').forEach((category) => {
            category.style.display = category.classList.contains('category-has-results') ? 'block' : 'none';
          });
        } else {
          section.classList.remove('search-active');
          section.querySelectorAll('.config-category').forEach((category) => {
            category.style.display = '';
          });
        }
      });

      const commandCards = Array.from(document.querySelectorAll('.command-card'));
      commandCards.forEach((card) => {
        let visibleItems = 0;
        card.querySelectorAll('.command-item').forEach((item) => {
          const name = item.querySelector('.command-name')?.textContent.toLowerCase() || '';
          const slug = item.querySelector('.command-slug')?.textContent.toLowerCase() || '';
          const match = !q || name.includes(q) || slug.includes(q);
          item.style.display = match ? 'flex' : 'none';
          if (match) visibleItems += 1;
        });
        card.style.display = visibleItems > 0 ? '' : 'none';
        const section = card.closest('.section');
        if (section) {
          const title = section.querySelector('.section-title');
          if (title) title.style.display = visibleItems > 0 ? '' : 'none';
        }
      });
    }
  };

  if (search) {
    search.addEventListener('input', () => {
      applySearch(search.value);
      toggleClearButton(search.value);
    });
    search.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        search.value = '';
        applySearch('');
        toggleClearButton('');
      }
    });
  }

  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      if (!search) return;
      search.value = '';
      applySearch('');
      toggleClearButton('');
      search.focus();
    });
  }

  toggleClearButton(search?.value);
  applySearch(search?.value || '');

  const nav = document.getElementById('nav-sidebar');
  if (nav && guildId) {
    const sectionDefinitions = [
      { id: 'settings-section', label: 'Settings' },
      { id: 'moderation-section', label: 'Moderation' },
      { id: 'commands-section', label: 'Commands' },
      { id: 'shop-section', label: 'Shop' },
      { id: 'members-section', label: 'Members' }
    ];
    const availableSections = sectionDefinitions.filter((section) => document.getElementById(section.id));
    if (!availableSections.length) return;
    nav.innerHTML = availableSections
      .map((section, index) => '<button data-section="' + section.id + '"' + (index === 0 ? ' class="active"' : '') + '>' + section.label + '</button>')
      .join('');
    const showSection = (id) => {
      document.querySelectorAll('.section').forEach((section) => {
        section.style.display = section.id === id ? 'block' : 'none';
      });
      nav.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('active', button.dataset.section === id);
      });
    };
    nav.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-section]');
      if (!button) return;
      showSection(button.dataset.section);
    });
    const initialSection = availableSections[0]?.id;
    if (initialSection) {
      showSection(initialSection);
    }
  }

  const shopReady = setupShopSection(guildId, showPopup);
  const commandsReady = setupCommandsSection(guildId, showPopup);
  setupMemberSearch(guildId);

  const readinessTasks = [];
  [shopReady, commandsReady].forEach((task) => {
    if (task && typeof task.then === 'function') {
      readinessTasks.push(task);
    }
  });
  if (!readinessTasks.length) {
    readinessTasks.push(Promise.resolve());
  }

  const serverLoading = document.getElementById('server-loading');
  if (guildId && serverLoading) {
    serverLoading.classList.add('is-visible');
    Promise.all(readinessTasks)
      .catch(() => {})
      .finally(() => {
        serverLoading.classList.add('is-ready');
        setTimeout(() => serverLoading.remove(), 600);
      });
  }
});
function parseJsonResponse(responseText) {
  if (!responseText) return {};
  try {
    return JSON.parse(responseText);
  } catch (err) {
    return {};
  }
}

function renderShopItemCardClient(guildId, item, roleMap) {
  const safeGuildId = escapeHtml(String(guildId));
  const safeId = escapeHtml(String(item.id));
  const roleName = roleMap.get(String(item.role_id)) || 'Unknown Role';
  const active = Boolean(item.active ?? item.is_active);
  const stock = item.stock === null || item.stock === undefined ? '∞' : escapeHtml(String(item.stock));
  const maxPerUser = item.max_per_user === null || item.max_per_user === undefined ? '∞' : escapeHtml(String(item.max_per_user));
  const cooldown = item.cooldown ? escapeHtml(String(item.cooldown)) + ' min' : 'None';
  const expiresAfter = item.expires_after ? escapeHtml(String(item.expires_after)) + ' min' : 'Never';
  const giftable = item.giftable ? 'Yes' : 'No';
  const description = item.description
    ? '<div class="shop-item-card__description">' + escapeHtml(item.description) + '</div>'
    : '';

  return [
    '<div class="shop-item-card" data-item-id="', safeId, '">',
    '<div class="shop-item-card__header"><div>',
    '<div class="shop-item-card__headline">', escapeHtml(item.name || 'Untitled Item'), '</div>',
    '<div class="shop-item-card__role">', escapeHtml(roleName), '</div>',
    '</div>',
    '<div class="shop-item-card__price"><span>', escapeHtml(String(item.price ?? 0)), '</span><small>credits</small></div>',
    '<span class="status-chip ', active ? 'status-chip--success' : 'status-chip--muted', '">', active ? 'Active' : 'Hidden', '</span></div>',
    '<div class="shop-item-card__meta">',
    '<div><span>Stock</span>', stock, '</div>',
    '<div><span>Per User</span>', maxPerUser, '</div>',
    '<div><span>Cooldown</span>', cooldown, '</div>',
    '<div><span>Expires After</span>', expiresAfter, '</div>',
    '<div><span>Giftable</span>', giftable, '</div>',
    '</div>',
    description,
    '<div class="shop-item-card__actions">',
    '<form action="/dashboard/', safeGuildId, '/shop/', safeId, '/update" method="POST" data-shop-form="update" data-item-id="', safeId, '">',
    '<div class="form-row form-row--split">',
    '<input name="name" value="', escapeHtml(item.name || ''), '" class="form-control" placeholder="Name">',
    '<input name="price" value="', escapeHtml(String(item.price ?? '')), '" type="number" step="any" class="form-control" placeholder="Price">',
    '</div>',
    '<div class="form-row form-row--split">',
    '<input name="stock" value="', escapeHtml(String(item.stock ?? '')), '" type="number" min="0" class="form-control" placeholder="Stock">',
    '<input name="max_per_user" value="', escapeHtml(String(item.max_per_user ?? '')), '" type="number" min="0" class="form-control" placeholder="Per user">',
    '<input name="cooldown" value="', escapeHtml(String(item.cooldown ?? '')), '" type="number" min="0" class="form-control" placeholder="Cooldown (min)">',
    '<input name="expires_after" value="', escapeHtml(String(item.expires_after ?? '')), '" type="number" min="0" class="form-control" placeholder="Expires after (min)">',
    '</div>',
    '<div class="form-row">',
    '<textarea name="description" class="form-control form-control--textarea" placeholder="Description">', escapeHtml(item.description || ''), '</textarea>',
    '</div>',
    '<div class="form-row form-row--inline">',
    '<input type="hidden" name="giftable" value="off"><label class="checkbox-input"><input type="checkbox" name="giftable" value="on"', item.giftable ? ' checked' : '', '>Giftable</label>',
    '</div>',
    '<div class="form-actions"><button type="submit" class="ghost-btn">Save Changes</button></div>',
    '</form>',
    '<div class="action-buttons">',
    '<form action="/dashboard/', safeGuildId, '/shop/', safeId, '/toggle" method="POST" data-shop-form="toggle" data-item-id="', safeId, '">',
    '<button type="submit" class="secondary-btn">', active ? 'Disable' : 'Enable', '</button>',
    '</form>',
    '<form action="/dashboard/', safeGuildId, '/shop/', safeId, '/delete" method="POST" data-shop-form="delete" data-item-id="', safeId, '">',
    '<button type="submit" class="danger-btn">Delete</button>',
    '</form>',
    '</div>',
    '</div>',
    '</div>'
  ].join('');
}

function renderShopItemsClient(guildId, items, roleMap) {
  if (!Array.isArray(items) || items.length === 0) {
    return '<p class="empty-state">No items yet. Start by adding your first reward above.</p>';
  }
  const cards = items.map((item) => renderShopItemCardClient(guildId, item, roleMap)).join('');
  return '<div class="shop-items-grid">' + cards + '</div>';
}

function setupShopSection(guildId, notify) {
  const section = document.getElementById('shop-section');
  if (!section || !guildId) return Promise.resolve();
  const notifyUser = typeof notify === 'function' ? notify : () => {};
  const itemsContainer = section.querySelector('[data-shop-items]');
  const roleOptions = (() => {
    try {
      return JSON.parse(section.dataset.roles || '[]');
    } catch (err) {
      return [];
    }
  })();
  const roleMap = new Map(roleOptions.map((role) => [String(role.id), role.name || 'Unknown Role']));

  const renderItems = (items) => {
    if (!itemsContainer) return;
    itemsContainer.innerHTML = renderShopItemsClient(guildId, items, roleMap);
  };

  const parseNumberField = (formData, key) => {
    const raw = formData.get(key);
    if (raw === null || raw === undefined || raw === '') return undefined;
    const num = Number(raw);
    if (Number.isNaN(num)) return undefined;
    return num;
  };

  const parseBooleanField = (formData, key) => {
    const values = formData.getAll(key);
    if (!values.length) return undefined;
    return values[values.length - 1] === 'on';
  };

  const requestShopUpdate = async (form, payload, method = 'POST') => {
    const response = await fetch(form.getAttribute('action'), {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Requested-With': 'fetch',
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    const data = parseJsonResponse(text);
    if (!response.ok || data.success === false) {
      const message = data?.detail || data?.error || 'Shop request failed';
      throw new Error(message);
    }
    if (data.items) {
      renderItems(data.items);
    }
    return data;
  };

  section.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const actionType = form.dataset.shopForm;
    if (!actionType) return;
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      if (actionType === 'create') {
        const formData = new FormData(form);
        const roleId = formData.get('role_id');
        const name = (formData.get('name') || '').toString().trim();
        const priceValue = formData.get('price');
        if (!roleId || !name || !priceValue) throw new Error('All fields are required.');
        const payload = {
          role_id: Number(roleId),
          name,
          price: Number(priceValue),
        };
        const description = (formData.get('description') || '').toString().trim();
        if (description) payload.description = description;
        const stock = parseNumberField(formData, 'stock');
        if (stock !== undefined) payload.stock = stock;
        const maxPerUser = parseNumberField(formData, 'max_per_user');
        if (maxPerUser !== undefined) payload.max_per_user = maxPerUser;
        const cooldown = parseNumberField(formData, 'cooldown');
        if (cooldown !== undefined) payload.cooldown = cooldown;
        const expiresAfter = parseNumberField(formData, 'expires_after');
        if (expiresAfter !== undefined) payload.expires_after = expiresAfter;
        const giftable = parseBooleanField(formData, 'giftable');
        if (giftable !== undefined) payload.giftable = giftable;
        const isActive = parseBooleanField(formData, 'is_active');
        if (isActive !== undefined) payload.is_active = isActive;
        await requestShopUpdate(form, payload, 'POST');
        form.reset();
        notifyUser('Item added to shop');
      } else if (actionType === 'update') {
        const formData = new FormData(form);
        const payload = {};
        const name = (formData.get('name') || '').toString().trim();
        const priceValue = formData.get('price');
        if (name) payload.name = name;
        if (priceValue !== null && priceValue !== undefined && priceValue !== '') {
          payload.price = Number(priceValue);
        }
        const stock = parseNumberField(formData, 'stock');
        if (stock !== undefined) payload.stock = stock;
        const maxPerUser = parseNumberField(formData, 'max_per_user');
        if (maxPerUser !== undefined) payload.max_per_user = maxPerUser;
        const cooldown = parseNumberField(formData, 'cooldown');
        if (cooldown !== undefined) payload.cooldown = cooldown;
        const expiresAfter = parseNumberField(formData, 'expires_after');
        if (expiresAfter !== undefined) payload.expires_after = expiresAfter;
        const description = formData.get('description');
        if (description !== null && description !== undefined) {
          payload.description = description.toString();
        }
        const giftable = parseBooleanField(formData, 'giftable');
        if (giftable !== undefined) payload.giftable = giftable;
        await requestShopUpdate(form, payload, 'POST');
        notifyUser('Shop item updated');
      } else if (actionType === 'toggle') {
        await requestShopUpdate(form, {}, 'POST');
        notifyUser('Shop item toggled');
      } else if (actionType === 'delete') {
        if (!window.confirm('Delete this shop item?')) return;
        await requestShopUpdate(form, {}, 'POST');
        notifyUser('Shop item deleted');
      }
    } catch (err) {
      console.error(err);
      notifyUser(err.message || 'Shop update failed', true);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
  return Promise.resolve();
}

function normalizeCommandEntriesClient(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (entry && typeof entry === 'object') {
        const command = entry.id || entry.command || entry.name || entry.value;
        const label = entry.label || entry.name || entry.title || command;
        if (!command) return null;
        return { command: String(command), label: String(label || command) };
      }
      if (!entry) return null;
      return { command: String(entry), label: String(entry) };
    })
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label));
}

function renderCommandItemsClient(commands, disabledSet) {
  if (!commands.length) {
    return '<p class="empty-state">No commands to manage.</p>';
  }

  const formatLabel = (label) =>
    label
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());

  return commands
    .map(({ command, label }) => {
      const slug = command.trim();
      if (!slug) return '';
      const friendly = label || slug;
      const isDisabled = disabledSet.has(slug);
      return (
        '<div class="command-item">' +
        '<div class="command-info">' +
        '<span class="command-name">' + escapeHtml(friendly) + '</span>' +
        '<span class="command-slug">' + escapeHtml(slug) + '</span>' +
        '</div>' +
        '<div class="config-toggle">' +
        '<label class="switch">' +
        '<input type="checkbox" data-command="' + escapeHtml(slug) + '" ' + (isDisabled ? '' : 'checked') + '>' +
        '<span class="slider"></span>' +
        '</label>' +
        '</div>' +
        '</div>'
      );
    })
    .join('');
}


function setupCommandsSection(guildId, notify) {
  const section = document.getElementById('commands-section');
  if (!section || !guildId) return null;
  const grid = section.querySelector('.command-grid');
  if (!grid) return null;
  const notifyUser = typeof notify === 'function' ? notify : () => {};
  const initialPayload = (() => {
    try {
      return JSON.parse(section.dataset.commandPayload || '{}');
    } catch (err) {
      return {};
    }
  })();
  let commands = normalizeCommandEntriesClient(initialPayload.commands || []);
  let disabled = Array.isArray(initialPayload.disabled) ? initialPayload.disabled.map((value) => String(value)) : [];

  const render = () => {
    const disabledSet = new Set(disabled);
    grid.innerHTML = renderCommandItemsClient(commands, disabledSet);
  };

  const refreshFromApi = async () => {
    try {
      const response = await fetch('/dashboard/' + guildId + '/disabled', {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'fetch',
        },
        credentials: 'same-origin',
      });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (!response.ok) throw new Error(data?.detail || data?.error || 'Unable to load commands');
      if (Array.isArray(data.available)) {
        commands = normalizeCommandEntriesClient(data.available);
      }
      if (Array.isArray(data.disabled)) {
        disabled = data.disabled.map((value) => String(value));
      }
      render();
      return true;
    } catch (err) {
      console.error('Unable to refresh commands', err);
      return false;
    }
  };

  section.addEventListener('change', async (event) => {
    const checkbox = event.target.closest('input[data-command]');
    if (!checkbox) return;
    const cmd = checkbox.dataset.command;
    const disable = !checkbox.checked;
    try {
      const response = await fetch('/dashboard/' + guildId + '/disabled/' + (disable ? 'disable' : 'enable'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commands: [cmd] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.success === false) {
        checkbox.checked = !disable;
        notifyUser(data?.detail || data?.error || 'Unable to update command', true);
        return;
      }
      if (Array.isArray(data.disabled)) {
        disabled = data.disabled.map((value) => String(value));
      } else {
        if (disable && !disabled.includes(cmd)) disabled.push(cmd);
        if (!disable) disabled = disabled.filter((value) => value !== cmd);
      }
      notifyUser((disable ? 'Disabled: ' : 'Enabled: ') + cmd);
    } catch (err) {
      console.error(err);
      checkbox.checked = !disable;
      notifyUser('Network error', true);
    }
  });

  render();
  return refreshFromApi();
}

function formatMemberTimestampClient(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
  try {
    return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return date.toISOString();
  }
}

function roleColorHexClient(value) {
  const numeric = Number(value);
  if (!numeric || numeric <= 0) return '#99aab5';
  const clamped = Math.max(0, Math.min(0xffffff, Math.floor(numeric)));
  return '#' + clamped.toString(16).padStart(6, '0');
}

function renderMemberCardClient(member) {
  if (!member) return '';
  const primaryName = member.display_name || member.global_name || member.username || 'Member';
  const discriminator = member.discriminator && member.discriminator !== '0' ? '#' + member.discriminator : '';
  const tagLine = member.username ? escapeHtml(member.username + discriminator) : '';
  const avatar = member.avatar_url
    ? '<img src="' + escapeHtml(member.avatar_url) + '" alt="' + escapeHtml(primaryName) + '" class="member-avatar">'
    : '<div class="member-avatar member-avatar--fallback">' + escapeHtml(primaryName.charAt(0).toUpperCase()) + '</div>';
  const roles = Array.isArray(member.roles) ? member.roles : [];
  const highest = member.highest_role_id ? roles.find((role) => String(role.id) === String(member.highest_role_id)) : null;
  const stats = [
    { label: 'User ID', value: member.id || 'Unknown' },
    { label: 'Account Created', value: formatMemberTimestampClient(member.created_at) },
    { label: 'Joined Server', value: formatMemberTimestampClient(member.joined_at) },
    { label: 'Highest Role', value: highest?.name || 'None' },
  ];
  if (member.communication_disabled_until) {
    stats.push({
      label: 'Timeout Ends',
      value: formatMemberTimestampClient(member.communication_disabled_until),
    });
  }
  const badges = [];
  if (member.bot) badges.push('Bot Account');
  if (member.pending) badges.push('Pending Approval');
  const badgeHtml = badges.length
    ? '<div class="member-badges">' + badges.map((badge) => '<span class="member-badge">' + escapeHtml(badge) + '</span>').join('') + '</div>'
    : '';
  const rolesHtml = roles.length
    ? roles
        .map((role) => '<span class="role-chip" style="--role-color:' + roleColorHexClient(role.color) + '">' + escapeHtml(role.name) + '</span>')
        .join('')
    : '<span class="empty-state">No roles assigned</span>';
  const statsHtml = stats
    .map(
      (stat) =>
        '<div class="member-stat"><span class="member-stat__label">' +
        escapeHtml(stat.label) +
        '</span><span class="member-stat__value">' +
        escapeHtml(String(stat.value)) +
        '</span></div>'
    )
    .join('');

  return '<div class="member-card"><div class="member-card__header">' + avatar + '<div><div class="member-card__name">' + escapeHtml(primaryName) + '</div><div class="member-card__tag">' + tagLine + '</div></div></div>' + badgeHtml + '<div class="member-card__grid">' + statsHtml + '</div><div class="member-card__roles"><div class="member-card__roles-label">Roles (' + roles.length + ')</div><div class="member-card__roles-list">' + rolesHtml + '</div></div></div>';
}

function setupMemberSearch(guildId) {
  const form = document.querySelector('.member-search-form');
  if (!form || !guildId) return;
  const resultContainer = document.getElementById('member-result');

  const renderMemberResult = (content) => {
    if (!resultContainer) return;
    resultContainer.innerHTML = content;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const query = (formData.get('query') || '').toString().trim();
    if (!query) {
      renderMemberResult('<p class="empty-state">Enter a user ID or username to search.</p>');
      return;
    }
    renderMemberResult('<p class="empty-state">Searching...</p>');
    try {
      const endpoint = form.getAttribute('action') + '?query=' + encodeURIComponent(query);
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'X-Requested-With': 'fetch',
        },
        credentials: 'same-origin',
      });
      const text = await response.text();
      const data = parseJsonResponse(text);
      if (!response.ok || data.success === false) {
        throw new Error(data?.detail || data?.error || 'Lookup failed');
      }
      if (data.in_guild && data.member) {
        renderMemberResult(renderMemberCardClient(data.member));
      } else {
        const reason = data?.reason ? escapeHtml(data.reason) : 'Member not found.';
        renderMemberResult('<p class="empty-state">' + reason + '</p>');
      }
    } catch (err) {
      console.error(err);
      renderMemberResult('<p class="empty-state">' + escapeHtml(err.message || 'Member lookup failed') + '</p>');
    }
  });
}

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
    const candidateGuilds = guilds.filter((g) => botGuildSet.has(String(g.id)));
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
    return res.redirect("/dashboard");
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
  const candidateGuilds = guilds.filter((g) => botGuildSet.has(String(g.id)));
  const filteredGuilds = candidateGuilds.filter((g) => perms[g.id]?.allowed);
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
// Block check 2
  if (DASHBOARD_LOCKED_TO.length > 0 && 
      !DASHBOARD_LOCKED_TO.includes(req.session.user.id)) {
    return res.send(renderLayout(
      req.session.user,
      `<div class="card" style="max-width:640px; margin: 5rem auto; padding: 2.8rem; text-align: center; border-radius: 16px; background: rgba(30,20,60,0.9); border: 1px solid #444;">
         <h2 style="color: #ff6b6b; margin-bottom: 1.5rem;">Access Restricted</h2>
         <p style="font-size: 1.15rem; line-height: 1.6; margin-bottom: 2rem;">
           The dashboard is currently locked<br>
           to authorized users only.
         </p>
         <div style="background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 12px; font-family: monospace; font-size: 0.95rem; opacity: 0.8;">
           Your Discord ID: ${escapeHtml(req.session.user.id || 'not available')}
         </div>
         <p style="margin-top: 2.5rem; font-size: 0.95rem; color: #aaa;">
           If this is unexpected, contact the bot owner.
         </p>
       </div>`,
      false
    ));
  }

  //  Block Check 2
  const user = req.session.user;
  const jwt = req.session.jwt;
  const guildId = req.params.id;
  const perms = req.session.perms || {};
  let guild = (req.session.guilds || []).find((g) => g.id === guildId);
  if (!guild) {
    return res.send(renderLayout(user, `<div class="card"><h2>No access</h2></div>`, false));
  }
  if (!perms[guildId]?.allowed) {
    return res.send(
      renderLayout(user, `<div class="card"><h2>${escapeHtml(guild.name || '')}</h2><p>No permission</p></div>`, false)
    );
  }
  try {
    const data = await fetchGuildData(guildId, jwt);
    if (data?.unauthorized) {
      req.session.jwt = null;
      return res.redirect("/login");
    }
    let contentHtml = `<h1>${escapeHtml(guild.name || '')}</h1>`;
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, data.disabled, 'settings');
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, data.disabled, 'moderation');
    contentHtml += renderCommandSection(guildId, data.disabled);
    contentHtml += renderShopSection(guildId, data.shop, data.roles);
    contentHtml += renderMemberSearchSection(guildId);
    res.send(renderLayout(user, contentHtml, true, guildId));
  } catch (err) {
    console.error("Error in /dashboard/:id:", err);
    res.send(renderLayout(user, `<div class="card"><h2>Error</h2></div>`, false));
  }
});

app.get("/dashboard/:id/members", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const query = req.query.query;
  const wantsJson = clientWantsJson(req);
  if (!query) {
    if (wantsJson) return res.status(400).json({ success: false, error: "Missing query" });
    return res.redirect(`/dashboard/${guildId}`);
  }
  try {
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const memberRes = await fetch(`${API_BASE}/dashboard/${guildId}/members?query=${encodeURIComponent(query)}`, { headers });
    const memberData = await parseApiResponseBody(memberRes);
    if (wantsJson) {
      const status = memberRes.status || (memberRes.ok ? 200 : 500);
      if (!memberRes.ok) {
        return res.status(status).json({ success: false, error: memberData?.detail || memberData?.error || "Lookup failed" });
      }
      return res.status(status).json(memberData);
    }
    const member = memberRes.ok ? memberData : { success: false };
    const data = await fetchGuildData(guildId, req.session.jwt, { member: member.success ? member : null });
    if (data?.unauthorized) {
      req.session.jwt = null;
      return res.redirect("/login");
    }
    const guild = (req.session.guilds || []).find((g) => g.id === guildId) || {};
    let contentHtml = `<h1>${escapeHtml(guild.name || '')}</h1>`;
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, data.disabled, 'settings');
    contentHtml += renderConfigSections(guildId, data.config, data.roles, data.channels, data.logEvents, data.disabled, 'moderation');
    contentHtml += renderCommandSection(guildId, data.disabled);
    contentHtml += renderShopSection(guildId, data.shop, data.roles);
    contentHtml += renderMemberSearchSection(guildId, data.member);
    res.send(renderLayout(req.session.user, contentHtml, true, guildId));
  } catch (err) {
    console.error("Error in /dashboard/:id/members:", err);
    if (wantsJson) return res.status(500).json({ success: false, error: "Internal error" });
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
  const {
    role_id,
    name,
    price,
    description,
    stock,
    max_per_user,
    cooldown,
    expires_after,
    giftable,
    is_active,
  } = req.body;
  const wantsJson = clientWantsJson(req);
  const toNumber = (value) =>
    value === undefined || value === null || value === "" ? undefined : Number(value);
  const toBoolean = (value) =>
    value === undefined || value === null ? undefined : value === true || value === "true" || value === "on";
  try {
    const payload = {
      role_id: role_id !== undefined ? Number(role_id) : undefined,
      name: typeof name === "string" ? name.trim() : undefined,
      price: toNumber(price),
      description: typeof description === "string" ? description : undefined,
      stock: toNumber(stock),
      max_per_user: toNumber(max_per_user),
      cooldown: toNumber(cooldown),
      expires_after: toNumber(expires_after),
      giftable: toBoolean(giftable),
      is_active: toBoolean(is_active),
    };
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await parseApiResponseBody(apiRes);
    if (apiRes.ok) {
      if (wantsJson) return res.json(data || { success: true });
      return res.redirect(`/dashboard/${guildId}`);
    }
    const message = data?.detail || data?.error || "Error adding item";
    if (wantsJson) return res.status(apiRes.status || 500).json({ success: false, error: message });
    return res.status(apiRes.status || 400).send(message);
  } catch (err) {
    console.error("Error in /dashboard/:id/shop:", err);
    if (wantsJson) return res.status(500).json({ success: false, error: "Internal error" });
    res.status(500).send("Internal error");
  }
});

app.post("/dashboard/:id/shop/:item_id/update", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const itemId = req.params.item_id;
  const { name, price, description, stock, max_per_user, cooldown, expires_after, giftable } = req.body;
  const wantsJson = clientWantsJson(req);
  const toNumber = (value) =>
    value === undefined || value === null || value === "" ? undefined : Number(value);
  const toBoolean = (value) =>
    value === undefined || value === null ? undefined : value === true || value === "true" || value === "on";
  try {
    const payload = {};
    if (typeof name === "string" && name.trim()) payload.name = name.trim();
    const parsedPrice = toNumber(price);
    if (parsedPrice !== undefined) payload.price = parsedPrice;
    const parsedDescription = typeof description === "string" ? description : undefined;
    if (parsedDescription !== undefined) payload.description = parsedDescription;
    const parsedStock = toNumber(stock);
    if (parsedStock !== undefined) payload.stock = parsedStock;
    const parsedPerUser = toNumber(max_per_user);
    if (parsedPerUser !== undefined) payload.max_per_user = parsedPerUser;
    const parsedCooldown = toNumber(cooldown);
    if (parsedCooldown !== undefined) payload.cooldown = parsedCooldown;
    const parsedExpires = toNumber(expires_after);
    if (parsedExpires !== undefined) payload.expires_after = parsedExpires;
    const parsedGiftable = toBoolean(giftable);
    if (parsedGiftable !== undefined) payload.giftable = parsedGiftable;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop/${itemId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(payload),
    });
    const data = await parseApiResponseBody(apiRes);
    if (apiRes.ok) {
      if (wantsJson) return res.json(data || { success: true });
      return res.redirect(`/dashboard/${guildId}`);
    }
    const message = data?.detail || data?.error || "Error updating item";
    if (wantsJson) return res.status(apiRes.status || 500).json({ success: false, error: message });
    return res.status(apiRes.status || 400).send(message);
  } catch (err) {
    console.error("Error in /dashboard/:id/shop/:item_id/update:", err);
    if (wantsJson) return res.status(500).json({ success: false, error: "Internal error" });
    res.status(500).send("Internal error");
  }
});

app.post("/dashboard/:id/shop/:item_id/toggle", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const itemId = req.params.item_id;
  const wantsJson = clientWantsJson(req);
  try {
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop/${itemId}/toggle`, {
      method: "POST",
      headers,
    });
    const data = await parseApiResponseBody(apiRes);
    if (apiRes.ok) {
      if (wantsJson) return res.json(data || { success: true });
      return res.redirect(`/dashboard/${guildId}`);
    }
    const message = data?.detail || data?.error || "Error toggling item";
    if (wantsJson) return res.status(apiRes.status || 500).json({ success: false, error: message });
    return res.status(apiRes.status || 400).send(message);
  } catch (err) {
    console.error("Error in /dashboard/:id/shop/:item_id/toggle:", err);
    if (wantsJson) return res.status(500).json({ success: false, error: "Internal error" });
    res.status(500).send("Internal error");
  }
});

app.post("/dashboard/:id/shop/:item_id/delete", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");
  const guildId = req.params.id;
  const itemId = req.params.item_id;
  const wantsJson = clientWantsJson(req);
  try {
    const headers = { Authorization: `Bearer ${req.session.jwt}` };
    const apiRes = await fetch(`${API_BASE}/dashboard/${guildId}/shop/${itemId}`, {
      method: "DELETE",
      headers,
    });
    const data = await parseApiResponseBody(apiRes);
    if (apiRes.ok) {
      if (wantsJson) return res.json(data || { success: true });
      return res.redirect(`/dashboard/${guildId}`);
    }
    const message = data?.detail || data?.error || "Error deleting item";
    if (wantsJson) return res.status(apiRes.status || 500).json({ success: false, error: message });
    return res.status(apiRes.status || 400).send(message);
  } catch (err) {
    console.error("Error in /dashboard/:id/shop/:item_id/delete:", err);
    if (wantsJson) return res.status(500).json({ success: false, error: "Internal error" });
    res.status(500).send("Internal error");
  }
});




// Transcript route with client-side renderer (safe / minimal server work)
app.get("/t/:guild_id/:uuid", async function (req, res) {
  // small HTML escape helper for server-side strings
  function esc(s) {
    if (s === undefined || s === null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // require login
  if (!req.session || !req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect("/login");
  }

  var user = req.session.user;
  var guildId = req.params.guild_id;
  var uuid = req.params.uuid;
  if (!guildId || !uuid) return res.status(400).send("Missing guild id or ticket uuid");

  // quick guild membership + perms check
  var perms = req.session.perms || {};
  var guild = (req.session.guilds || []).find(function (g) { return g.id === guildId; });
  if (!guild) {
    return res.send(renderLayout(user, '<div class="card"><h2>No access</h2><p>You are not in that server.</p></div>', false));
  }
  if (!perms[guildId] || !perms[guildId].allowed) {
    return res.send(renderLayout(user, '<div class="card"><h2>' + esc(guild.name || "") + '</h2><p>No permission</p></div>', false));
  }

  // ensure server JWT to call API
  var jwt = req.session.jwt;
  if (!jwt) {
    req.session.returnTo = req.originalUrl;
    return res.redirect("/login");
  }

  // call backend API with Authorization: Bearer <jwt>
  var apiStatus = null;
  var apiBodyText = null;
  var ticketData = null;
  try {
    var apiRes = await fetch(API_BASE + "/dashboard/tickets/" + encodeURIComponent(guildId) + "/" + encodeURIComponent(uuid), {
      method: "GET",
      headers: {
        Authorization: "Bearer " + jwt,
        Accept: "application/json"
      }
    });

    apiStatus = apiRes.status;
    apiBodyText = await apiRes.text().catch(function () { return ""; });

    if (apiRes.status === 200) {
      try {
        ticketData = JSON.parse(apiBodyText);
      } catch (err) {
        // fallback to parsed json via fetch.json()
        try {
          ticketData = await apiRes.json();
        } catch (err2) {
          ticketData = null;
        }
      }
    } else if (apiRes.status === 401) {
      // token invalid or expired -> force re-login
      req.session.jwt = null;
      req.session.returnTo = req.originalUrl;
      return res.redirect("/login");
    }
  } catch (err) {
    console.error("Error fetching ticket API:", err);
    apiStatus = 500;
    apiBodyText = String(err);
  }

  var debug = req.query.debug === "1";

  if (!ticketData) {
    // show helpful error page inside the site's layout
    var body = "";
    if (apiStatus === 403) {
      body = '<div class="card"><h2>Forbidden</h2><p>You do not have permission to view this ticket.</p></div>';
    } else if (apiStatus === 404) {
      body = '<div class="card"><h2>Not found</h2><p>Ticket not found for guild ' + esc(guildId) + ' and uuid ' + esc(uuid) + '.</p></div>';
    } else {
      body = '<div class="card"><h2>Error</h2><p>Unable to fetch ticket (status: ' + esc(apiStatus) + ').</p></div>';
    }
    if (debug) {
      body += '<pre style="white-space:pre-wrap;margin-top:12px;background:#111;padding:12px;border-radius:8px;color:#ddd">API status: ' + esc(apiStatus) + '\nAPI body: ' + esc(apiBodyText) + '</pre>';
    }
    return res.status(apiStatus || 500).send(renderLayout(user, body, false));
  }

  // Normalize messages (the client will render them)
  var parsedMessages = [];
  if (Array.isArray(ticketData.messages)) {
    parsedMessages = ticketData.messages;
  } else if (ticketData.transcript_json) {
    try {
      parsedMessages = JSON.parse(ticketData.transcript_json);
    } catch (err) {
      parsedMessages = [];
    }
  }

  // build a safe payload for embedding in HTML (escape '<' to avoid script injection)
  var ticketForClient = Object.assign({}, ticketData, { messages: parsedMessages });
  var payloadJsonSafe = JSON.stringify(ticketForClient).replace(/</g, "\\u003c");

  // Minimal server work — deliver client renderer that does everything in browser
  var html = '' +
`<div class="app-shell transcript-page">
  <section class="header-card">
    <div class="header-title">Ticket transcript</div>
    <div class="header-meta">
      <div><span class="label">Ticket</span> · <span class="value" id="meta-uuid"></span></div>
      <div><span class="label">Guild</span> · <span class="value" id="meta-guild"></span></div>
      <div><span class="label">Channel</span> · <span class="value" id="meta-channel"></span></div>
      <div><span class="label">Owner</span> · <span class="value" id="meta-owner"></span></div>
      <div><span class="label">Closed at</span> · <span class="value" id="closed-at"></span></div>
    </div>
    <div class="header-pill-row" id="header-pills"></div>
  </section>

  <section class="transcript-shell" aria-label="ticket transcript">
    <div class="chat-pane">
      <div class="chat-header">
        <div class="chat-header-main">
          <span class="chat-header-name">#ticket</span>
          <span class="chat-header-tag" id="meta-channel-tag"></span>
        </div>
        <div class="chat-header-meta" id="message-count"></div>
      </div>

      <div id="chat-scroll" class="chat-scroll" role="log" aria-live="polite">
        <div id="messages-container" class="messages"></div>
        <div id="lazy-sentinel" class="lazy-sentinel"></div>
      </div>
    </div>
  </section>
</div>

<style>
:root{--accent:#5865F2;--muted:#9ca3af;--border:#1e293b;--text:#e5e7eb;--accent-soft:rgba(88,101,242,0.12)}
.transcript-page .app-shell{max-width:1100px;margin:18px auto;padding:18px;color:var(--text)}
.header-card{background:rgba(15,23,42,0.95);border-radius:12px;border:1px solid var(--border);padding:12px}
.header-title{font-size:18px;font-weight:700}
.header-meta{margin-top:8px;color:var(--muted);display:flex;flex-wrap:wrap;gap:8px 18px}
.header-pill-row{margin-top:10px;display:flex;gap:8px;flex-wrap:wrap}
.transcript-shell{margin-top:10px}
.chat-header{padding:12px}
.chat-scroll{height:calc(80vh);padding:12px;overflow:auto;border-radius:10px;background:linear-gradient(180deg, rgba(255,255,255,0.01), transparent 10%)}
.message{display:flex;gap:12px;padding:8px;border-radius:8px;align-items:flex-start}
.message:hover{background:rgba(255,255,255,0.01)}
.message-avatar{width:48px;flex-shrink:0}
.message-avatar img{width:48px;height:48px;border-radius:999px;object-fit:cover;background:#010115;display:block}
.message-body{flex:1;min-width:0}
.message-header{display:flex;gap:8px;align-items:center;font-size:14px}
.message-author{font-weight:700;color:var(--text)}
.message-author.bot{color:#6ee7b7}
.message-bot-pill{font-size:10px;padding:2px 6px;border-radius:6px;background:var(--accent);color:white;font-weight:700;margin-left:6px}
.message-timestamp{font-size:12px;color:var(--muted);margin-left:6px}
.message-content{margin-top:6px;font-size:15px;color:var(--text);white-space:pre-wrap;word-break:break-word}
.message-embed{margin-top:8px;border-left:4px solid var(--accent-soft);background:rgba(10,12,20,0.4);padding:10px;border-radius:6px}
.embed-title{font-weight:700;margin-bottom:6px}
.embed-description{color:var(--muted);white-space:pre-wrap}
.pill{padding:4px 10px;border-radius:999px;background:rgba(15,23,42,0.85);border:1px solid var(--border);color:var(--muted);font-size:12px}
.pill-strong{color:var(--accent);border-color:var(--accent);background:linear-gradient(90deg, rgba(88,101,242,0.06), rgba(88,101,242,0.02))}
.lazy-sentinel{height:24px}
.empty-state{font-size:13px;color:var(--muted);padding:10px 12px 14px}
@media (max-width:820px){.message-avatar img{width:40px;height:40px}.chat-scroll{height:70vh;padding:10px}}
</style>

<script>
/* Client-side renderer — defensive and lazy-loaded */
(function(){
  try {
    window.__TICKET__ = ${payloadJsonSafe};

    var data = window.__TICKET__ || {};
    var messages = Array.isArray(data.messages) ? data.messages : [];
    var META = {
      uuid: data.uuid,
      guild_id: data.guild_id,
      guild_name: data.guild_name,
      channel_id: data.channel_id,
      channel_name: data.channel_name,
      owner_id: data.owner_id,
      owner_name: data.owner_name,
      category_name: data.category_name,
      reason: data.reason,
      closed_at: data.closed_at,
      closed_by: data.closed_by,
      message_count: data.message_count || messages.length,
      unique_authors: (function(arr){ var s = {}; for (var i=0;i<arr.length;i++){ s[arr[i].author_id] = true; } var c=0; for (var k in s) c++; return c; })(messages)
    };

    function escapeHtml(str){
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, function(ch){
        switch(ch){
          case '&': return '&amp;';
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '"': return '&quot;';
          case "'": return '&#39;';
          default: return ch;
        }
      });
    }

    function isBotMessage(msg){
      return !!(msg.is_bot || msg.is_webhook || msg.webhook_id || msg.author_is_bot);
    }

    function avatarFor(msg){
      if (msg.author_avatar_url) return msg.author_avatar_url;
      if (msg.author_avatar) return msg.author_avatar;
      return 'https://cdn.discordapp.com/embed/avatars/0.png';
    }

    function renderEmbed(embed){
      if (!embed || typeof embed !== 'object') return '';
      var title = embed.title ? '<div class="embed-title">'+escapeHtml(embed.title)+'</div>' : '';
      var desc = embed.description ? '<div class="embed-description">'+escapeHtml(embed.description)+'</div>' : '';
      var fieldsHtml = '';
      if (Array.isArray(embed.fields) && embed.fields.length){
        for (var i=0;i<embed.fields.length;i++){
          var f = embed.fields[i];
          fieldsHtml += '<div class="embed-field"><div class="embed-field-name">'+escapeHtml(f.name||'')+'</div><div class="embed-field-value">'+escapeHtml(f.value||'')+'</div></div>';
        }
      }
      var footer = (embed.footer && embed.footer.text) ? '<div class="embed-footer">'+escapeHtml(embed.footer.text)+'</div>' : '';
      return '<div class="message-embed">' + title + desc + fieldsHtml + footer + '</div>';
    }

    // populate header metadata
    try {
      document.getElementById('meta-uuid').textContent = META.uuid || '';
      document.getElementById('meta-guild').textContent = META.guild_name || META.guild_id || '';
      document.getElementById('meta-channel').textContent = META.channel_name || META.channel_id || '';
      document.getElementById('meta-owner').textContent = META.owner_name || META.owner_id || '';
      document.getElementById('meta-channel-tag').textContent = META.channel_name || META.channel_id || '';
      document.getElementById('message-count').textContent = (messages.length || 0) + ' messages in this ticket';
      if (META.closed_at) {
        var closedEl = document.getElementById('closed-at');
        var d = new Date(META.closed_at);
        closedEl.textContent = isNaN(d.getTime()) ? META.closed_at : d.toLocaleString();
      }
      var pills = document.getElementById('header-pills');
      pills.innerHTML = ''
        + '<div class="pill pill-strong">Category: ' + escapeHtml(META.category_name || 'Unknown') + '</div>'
        + '<div class="pill">Closed by: ' + escapeHtml(META.closed_by || 'Unknown') + '</div>'
        + '<div class="pill">Reason: ' + escapeHtml(META.reason || 'n/a') + '</div>'
        + '<div class="pill">Messages: ' + escapeHtml(String(META.message_count || messages.length)) + '</div>'
        + '<div class="pill">Users: ' + escapeHtml(String(META.unique_authors || 0)) + '</div>';
    } catch (err) {
      console.error("Header render error:", err);
    }

    // message rendering (lazy batches)
    var container = document.getElementById('messages-container');
    var sentinel = document.getElementById('lazy-sentinel');
    var BATCH = 40;
    var index = 0;

    function renderMessage(msg){
      var authorName = msg.author_name || msg.author || 'Unknown';
      var avatarUrl = avatarFor(msg);
      var ts = msg.created_at || msg.timestamp || '';

      var wrapper = document.createElement('div');
      wrapper.className = 'message';

      var avatarWrap = document.createElement('div');
      avatarWrap.className = 'message-avatar';
      var im = document.createElement('img');
      im.src = avatarUrl;
      im.alt = authorName + ' avatar';
      im.onerror = function(){ this.onerror=null; this.src='https://cdn.discordapp.com/embed/avatars/0.png'; };
      avatarWrap.appendChild(im);
      wrapper.appendChild(avatarWrap);

      var body = document.createElement('div');
      body.className = 'message-body';

      var header = document.createElement('div');
      header.className = 'message-header';

      var authorEl = document.createElement('span');
      authorEl.className = 'message-author' + (isBotMessage(msg) ? ' bot' : '');
      authorEl.textContent = authorName;
      header.appendChild(authorEl);

      if (isBotMessage(msg)){
        var pill = document.createElement('span');
        pill.className = 'message-bot-pill';
        pill.textContent = 'BOT';
        header.appendChild(pill);
      }

      if (ts){
        var tspan = document.createElement('span');
        tspan.className = 'message-timestamp';
        var d = new Date(ts);
        tspan.textContent = isNaN(d.getTime()) ? (' ' + ts) : (' ' + d.toLocaleString());
        header.appendChild(tspan);
      }

      body.appendChild(header);

      var contentTxt = (msg.content || msg.text || '') + '';
      if (contentTxt){
        var contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = escapeHtml(contentTxt);
        body.appendChild(contentDiv);
      }

      var embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
      for (var eidx=0;eidx<embeds.length;eidx++){
        var h = renderEmbed(embeds[eidx]);
        if (h){
          var tmp = document.createElement('div');
          tmp.innerHTML = h;
          body.appendChild(tmp.firstChild);
        }
      }

      wrapper.appendChild(body);
      return wrapper;
    }

    function renderBatch(){
      if (!container) return;
      var end = Math.min(index + BATCH, messages.length);
      var frag = document.createDocumentFragment();
      for (var i = index; i < end; i++){
        try {
          frag.appendChild(renderMessage(messages[i] || {}));
        } catch (err) {
          console.error("renderMessage error at index", i, err);
        }
      }
      container.appendChild(frag);
      index = end;
      if (index >= messages.length){
        if (sentinel && sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
        if (observer && observer.disconnect) observer.disconnect();
      }
    }

    var observer = new IntersectionObserver(function(entries){
      for (var i=0;i<entries.length;i++){
        if (entries[i].isIntersecting) renderBatch();
      }
    }, { root: document.getElementById('chat-scroll'), rootMargin: '0px 0px 200px 0px', threshold: 0.1 });

    // if no messages, show empty state
    if (!messages || messages.length === 0){
      container.innerHTML = '<div class="empty-state">No messages were stored for this ticket.</div>';
      if (sentinel && sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
    } else {
      observer.observe(sentinel);
      // initial batch render
      renderBatch();
    }

    // accessibility: focus top of chat on load
    try { document.getElementById('chat-scroll').focus(); } catch (e){}

  } catch (err) {
    // show a simple error fallback in-page to avoid blank 502s
    try {
      var container = document.getElementById('messages-container');
      if (container) container.innerHTML = '<div class="empty-state">An error occurred while rendering. Check console for details.</div>';
    } catch (e) {}
    console.error("Ticket renderer error:", err);
  }
})();
</script>`;

  // send the page wrapped in the site's layout (so header/nav remain)
  return res.send(renderLayout(user, html, true, guildId));
});





/* ---------------- Misc ---------------- */
app.get("/logout", (req, res) => req.session.destroy(() => res.redirect("/")));
app.get("/", (req, res) => res.redirect("/dashboard"));
app.get("/me", (req, res) =>
  res.json(req.session.user ? { loggedIn: true, user: req.session.user } : { loggedIn: false })
);

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
