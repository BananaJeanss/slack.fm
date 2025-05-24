require("dotenv").config();
const axios = require("axios");
const db = require("../../db");
const { WebClient } = require("@slack/web-api");
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

module.exports = (app) => {
  app.command("/song", async ({ ack, respond, command }) => {
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
      "SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?",
      [targetSlackId, command.team_id],
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
              text: `No scrobbles for *${username}*.`,
            });
          }

          const artist = track.artist["#text"];
          const songName = track.name;
          const albumName = track.album["#text"] || "<unknown>";
          const nowPlaying = track["@attr"]?.nowplaying;

          const infoRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(
              artist
            )}&track=${encodeURIComponent(
              songName
            )}&username=${encodeURIComponent(
              username
            )}&api_key=${LASTFM_API_KEY}&format=json`
          );

          const info = infoRes.data.track;
          const listeners = info.listeners;
          const globalPlays = info.playcount;
          const yourPlays = info.userplaycount || 0;
          const summary = info.wiki?.summary
            ? info.wiki.summary
                .replace(/<a href=".*">Read more on Last.fm<\/a>/, "")
                .trim()
            : "No summary available.";
          const cover =
            track.image?.find((i) => i.size === "extralarge")?.["#text"] ||
            info.album?.image?.find((i) => i.size === "extralarge")?.["#text"];

          let summaryText = summary;
          if (summaryText.length > 600) {
            summaryText = summaryText.slice(0, 590) + "…";
          }

          const blocks = [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `${nowPlaying ? "🎧" : "🎵"} *Last played track by* <@${targetSlackId}>`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Track:* ${artist} – *${songName}*\n*Album:* ${albumName}`,
              },
              accessory: cover
                ? { type: "image", image_url: cover, alt_text: songName }
                : undefined,
            },
            { type: "divider" },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Listeners:*\n${listeners}` },
                { type: "mrkdwn", text: `*Global plays:*\n${globalPlays}` },
                { type: "mrkdwn", text: `*<@${targetSlackId}> plays:*\n${yourPlays}` },
              ],
            },
            { type: "divider" },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Summary:*\n${summaryText}`,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "View on Last.fm",
                    emoji: true,
                  },
                  url: info.url,
                  action_id: "view_song_on_lastfm",
                },
              ],
            },
          ];

          await respond({ response_type: "in_channel", blocks });
        } catch (e) {
          console.error("Last.fm error:", e);
          await respond({
            response_type: "ephemeral",
            text: "⚠️ Could not fetch song info.",
          });
        }
      }
    );
  });
};
