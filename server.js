import express from "express";
import session from "express-session";
import path from "path";
import bodyParser from "body-parser";

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.json());
app.use(session({
  secret: "super-secret-key", // change this to something strong
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 15 * 60 * 1000 } // 15 min session timeout
}));

// Static files (so login.html and dashboard.html can be served)
app.use(express.static("public"));

// Fake credentials (replace with DB + bcrypt in production)
const ADMIN_USER = "admin";
const ADMIN_PASS = "password";

// Login API
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;

  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = { role: "admin" };
    return res.json({ success: true, redirect: "/admin/dashboard" });
  }

  res.status(401).json({ success: false });
});

// Middleware to protect dashboard
function requireAuth(req, res, next) {
  if (!req.session?.user) {
    return res.redirect("/admin/login.html"); // go back to login
  }
  next();
}

// Dashboard page (protected)
app.get("/admin/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.resolve("public/dashboard.html"));
});

// Logout route
app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login.html");
  });
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
