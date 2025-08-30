import axios from 'axios';
import db from '../../utils/db.js';
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
import getDisplayName from '../../utils/getDisplayName.js';
import { API_CALL_DELAY } from '#utils/apicalldelay.js';

export default function (app) {
  app.command('/whoslistening', async ({ command, ack, respond }) => {
    await ack();

    // Get all linked users in this workspace
    db.all(
      'SELECT slack_user_id, lastfm_username FROM user_links WHERE workspace_id = ?',
      [command.team_id],
      async (err, rows) => {
        if (err) {
          console.error('Database error:', err);
          return respond({
            response_type: 'ephemeral',
            text: '❌ Database error. Please try again later.',
          });
        }

        if (!rows || rows.length === 0) {
          return respond({
            response_type: 'in_channel',
            text: '⚠️ No users are linked to Last.fm in this workspace. Use `/linklastfm` to connect your account.',
          });
        }

        const delay = (ms) => new Promise((r) => setTimeout(r, ms));

        // Check each user's current listening status
        const listeningUsers = await Promise.all(
          rows.map(async (row, index) => {
            await delay(index * API_CALL_DELAY); // .env APICALL_DELAY wait between each request
            try {
              const response = await axios.get(
                `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
                  row.lastfm_username
                )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
              );

              const track = response.data.recenttracks?.track?.[0];

              if (track && track['@attr']?.nowplaying === 'true') {
                return {
                  slack_user_id: row.slack_user_id,
                  display_name: await getDisplayName(row.slack_user_id),
                  lastfm_username: row.lastfm_username,
                  artist: track.artist['#text'],
                  song: track.name,
                  album: track.album['#text'] || '',
                  image:
                    track.image?.find((img) => img.size === 'medium')?.[
                      '#text'
                    ] || null,
                };
              }
            } catch (e) {
              console.warn(
                `Failed to fetch data for ${row.lastfm_username}:`,
                e.message
              );
            }
            return null;
          })
        );

        // Filter out nulls (users not currently listening or errored)
        const filteredListeningUsers = listeningUsers.filter(Boolean);

        if (filteredListeningUsers.length === 0) {
          return respond({
            response_type: 'in_channel',
            text: '🎧 Nobody is currently listening to music in this workspace! Time to start scrobbling! 🎵',
          });
        }

        // Shuffle the array and take up to 5 users
        const shuffled = filteredListeningUsers.sort(() => 0.5 - Math.random());
        const selectedUsers = shuffled.slice(0, 5);

        // Build the response blocks
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎧 *${selectedUsers.length} ${selectedUsers.length === 1 ? 'person is' : 'people are'} currently listening to music:*`,
            },
          },
          { type: 'divider' },
        ];

        selectedUsers.forEach((user) => {
          const trackText = `*${user.song}* by *${user.artist}*${user.album ? `\n*Album: ${user.album}*` : ''}`;

          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎵 ${user.display_name} is jamming to:\n${trackText}`,
            },
            ...(user.image && {
              accessory: {
                type: 'image',
                image_url: user.image,
                alt_text: `${user.song} album art`,
              },
            }),
          });
        });

        // Add a footer with the total count if there are more listeners
        if (filteredListeningUsers.length > 5) {
          blocks.push(
            { type: 'divider' },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `*And ${filteredListeningUsers.length - 5} more ${filteredListeningUsers.length - 5 === 1 ? 'person is' : 'people are'} listening! 🎶*`,
                },
              ],
            }
          );
        }

        await respond({
          response_type: 'in_channel',
          blocks,
        });
      }
    );
  });
}
