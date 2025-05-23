const crypto = require("crypto");
require("dotenv").config();
const db = require("../../db");
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const CALLBACK_URL = process.env.CALLBACK_URL;

module.exports = (app) => {
  app.command("/link", async ({ ack, respond, command }) => {
    await ack();

    // Check if the user is already linked
    const userLink = await new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM user_links WHERE slack_user_id = ?",
        [command.user_id],
        (err, row) => {
          if (err) {
            console.error("Error fetching user link:", err);
            return reject(err);
          }
          resolve(row);
        }
      );
    });

    const state = crypto.randomBytes(16).toString("hex");
    const queryString = `slack_user_id=${command.user_id}&state=${state}`;
    const fullCallbackUrl = `${CALLBACK_URL}?${queryString}`;

    const authUrl = `https://www.last.fm/api/auth?api_key=${LASTFM_API_KEY}&cb=${encodeURIComponent(
      fullCallbackUrl
    )}`;

    const blocks = [];
    if (userLink) {
        blocks.push({
            type: "section",
            text: {
                type: "mrkdwn",
                text: `You are already linked to Last.fm account: ${userLink.lastfm_username}`,
            },
        });
    }
    
    blocks.push({
        type: "section",
        text: {
            type: "mrkdwn",
            text: `🔗 Click to link your Last.fm account:\n<${authUrl}|Authenticate with Last.fm>`,
        },
    });

    await respond({
        response_type: "ephemeral",
        blocks: blocks,
    });
  });
};
