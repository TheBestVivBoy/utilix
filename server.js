// server.js
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const helmet = require("helmet");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(helmet());
app.use(bodyParser.json());

// Use environment variables in production!
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT || 3000;

// In-memory pages map for demo. Replace with DB in prod.
const pagesFile = path.join(__dirname, "pages.json");
let pages = {};

// load pages from file if exists
if (fs.existsSync(pagesFile)) {
  pages = JSON.parse(fs.readFileSync(pagesFile, "utf8"));
} else {
  // initial example page (the page you provided)
  const id = uuidv4();
  pages[id] = {
    id,
    title: "Bot Blacklist Appeal",
    slug: "blacklist-appeal",
    // store the HTML server-side (or store path to a template)
    html: fs.readFileSync(path.join(__dirname, "example_blacklist_appeal.html"), "utf8")
  };
  fs.writeFileSync(pagesFile, JSON.stringify(pages, null, 2));
}

// Session config: 15 minutes (inactivity) -> cookie maxAge
app.use(session({
  name: "utilix.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,                // refresh cookie on each request
  cookie: {
    maxAge: 15 * 60 * 1000,     // 15 minutes
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // require https in production
    sameSite: "lax"
  }
}));

// Demo admin credentials - replace with DB and bcrypt in prod
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "password123"; // store hashed in real app

// helper middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// Login - POST /admin/login
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  // Replace with bcrypt compare against stored hash in real app
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    // regenerate session to prevent fixation
    req.session.regenerate((err) => {
      if (err) return res.status(500).json({ success: false, error: "session error" });
      req.session.isAdmin = true;
      req.session.username = username;
      // optionally a token for further checks
      req.session.adminToken = uuidv4();
      return res.json({ success: true });
    });
  } else {
    return res.json({ success: false });
  }
});

// Logout - POST /admin/logout
app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false });
    res.clearCookie("utilix.sid");
    return res.json({ success: true });
  });
});

// Get pages list (only id + title + slug) - GET /admin/pages
app.get("/admin/pages", requireAdmin, (req, res) => {
  const list = Object.values(pages).map(p => ({ id: p.id, title: p.title, slug: p.slug }));
  res.json({ pages: list });
});

// Get page content by ID - GET /admin/pages/:id/content
// NOTE: Only authenticated admins can request the HTML. The HTML is not exposed to unauthenticated users.
app.get("/admin/pages/:id/content", requireAdmin, (req, res) => {
  const id = req.params.id;
  const p = pages[id];
  if (!p) return res.status(404).json({ error: "not_found" });
  // Return HTML as a string. Optionally sanitize or send as JSON.
  res.json({ id: p.id, title: p.title, html: p.html });
});

// Optional: Serve page publicly via a secure, unguessable URL only if you want
// e.g. GET /p/:id -> if you want to publicly render, consider additional auth or short-lived tokens
app.get("/p/:id", (req, res) => {
  // If you want public pages but avoid guessing:
  // verify id exists and optionally check a token or a published flag.
  const id = req.params.id;
  const p = pages[id];
  if (!p) return res.status(404).send("Not found");
  // render the HTML server-side to avoid exposing filesystem paths; 
  // however HTML will still be visible to the user who visits the public link.
  res.send(p.html);
});

// Add/Update pages - POST /admin/pages (for creating pages)
app.post("/admin/pages", requireAdmin, (req, res) => {
  const { title, slug, html } = req.body;
  if (!title || !html) return res.status(400).json({ error: "missing_fields" });
  const id = uuidv4();
  pages[id] = { id, title, slug: slug || id, html };
  fs.writeFileSync(pagesFile, JSON.stringify(pages, null, 2));
  res.json({ success: true, id });
});

app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
