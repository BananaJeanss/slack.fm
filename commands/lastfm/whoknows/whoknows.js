require("dotenv").config();
const axios = require("axios");
const db = require("../../../db");
const { WebClient } = require("@slack/web-api");
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

module.exports = (app) => {
  app.command("/whoknows", async ({ ack, respond, command }) => {
    await ack();

    let artist = command.text.trim();
    let targetSlackId = command.user_id;

    // If no artist provided, get last played artist for the user
    if (!artist) {
      // Get user's lastfm username
      const row = await new Promise((resolve) =>
        db.get(
          "SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?",
          [targetSlackId, command.team_id],
          (err, row) => resolve(row)
        )
      );
      if (!row) {
        return respond({
          response_type: "ephemeral",
          text: "⚠️ You haven't linked your Last.fm profile. Use `/link` first!",
        });
      }
      const username = row.lastfm_username;
      try {
        const recent = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
            username
          )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
        );
        const track = recent.data.recenttracks.track[0];
        if (!track) {
          return respond({
            response_type: "ephemeral",
            text: "⚠️ No recent tracks found.",
          });
        }
        artist = track.artist["#text"];
      } catch (e) {
        return respond({
          response_type: "ephemeral",
          text: "⚠️ Could not fetch your last played artist.",
        });
      }
    }

    // Get all linked users in this workspace
    db.all(
      "SELECT slack_user_id, lastfm_username FROM user_links WHERE workspace_id = ?",
      [command.team_id],
      async (err, rows) => {
        if (err || !rows || rows.length === 0) {
          return respond({
            response_type: "ephemeral",
            text: "⚠️ No linked users found in this workspace.",
          });
        }

        // Fetch playcount for each user (parallel, but be mindful of rate limits)
        const playcounts = await Promise.all(
          rows.map(async (row) => {
            try {
              const res = await axios.get(
                `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(
                  artist
                )}&username=${encodeURIComponent(
                  row.lastfm_username
                )}&api_key=${LASTFM_API_KEY}&format=json`
              );
              const userplaycount = parseInt(res.data.artist?.stats?.userplaycount || 0);
              return { slack_user_id: row.slack_user_id, userplaycount };
            } catch {
              return { slack_user_id: row.slack_user_id, userplaycount: 0 };
            }
          })
        );

        // Sort by playcount descending
        playcounts.sort((a, b) => b.userplaycount - a.userplaycount);

        // Find the requesting user's rank
        const userIndex = playcounts.findIndex(
          (u) => u.slack_user_id === targetSlackId
        );

        // Prepare leaderboard
        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `:trophy: *Top 10 for* _${artist}_:`,
            },
          },
          { type: "divider" },
        ];

        for (let i = 0; i < Math.min(10, playcounts.length); i++) {
          const user = playcounts[i];
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*${i + 1}. <@${user.slack_user_id}>* — ${user.userplaycount} plays`,
            },
          });
        }

        // If the user isn't in the top 10, show their rank
        if (userIndex >= 10) {
          blocks.push({ type: "divider" });
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `Your rank: *${userIndex + 1}* — ${playcounts[userIndex].userplaycount} plays`,
            },
          });
        }

        await respond({ response_type: "in_channel", blocks });
      }
    );
  });
};