const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const md5 = require("md5");
const db = require("../db");
const router = express.Router();

const API_KEY = process.env.LASTFM_API_KEY;
const API_SECRET = process.env.LASTFM_SHARED_SECRET;

router.get("/lastfm/callback", async (req, res) => {
  console.log("Callback received with params:", req.query);
  const { token, slack_user_id, state } = req.query;

  const params = {
    api_key: API_KEY,
    method: "auth.getSession",
    token: token,
  };

  const sigParams = Object.keys(params)
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join("");
  const sigString = sigParams + API_SECRET;
  const api_sig = md5(sigString);

  // Request session key
  const url = `https://ws.audioscrobbler.com/2.0/?method=auth.getSession&api_key=${API_KEY}&token=${token}&api_sig=${api_sig}&format=json`;
  try {
    const response = await axios.get(url);
    const session = response.data.session;
    if (!session) throw new Error("No session key returned");

    // Store session.key and session.name in DB with slack_user_id
    db.run(
      "INSERT OR REPLACE INTO user_links (slack_user_id, lastfm_username, session_key) VALUES (?, ?, ?)",
      [slack_user_id, session.name, session.key]
    );

    res.send("Your last.fm account is now linked! You can close this window.");
  } catch (err) {
    res.status(500).send("Failed to link your last.fm account.");
  }
});

module.exports = router;
