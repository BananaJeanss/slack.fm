require("dotenv").config();
const axios = require("axios");
const db = require("../../utils/db");
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

module.exports = (app) => {
  app.command("/song", async ({ ack, respond, command }) => {
    await ack();

    const input = command.text.trim();
    const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

    // === Case 1: No input or Slack mention → show user's latest track ===
    if (!input || mention) {
      const targetSlackId = mention ? mention[1] : command.user_id;

      db.get(
        "SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?",
        [targetSlackId, command.team_id],
        async (err, row) => {
          if (err) {
            console.error(err);
            return respond({ response_type: "ephemeral", text: "❌ Database error." });
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
              )}&username=${encodeURIComponent(username)}&api_key=${LASTFM_API_KEY}&format=json`
            );

            const info = infoRes.data.track;
            const listeners = info.listeners;
            const globalPlays = info.playcount;
            const yourPlays = info.userplaycount || 0;
            const summary = info.wiki?.summary
              ? info.wiki.summary
                .replace(/<a href=".*">Read more on Last.fm<\/a>/, "")
                .trim()
                .replace(/\.+$/, '') // Remove all trailing dots
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
                    text: { type: "plain_text", text: "View on Last.fm", emoji: true },
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
    }

    // === Case 2: Treat input as song name → search and return best match ===
    else {
      try {
        const res = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(
            input
          )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
        );

        const track = res.data.results.trackmatches.track[0];
        if (!track) {
          return respond({
            response_type: "ephemeral",
            text: `⚠️ No match found for *${input}*.`,
          });
        }

        const artist = track.artist;
        const songName = track.name;

        const infoRes = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(
            artist
          )}&track=${encodeURIComponent(songName)}&api_key=${LASTFM_API_KEY}&format=json`
        );

        const info = infoRes.data.track;
        const listeners = info.listeners;
        const globalPlays = info.playcount;
        const summary = info.wiki?.summary
          ? info.wiki.summary.replace(/<a href=".*">Read more on Last.fm<\/a>/, "").trim()
          : "No summary available.";
        const cover =
          info.album?.image?.find((i) => i.size === "extralarge")?.["#text"] || null;

        let summaryText = summary;
        if (summaryText.length > 600) {
          summaryText = summaryText.slice(0, 590) + "…";
        }

        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🎶 *Found track:* *${artist} – ${songName}*`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Album:* ${info.album?.title || "<unknown>"}`,
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
                text: { type: "plain_text", text: "View on Last.fm", emoji: true },
                url: info.url,
                action_id: "view_song_on_lastfm",
              },
            ],
          },
        ];

        await respond({ response_type: "in_channel", blocks });
      } catch (e) {
        console.error("Last.fm track search error:", e);
        return respond({
          response_type: "ephemeral",
          text: "⚠️ Could not search for song.",
        });
      }
    }
  });
};
