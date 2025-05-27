require('dotenv').config();
const axios = require('axios');
const db = require('../../../utils/db');
const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const getDisplayName = require('../../../utils/getDisplayName');

module.exports = (app) => {
  app.command('/toptracks', async ({ ack, respond, command }) => {
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
          const top = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=${encodeURIComponent(
              username
            )}&api_key=${LASTFM_API_KEY}&format=json&limit=10&period=overall`
          );

          const tracks = top.data.toptracks.track;
          if (!tracks || tracks.length === 0) {
            return respond({
              response_type: 'ephemeral',
              text: `No top tracks found for *${username}*.`,
            });
          }

          const displayName = await getDisplayName(targetSlackId);
          const blocks = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎵 *All-Time Top 10 Tracks for* ${displayName}`,
              },
            },
            { type: 'divider' },
          ];

          tracks.forEach((track, index) => {
            const imageUrl = track.image?.find(
              (img) => img.size === 'extralarge' && img['#text']
            )?.['#text'];
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${index + 1}. ${track.name}* by *${track.artist.name}* – ${track.playcount} plays`,
              },
              ...(index === 0 && imageUrl
                ? {
                    accessory: {
                      type: 'image',
                      image_url: imageUrl,
                      alt_text: track.name,
                    },
                  }
                : {}),
            });
          });

          await respond({ response_type: 'in_channel', blocks });
        } catch (e) {
          console.error('Last.fm error:', e);
          await respond({
            response_type: 'ephemeral',
            text: '⚠️ Could not fetch top tracks.',
          });
        }
      }
    );
  });
};
