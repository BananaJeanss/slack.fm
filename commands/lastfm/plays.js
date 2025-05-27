require('dotenv').config();
const axios = require('axios');
const db = require('../../utils/db');
const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

module.exports = (app) => {
  app.command('/plays', async ({ ack, respond, command }) => {
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
          const now = Math.floor(Date.now() / 1000);
          const oneWeekAgo = now - 7 * 24 * 60 * 60;
          const oneMonthAgo = now - 30 * 24 * 60 * 60;

          // Get total scrobbles
          const userInfo = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(
              username
            )}&api_key=${LASTFM_API_KEY}&format=json`
          );
          const totalScrobbles = parseInt(userInfo.data.user.playcount);
          const profileUrl = userInfo.data.user.url;

          // Get weekly scrobbles
          const weeklyRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/`,
            {
              params: {
                method: 'user.getrecenttracks',
                user: username,
                from: oneWeekAgo,
                to: now,
                api_key: LASTFM_API_KEY,
                format: 'json',
                limit: 1,
              },
            }
          );
          const weeklyScrobbles = parseInt(
            weeklyRes.data.recenttracks['@attr'].total
          );

          // Get monthly scrobbles
          const monthlyRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/`,
            {
              params: {
                method: 'user.getrecenttracks',
                user: username,
                from: oneMonthAgo,
                to: now,
                api_key: LASTFM_API_KEY,
                format: 'json',
                limit: 1,
              },
            }
          );
          const monthlyScrobbles = parseInt(
            monthlyRes.data.recenttracks['@attr'].total
          );

          await respond({
            response_type: 'in_channel',
            text: `📈 <@${targetSlackId}>'s scrobbles:
• *Total:* ${totalScrobbles.toLocaleString()}
• *This month:* ${monthlyScrobbles.toLocaleString()}
• *This week:* ${weeklyScrobbles.toLocaleString()}
_Monthly and weekly stats may be inaccurate._\n
🔗 ${profileUrl}`,
          });
        } catch (e) {
          console.error('Last.fm error:', e.message || e);
          await respond({
            response_type: 'ephemeral',
            text: '⚠️ Could not fetch scrobble stats.',
          });
        }
      }
    );
  });
};
