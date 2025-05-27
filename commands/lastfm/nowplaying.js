require("dotenv").config();
const axios = require("axios");
const db = require("../../utils/db");
const { WebClient } = require("@slack/web-api");
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

module.exports = (app) => {
  app.command("/nowplaying", async ({ ack, respond, command }) => {
    await ack();

    let input = command.text.trim();
    let targetSlackId = command.user_id;

    if (input) {
      // If input is a mention like <@U1234|name>, extract user ID
      const mentionMatch = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);
      if (mentionMatch) {
        targetSlackId = mentionMatch[1];
      } else {
        // Fall back to username/display name
        input = input.replace(/^@/, "");
        try {
          const users = await web.users.list();
          const match = users.members.find(
            (user) =>
              user.name.toLowerCase() === input.toLowerCase() ||
              user.profile.display_name.toLowerCase() === input.toLowerCase()
          );

          if (match) {
            targetSlackId = match.id;
          } else {
            return await respond({
              response_type: "ephemeral",
              text: "⚠️ Could not find a Slack user with that username.",
            });
          }
        } catch (e) {
          console.error("Slack API error:", e);
          return await respond({
            response_type: "ephemeral",
            text: ":x: Failed to look up Slack user. Try again later.",
          });
        }
      }
    }

    db.get(
      "SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?",
      [targetSlackId, command.team_id],
      async (err, row) => {
        if (err) {
          await respond({
            response_type: "ephemeral",
            text: ":x: Database error. Please try again later.",
          });
          return;
        }

        if (!row) {
          await respond({
            response_type: "ephemeral",
            text:
              targetSlackId === command.user_id
                ? "⚠️ You haven't linked your Last.fm account. Use `/link` to connect."
                : "⚠️ That user hasn’t linked their Last.fm account.",
          });
          return;
        }

        const username = row.lastfm_username;

        try {
          const url = `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
            username
          )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`;
          const { data } = await axios.get(url);

          const track = data.recenttracks.track[0];
          if (!track) {
            await respond({
              response_type: "ephemeral",
              text: `No recent tracks found for *${username}*.`,
            });
            return;
          }

          const userTag = `<@${targetSlackId}>`;
          const isNowPlaying = track["@attr"]?.nowplaying === "true";
          const artist = track.artist["#text"];
          const song = track.name;
          const album = track.album["#text"];
          const trackUrl = track.url;
          const fallbackAlbumImage =
            "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png";
          const albumImage =
            track.image?.find((img) => img.size === "extralarge")?.["#text"] ||
            fallbackAlbumImage;

          let userPlaycount = null;
          try {
            const infoRes = await axios.get(
              `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(
                artist
              )}&track=${encodeURIComponent(song)}&username=${encodeURIComponent(
                username
              )}&api_key=${LASTFM_API_KEY}&format=json`
            );
            userPlaycount = infoRes.data.track?.userplaycount ?? null;
          } catch (e) {
            console.warn("Could not fetch userplaycount for track:", e.message);
          }

          let messageHeader = isNowPlaying
            ? `🎶 ${userTag} is now playing:\n*${song}* by *${artist}*`
            : `📻 ${userTag} last played:\n*${song}* by *${artist}*`;

          if (userPlaycount !== null) {
            messageHeader += `\n\nScrobbles: ${userPlaycount}`;
          }

          const blocks = [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: messageHeader,
              },
              ...(albumImage && {
                accessory: {
                  type: "image",
                  image_url: albumImage,
                  alt_text: `Album cover for ${album}`,
                },
              }),
            },
          ];

          if (album) {
            blocks.push({
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `_Album: ${album}_`,
                },
              ],
            });
          }

          if (trackUrl) {
            blocks.push({
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "View on Last.fm",
                    emoji: true,
                  },
                  url: trackUrl,
                  action_id: "view_lastfm",
                },
              ],
            });
          }

          await respond({
            response_type: "in_channel",
            blocks,
          });
        } catch (e) {
          console.error("Last.fm fetch error:", e);
          await respond({
            response_type: "ephemeral",
            text: ":warning: Failed to fetch now playing track from Last.fm.",
          });
        }
      }
    );
  });
};
