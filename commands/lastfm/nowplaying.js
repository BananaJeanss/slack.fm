require("dotenv").config();
const axios = require("axios");
const db = require("../../db");

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

module.exports = (app) => {
  app.command("/nowplaying", async ({ ack, respond, command }) => {
    await ack();

    db.get(
      "SELECT lastfm_username FROM user_links WHERE slack_user_id = ?",
      [command.user_id],
      async (err, row) => {
        if (err) {
          await respond({
            response_type: "ephemeral",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: ":x: *Database error.* Please try again later.",
                },
              },
            ],
          });
          return;
        }

        if (!row) {
          await respond({
            response_type: "ephemeral",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "⚠️ You haven't linked your Last.fm account. Use `/link` to connect.",
                },
              },
            ],
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
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `No recent tracks found for *${username}*.`,
                  },
                },
              ],
            });
            return;
          }

          const userTag = `<@${command.user_id}>`;
          const isNowPlaying = track["@attr"]?.nowplaying === "true";
          const artist = track.artist["#text"];
          const song = track.name;
          const album = track.album["#text"];
          const trackUrl = track.url;
          const fallbackAlbumImage = "https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png"
          const albumImage = track.image?.find(
            (img) => img.size === "extralarge"
          )?.["#text"] || fallbackAlbumImage;

          const messageHeader = isNowPlaying
            ? `🎶 ${userTag} is now playing:\n*${song}* by *${artist}*`
            : `📻 ${userTag} last played:\n*${song}* by *${artist}*`;

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
          await respond({
            response_type: "ephemeral",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: ":warning: Failed to fetch now playing track from Last.fm.",
                },
              },
            ],
          });
        }
      }
    );
  });
};
