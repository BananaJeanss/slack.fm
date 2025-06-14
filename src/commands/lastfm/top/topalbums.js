import axios from 'axios';
import db from '../../../utils/db.js';
import { WebClient } from '@slack/web-api';
import getDisplayName from '../../../utils/getDisplayName.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';

const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

export default function (app) {
  app.command('/topalbums', async ({ ack, respond, command }) => {
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
          const top = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=user.gettopalbums&user=${encodeURIComponent(
              username
            )}&api_key=${LASTFM_API_KEY}&format=json&limit=10&period=overall`
          );

          const albums = top.data.topalbums.album;
          if (!albums || albums.length === 0) {
            return respond({
              response_type: 'ephemeral',
              text: `No top albums found for *${username}*.`,
            });
          }

          const displayName = await getDisplayName(targetSlackId);
          const blocks = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `📀 *All-Time Top 10 Albums for* ${displayName}`,
              },
            },
            { type: 'divider' },
          ];

          albums.forEach((album, index) => {
            const imageUrl = album.image?.find(
              (img) => img.size === 'extralarge' && img['#text']
            )?.['#text'];
            blocks.push({
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*${index + 1}. ${album.name}* by *${
                  album.artist.name
                }* – ${album.playcount} plays`,
              },
              ...(index === 0 && imageUrl
                ? {
                    accessory: {
                      type: 'image',
                      image_url: imageUrl,
                      alt_text: album.name,
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
            text: '⚠️ Could not fetch top albums.',
          });
        }
      }
    );
  });
}
