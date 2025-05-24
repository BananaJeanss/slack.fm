require("dotenv").config();
const axios = require("axios");
const db = require("../../db");
const { WebClient } = require("@slack/web-api");
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

async function getSpotifyAccessToken() {
  const auth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString("base64");

  const response = await axios.post(
    "https://accounts.spotify.com/api/token",
    new URLSearchParams({ grant_type: "client_credentials" }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );

  return response.data.access_token;
}

module.exports = (app) => {
  app.command("/spotify", async ({ ack, respond, command }) => {
    await ack();

    let input = command.text.trim();
    let targetSlackId = command.user_id;

    if (input) {
      const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

      if (mention) {
        targetSlackId = mention[1];
      } else {
        input = input.replace(/^@/, "");
        try {
          const users = await web.users.list();
          const match = users.members.find(
            (u) =>
              u.name.toLowerCase() === input.toLowerCase() ||
              u.profile.display_name.toLowerCase() === input.toLowerCase()
          );
          if (!match) {
            return respond({
              response_type: "ephemeral",
              text: "⚠️ Could not find that user.",
            });
          }
          targetSlackId = match.id;
        } catch (e) {
          console.error(e);
          return respond({
            response_type: "ephemeral",
            text: "⚠️ Slack API error looking up user.",
          });
        }
      }
    }

    db.get(
      "SELECT lastfm_username FROM user_links WHERE slack_user_id = ?",
      [targetSlackId],
      async (err, row) => {
        if (err) {
          console.error(err);
          return respond({
            response_type: "ephemeral",
            text: "❌ Database error.",
          });
        }
        if (!row) {
          const msg =
            targetSlackId === command.user_id
              ? "⚠️ You haven’t linked your Last.fm profile. Use `/link` first!"
              : "⚠️ That user hasn’t linked Last.fm.";
          return respond({ response_type: "ephemeral", text: msg });
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
              text: `No recent track found for *${username}*.`,
            });
          }

          const artist = track.artist["#text"];
          const title = track.name;

          const token = await getSpotifyAccessToken();

          const searchRes = await axios.get(
            "https://api.spotify.com/v1/search",
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              params: {
                q: `track:${title} artist:${artist}`,
                type: "track",
                limit: 1,
              },
            }
          );

          const items = searchRes.data.tracks.items;
          if (items.length === 0) {
            return respond({
              response_type: "ephemeral",
              text: `⚠️ Could not find *${title}* by *${artist}* on Spotify.`,
            });
          }

          const url = items[0].external_urls.spotify;
          
          // add slack mention before link
            const user = await web.users.info({ user: targetSlackId });
            const mention = `<@${targetSlackId}>`;
            
          await respond({
            response_type: "in_channel",
            text: `<@${targetSlackId}>, here's the Spotify link for *${title}* by *${artist}*:\n ${url}`
          });
        } catch (e) {
          console.error("Error in /spotify:", e.message);
          return respond({
            response_type: "ephemeral",
            text: "⚠️ Something went wrong fetching the Spotify link.",
          });
        }
      }
    );
  });
};
