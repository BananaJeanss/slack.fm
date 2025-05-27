require('dotenv').config();
const axios = require('axios');
const db = require('../../utils/db');
const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

module.exports = (app) => {
  app.command('/recent', async ({ ack, respond, command }) => {
    await ack();

    let input = command.text.trim();
    let targetSlackId = command.user_id;

    if (input) {
      const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

      if (mention) {
        targetSlackId = mention[1];
      } else {
        input = input.replace(/^@/, '');
        try {
          const users = await web.users.list();
          const match = users.members.find(
            (u) =>
              u.name.toLowerCase() === input.toLowerCase() ||
              u.profile.display_name.toLowerCase() === input.toLowerCase()
          );
          if (!match) {
            return respond({
              response_type: 'ephemeral',
              text: '⚠️ Could not find that user.',
            });
          }
          targetSlackId = match.id;
        } catch (e) {
          console.error(e);
          return respond({
            response_type: 'ephemeral',
            text: '⚠️ Slack API error looking up user.',
          });
        }
      }
    }

    db.get(
      'SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?',
      [targetSlackId, command.team_id],
      async (err, row) => {
        if (err) {
          console.error(err);
          return respond({
            response_type: 'ephemeral',
            text: '❌ Database error.',
          });
        }
        if (!row) {
          const msg =
            targetSlackId === command.user_id
              ? '⚠️ You haven’t linked your Last.fm profile. Use `/link` first!'
              : '⚠️ That user hasn’t linked Last.fm.';
          return respond({ response_type: 'ephemeral', text: msg });
        }

        const username = row.lastfm_username;

        try {
          const recent = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
              username
            )}&api_key=${LASTFM_API_KEY}&format=json&limit=10`
          );

          const tracks = recent.data.recenttracks.track;
          if (!tracks || tracks.length === 0) {
            return respond({
              response_type: 'ephemeral',
              text: `No recent tracks found for *${username}*.`,
            });
          }

          const blocks = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎧 *5 Recent Tracks by* <@${targetSlackId}>`,
              },
            },
            { type: 'divider' },
          ];

          let count = 0;
          for (const track of tracks) {
            if (count >= 5) break;

            const artist = track.artist['#text'];
            const title = track.name;
            const album = track.album['#text'] || '';
            const timestamp = track.date?.uts
              ? `🕒 ${new Date(track.date.uts * 1000).toUTCString()}`
              : '▶️ *Now Playing*';
            const coverImage = track.image?.[2]?.['#text'];

            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${count + 1}. ${artist} –* ${title} ${
                  album ? `• _${album}_` : ''
                }\n${timestamp}`,
              },
              ...(count === 0 && coverImage
                ? {
                    accessory: {
                      type: 'image',
                      image_url: coverImage,
                      alt_text: title,
                    },
                  }
                : {}),
            });
            count++;
          }

          await respond({ response_type: 'in_channel', blocks });
        } catch (e) {
          console.error('Last.fm error:', e);
          await respond({
            response_type: 'ephemeral',
            text: '⚠️ Could not fetch recent tracks.',
          });
        }
      }
    );
  });
};
