import axios from 'axios';
import db from '../../utils/db.js';
import { WebClient } from '@slack/web-api';
import getDisplayName from '../../utils/getDisplayName.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';

const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

export default function (app) {
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
          return notLinkedMessage(targetSlackId, command.user_id, respond);
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

          const displayName = await getDisplayName(targetSlackId);
          await respond({
            response_type: 'in_channel',
            text: `📈 ${displayName}'s scrobbles:
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
}
