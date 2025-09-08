const express = require("express");
const session = require("express-session");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.urlencoded({ extended: true }));

// Session setup
app.use(session({
  secret: "super-secret-key",
  resave: false,
  saveUninitialized: false,
}));

// Admin credentials (stored securely)
const ADMIN_USER = "admin";
// Hash the password "test"
const ADMIN_PASS_HASH = bcrypt.hashSync("test", 10);

// Serve the login page
app.get("/", (req, res) => {
  if (req.session.loggedIn) {
    return res.redirect("/admin");
  }
  res.sendFile(__dirname + "/index.html");
});

// Handle login
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USER && await bcrypt.compare(password, ADMIN_PASS_HASH)) {
    req.session.loggedIn = true;
    return res.redirect("/admin");
  }
  res.send("Invalid credentials. <a href='/'>Try again</a>");
});

// Protected admin page
app.get("/admin", (req, res) => {
  if (!req.session.loggedIn) {
    return res.redirect("/");
  }
  res.send("<h1>Welcome, Admin!</h1><p>This is your secret admin page.</p>");
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Start server
app.listen(3000, () => console.log("Server running at http://localhost:3000"));
