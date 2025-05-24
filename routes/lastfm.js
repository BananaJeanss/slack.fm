const express = require("express");
const axios = require("axios");
const md5 = require("md5");
const db = require("../db");
const router = express.Router();
const path = require("path");

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

  // Check if valid request
  if (!token || !slack_user_id || !state) {
    return res
      .status(400)
      .sendFile(path.join(__dirname, "./views/invalid.html"));
  }

  // Validate state
  db.get(
    "SELECT * FROM link_states WHERE slack_user_id = ? AND state = ?",
    [slack_user_id, state],
    async (err, row) => {
      if (err || !row || Date.now() - row.created_at > 10 * 60 * 1000) {
        return res
          .status(400)
          .sendFile(path.join(__dirname, "./views/invalid.html"));
      }

      // Optionally: delete state after use
      db.run("DELETE FROM link_states WHERE slack_user_id = ? AND state = ?", [
        slack_user_id,
        state,
      ]);

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

        return res
          .status(200)
          .sendFile(path.join(__dirname, "./views/linked.html"));
      } catch (err) {
        return res
          .status(500)
          .sendFile(path.join(__dirname, "./views/error.html"));
      }
    }
  );
});

module.exports = router;
