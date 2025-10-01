const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Your Discord App credentials
const CLIENT_ID = "1392737327125762199";
const CLIENT_SECRET = "IDMN8xnzFh3puoVP7QZLwOGUjDZOb6cm"; // from Discord Developer Portal
const REDIRECT_URI = "https://utilix.support/callback";

// Route: Discord sends user back here after login
app.get("/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("No code provided");

  // Step 1: Exchange code for access token
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
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

  // Step 2: Get user info
  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userData = await userResponse.json();

  // Show user info
  res.send(`Logged in as ${userData.username}#${userData.discriminator} (ID: ${userData.id})`);
});

// Start server
app.listen(3000, () => console.log("Server running at http://localhost:3000"));
