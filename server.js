require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const path = require("path");
const fs = require("fs");

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

// Load credentials from .env
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI;
const PORT = process.env.PORT || 3000;

// --- LOGIN ROUTE ---
app.get("/login", (req, res) => {
  const authorizeURL = `https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(
    REDIRECT_URI
  )}&scope=identify%20guilds`;
  res.redirect(authorizeURL);
});

// --- CALLBACK ROUTE ---
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  try {
    // Exchange code for access token
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

    // Fetch user info
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userResponse.json();

    // Fetch user guilds
    const guildResponse = await fetch(
      "https://discord.com/api/users/@me/guilds",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    let guilds = await guildResponse.json();
    if (!Array.isArray(guilds)) guilds = [];

    // ---- FILTER SERVERS BOT IS IN ----
    let botGuilds = [];
    try {
      const filePath = path.join(__dirname, "bot_guilds.json");
      botGuilds = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      console.error("Could not read bot_guilds.json:", err.message);
      botGuilds = [];
    }

    const filteredGuilds =
      Array.isArray(botGuilds) && botGuilds.length > 0
        ? guilds.filter((g) => botGuilds.includes(g.id))
        : guilds;

    // Save to session
    req.session.user = userData;
    req.session.guilds = filteredGuilds;

    res.redirect("/dashboard");
  } catch (err) {
    console.error("Callback error:", err);
    res.status(500).send("Internal Server Error");
  }
});

// --- DASHBOARD ROUTE ---
app.get("/dashboard", (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const user = req.session.user;
  const guilds = Array.isArray(req.session.guilds) ? req.session.guilds : [];

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Utilix — Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet" />
  <style>
    :root {
      --bg: #0b0a1e;
      --fg: #f2f2f7;
      --accent: #a64ca6;
      --accent2: #6c34cc;
      --muted: #c0a0ff;
      --card: rgba(20, 10, 40, 0.8);
      --panel: rgba(15, 5, 35, 0.9);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
      background: radial-gradient(circle at 20% 30%, #3b0a5f, #0b0a1e);
      color: var(--fg);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      position: fixed;
      top: 0; left: 0; width: 100%;
      z-index: 1100;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      height: 72px;
      background: rgba(15, 5, 35, 0.6);
    }
    .logo {
      font-weight: 800;
      font-size: 1.25rem;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .auth-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .auth-wrapper img {
      border-radius: 50%;
    }
    .logout-btn {
      font-size: 1.2rem;
      color: #f55;
      text-decoration: none;
      margin-left: 8px;
    }
    main {
      flex: 1;
      padding: 100px 20px 40px;
      max-width: 1200px;
      margin: 0 auto;
    }
    h2 {
      margin-bottom: 1rem;
    }
    .servers {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1.5rem;
    }
    .server {
      background: var(--card);
      border-radius: 14px;
      padding: 1rem;
      text-align: center;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .server:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 24px rgba(0,0,0,0.6);
    }
    .server img, .server-icon {
      width: 80px;
      height: 80px;
      border-radius: 16px;
      margin-bottom: 0.5rem;
    }
    .server-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255,255,255,0.1);
      font-size: 1.5rem;
      font-weight: bold;
    }
    .server-name {
      font-size: 0.95rem;
      color: var(--muted);
    }
    a { color: white; text-decoration: none; }
    canvas#starfield {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <header>
    <div class="logo">Utilix</div>
    <div class="auth-wrapper">
      <img src="https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png" width="32" height="32" />
      <span>${user.username}#${user.discriminator}</span>
      <a href="/logout" class="logout-btn">⎋</a>
    </div>
  </header>

  <main>
    <h2>Your Servers</h2>
    <div class="servers">
      ${
        guilds.length > 0
          ? guilds
              .map(
                (g) => `
          <a class="server" href="/dashboard/${g.id}">
            ${
              g.icon
                ? `<img src="https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png" alt="${g.name}" />`
                : `<div class="server-icon">${g.name[0]}</div>`
            }
            <div class="server-name">${g.name}</div>
          </a>`
              )
              .join("")
          : "<p>No servers available</p>"
      }
    </div>
  </main>

  <canvas id="starfield"></canvas>
  <script>
    const canvas = document.getElementById('starfield');
    const ctx = canvas.getContext('2d');
    let stars = [];

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function createStars() {
      stars = [];
      for(let i=0; i<200; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          radius: Math.random() * 1.5,
          speed: Math.random() * 0.5 + 0.1,
          color: \`hsl(\${Math.random()*360}, 70%, 80%)\`
        });
      }
    }
    function animate() {
      ctx.fillStyle = 'rgba(11, 10, 30, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      stars.forEach(star => {
        star.y -= star.speed;
        if(star.y < 0) star.y = canvas.height;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = star.color;
        ctx.fill();
      });
      requestAnimationFrame(animate);
    }
    createStars();
    animate();
  </script>
</body>
</html>
  `);
});

// --- INDIVIDUAL SERVER DASHBOARD ---
app.get("/dashboard/:id", async (req, res) => {
  if (!req.session.user) return res.redirect("/login");

  const guildId = req.params.id;
  const user = req.session.user;
  const guild = req.session.guilds.find((g) => g.id === guildId);

  if (!guild) return res.send("You don’t have access to this server.");

  try {
    // Check Discord MANAGE_GUILD permission
    const MANAGE_GUILD = 0x20;
    const hasManageGuild =
      (parseInt(guild.permissions) & MANAGE_GUILD) === MANAGE_GUILD;

    // Ask your bot API if user can manage
    const response = await fetch("https://api.utilix.support/checkPerms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: user.id,
        guildId: guild.id,
      }),
    });
    const botCheck = await response.json();

    if (!hasManageGuild || !botCheck.allowed) {
      return res.send(`
        <html>
          <body style="background:#0b0a1e;color:white;font-family:Arial;">
            <h1>${guild.name} Dashboard</h1>
            <p>You don’t have permission to manage this server’s bot dashboard.</p>
            <a href="/dashboard" style="color:#a64ca6;">← Back to servers</a>
          </body>
        </html>
      `);
    }

    // If allowed, show dashboard
    res.send(`
      <html>
        <head><title>${guild.name} Dashboard</title></head>
        <body style="background:#0b0a1e;color:white;font-family:Arial;">
          <h1>${guild.name} Dashboard</h1>
          <p>Welcome ${user.username}#${user.discriminator}, you have permission!</p>
          <p>Server ID: ${guild.id}</p>
          <p>Server Name: ${guild.name}</p>
          <a href="/dashboard" style="color:#a64ca6;">← Back to servers</a>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).send("Error checking permissions");
  }
});

// --- LOGOUT ROUTE ---
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// --- HOME ROUTE ---
app.get("/", (req, res) => {
  if (req.session.user) {
    res.redirect("/dashboard");
  } else {
    res.send(`<a href="/login">Log in with Discord</a>`);
  }
});

// --- USER INFO ROUTE (for frontend header) ---
app.get("/me", (req, res) => {
  if (req.session.user) {
    res.json({
      loggedIn: true,
      user: req.session.user,
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// --- START SERVER ---
app.listen(PORT, () =>
  console.log(`Server running at http://localhost:${PORT}`)
);
