import crypto from 'crypto';
import db from '../../utils/db.js';
import querystring from 'querystring';
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_CALLBACK_URL = process.env.LASTFM_CALLBACK_URL;

export default function (app) {
  app.command('/linklastfm', async ({ ack, respond, command }) => {
    await ack();

    // Check if the user is already linked in this workspace
    const userLink = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM user_links WHERE slack_user_id = ? AND workspace_id = ?',
        [command.user_id, command.team_id],
        (err, row) => {
          if (err) {
            console.error('Error fetching user link:', err);
            return reject(err);
          }
          resolve(row);
        }
      );
    });

    const state = crypto.randomBytes(16).toString('hex');

    const queryString = querystring.stringify({
      slack_user_id: command.user_id,
      workspace_id: command.team_id,
      state: state,
    });

    const fullCallbackUrl = `${LASTFM_CALLBACK_URL}?${queryString}`;

    db.run(
      'INSERT INTO link_states (slack_user_id, workspace_id, state, created_at) VALUES (?, ?, ?, ?)',
      [command.user_id, command.team_id, state, Date.now()]
    );

    const authUrl = `https://www.last.fm/api/auth?api_key=${LASTFM_API_KEY}&cb=${encodeURIComponent(
      fullCallbackUrl
    )}`;

    const blocks = [];
    if (userLink) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `You are already linked to last.fm account: ${userLink.lastfm_username}`,
        },
      });
    }

    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: {
            type: 'plain_text',
            text: userLink ? '🔁 Re-link Last.fm' : '🔗 Link Last.fm',
            emoji: true,
          },
          url: authUrl,
          action_id: 'link_lastfm',
        },
      ],
    });

    await respond({
      response_type: 'ephemeral',
      blocks: blocks,
    });
  });
}
