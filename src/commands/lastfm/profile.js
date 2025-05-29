import axios from 'axios';
import db from '../../utils/db.js';
import getDisplayName from '../../utils/getDisplayName.js';
import { WebClient } from '@slack/web-api';

const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

export default function (app) {
  app.command('/profile', async ({ ack, respond, command }) => {
    await ack();

    let input = command.text.trim();
    let targetSlackId = command.user_id;

    if (input) {
      // If it's a Slack mention like <@U1234|username>, extract the ID
      const mentionMatch = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);
      if (mentionMatch) {
        targetSlackId = mentionMatch[1];
      } else {
        // Fall back to username/display name lookup
        input = input.replace(/^@/, ''); // remove leading @ if present
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
              response_type: 'ephemeral',
              text: '⚠️ Could not find a Slack user with that username.',
            });
          }
        } catch (e) {
          console.error('Slack API error:', e);
          return await respond({
            response_type: 'ephemeral',
            text: ':x: Failed to look up Slack user. Try again later.',
          });
        }
      }
    }

    db.get(
      'SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?',
      [targetSlackId, command.team_id],
      async (err, row) => {
        if (err) {
          await respond({
            response_type: 'ephemeral',
            text: ':x: Database error. Please try again later.',
          });
          return;
        }

        if (!row) {
          await respond({
            response_type: 'ephemeral',
            text:
              targetSlackId === command.user_id
                ? "⚠️ You haven't linked your Last.fm account. Use `/link` to connect."
                : '⚠️ That user hasn’t linked their Last.fm account.',
          });
          return;
        }

        const username = row.lastfm_username;

        try {
          const url = `https://ws.audioscrobbler.com/2.0/?method=user.getinfo&user=${encodeURIComponent(
            username
          )}&api_key=${LASTFM_API_KEY}&format=json`;
          const { data } = await axios.get(url);

          const profile = data.user;
          const tag = await getDisplayName(targetSlackId);

          const blocks = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🎧 *${tag}'s Last.fm profile:*\n*Username:* ${profile.name}\n*Scrobbles:* ${profile.playcount}\n*Registered:* ${new Date(
                  parseInt(profile.registered.unixtime) * 1000
                ).toLocaleDateString()}`,
              },
              accessory: {
                type: 'image',
                image_url: profile.image?.[3]?.['#text'], // large avatar
                alt_text: `${profile.name}'s avatar`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View Last.fm Profile',
                  },
                  url: profile.url,
                },
              ],
            },
          ];

          await respond({
            response_type: 'in_channel',
            blocks,
          });
        } catch (e) {
          await respond({
            response_type: 'ephemeral',
            text: ':warning: Failed to fetch Last.fm profile.',
          });
        }
      }
    );
  });
}
