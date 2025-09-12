const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // only serve /public

// Session setup
app.use(session({
  secret: "hufjkfjghwer9uwe9yruwer9ye8r7we89rweuyr9", // change this to something random/long
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 15 * 60 * 1000 } // 15 min session timeout
}));

// Dummy users (replace with DB later if needed)
const USERS = {
  admin: "password123",
  webadmin: "password",
  devadmin: "password2"
};

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect("/login.html");
}

// API login endpoint
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (USERS[username] && USERS[username] === password) {
    req.session.user = username;
    return res.json({ success: true });
  }

  res.json({ success: false, message: "Invalid credentials" });
});

// Logout endpoint
app.post("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// Protected route for dashboard
app.get("/admin/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, "private", "dashboard.html"));
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
