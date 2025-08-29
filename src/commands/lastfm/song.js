import axios from 'axios';
import db from '../../utils/db.js';
import getDisplayName from '../../utils/getDisplayName.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// spotify search helper
async function searchSpotifyTrack(trackName) {
  // get token
  const tokenResp = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString(
            'base64'
          ),
      },
    }
  );

  const token = tokenResp.data.access_token;

  // search track
  const constructedUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(trackName)}&type=track&limit=1`;
  const searchResp = await axios.get(constructedUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return searchResp.data.tracks.items[0] || null;
}

async function searchAppleMusicTrack(trackName) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(trackName)}&entity=song&limit=1`;
  const res = await axios.get(url);
  return res.data.results[0] || null;
}

export default function (app) {
  app.command('/song', async ({ ack, respond, command }) => {
    await ack();

    const input = command.text.trim();
    const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

    // === Case 1: No input or Slack mention → show user's latest track ===
    if (!input || mention) {
      const targetSlackId = mention ? mention[1] : command.user_id;

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
            const recent = await axios.get(
              `https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(
                username
              )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
            );

            const track = recent.data.recenttracks.track[0];
            if (!track) {
              return respond({
                response_type: 'ephemeral',
                text: `No scrobbles for *${username}*.`,
              });
            }

            const artist = track.artist['#text'];
            const songName = track.name;
            const albumName = track.album['#text'] || '<unknown>';
            const nowPlaying = track['@attr']?.nowplaying;

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
                  .replace(/<a href=".*">Read more on Last.fm<\/a>/, '')
                  .trim()
                  .replace(/\.+$/, '') // Remove all trailing dots
              : 'No summary available.';
            const cover =
              track.image?.find((i) => i.size === 'extralarge')?.['#text'] ||
              info.album?.image?.find((i) => i.size === 'extralarge')?.[
                '#text'
              ];

            let summaryText = summary;
            if (summaryText.length > 600) {
              summaryText = summaryText.slice(0, 590) + '…';
            }

            const displayName = await getDisplayName(targetSlackId);

            let actionBlocks = {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'View on Last.fm',
                    emoji: true,
                  },
                  url: info.url,
                  action_id: 'view_song_on_lastfm',
                },
              ],
            };

            // if spotify url available, add button
            try {
              if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
                const spotifyTrack = await searchSpotifyTrack(
                  `${artist} ${songName}`
                );
                if (spotifyTrack?.external_urls?.spotify) {
                  actionBlocks.elements.push({
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: 'Listen on Spotify',
                      emoji: true,
                    },
                    url: spotifyTrack.external_urls.spotify,
                    action_id: 'listen_on_spotify',
                  });
                }
              }
            } catch (e) {
              // log and ignore
              console.error('Spotify search error:', e);
            }

            try {
              const appleTrack = await searchAppleMusicTrack(
                `${artist} ${songName}`
              );
              if (appleTrack?.trackViewUrl) {
                actionBlocks.elements.push({
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Listen on Apple Music',
                    emoji: true,
                  },
                  url: appleTrack.trackViewUrl,
                  action_id: 'listen_on_applemusic',
                });
              }
            } catch (e) {
              // log and ignore
              console.error('Apple Music search error:', e);
            }

            const blocks = [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `${nowPlaying ? '🎧' : '🎵'} *Last played track by* ${displayName}`,
                },
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Track:* ${artist} – *${songName}*\n*Album:* ${albumName}`,
                },
                accessory: cover
                  ? { type: 'image', image_url: cover, alt_text: songName }
                  : undefined,
              },
              { type: 'divider' },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Listeners:*\n${listeners}` },
                  { type: 'mrkdwn', text: `*Global plays:*\n${globalPlays}` },
                  {
                    type: 'mrkdwn',
                    text: `*${displayName} plays:*\n${yourPlays}`,
                  },
                ],
              },
              { type: 'divider' },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Summary:*\n${summaryText}`,
                },
              },
              actionBlocks,
            ];

            await respond({ response_type: 'in_channel', blocks });
          } catch (e) {
            console.error('Last.fm error:', e);
            await respond({
              response_type: 'ephemeral',
              text: '⚠️ Could not fetch song info.',
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
            response_type: 'ephemeral',
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
          ? info.wiki.summary
              .replace(/<a href=".*">Read more on Last.fm<\/a>/, '')
              .trim()
          : 'No summary available.';
        const cover =
          info.album?.image?.find((i) => i.size === 'extralarge')?.['#text'] ||
          null;

        let summaryText = summary;
        if (summaryText.length > 600) {
          summaryText = summaryText.slice(0, 590) + '…';
        }

        let actionBlocks = {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'View on Last.fm',
                emoji: true,
              },
              url: info.url,
              action_id: 'view_song_on_lastfm',
            },
          ],
        };

        // if spotify url available, add button
        try {
          if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
            const spotifyTrack = await searchSpotifyTrack(
              `${artist} ${songName}`
            );
            if (spotifyTrack?.external_urls?.spotify) {
              actionBlocks.elements.push({
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Listen on Spotify',
                  emoji: true,
                },
                url: spotifyTrack.external_urls.spotify,
                action_id: 'listen_on_spotify',
              });
            }
          }
        } catch (e) {
          // log and ignore
          console.error('Spotify search error:', e);
        }

        try {
          const appleTrack = await searchAppleMusicTrack(
            `${artist} ${songName}`
          );
          if (appleTrack?.trackViewUrl) {
            actionBlocks.elements.push({
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Listen on Apple Music',
                emoji: true,
              },
              url: appleTrack.trackViewUrl,
              action_id: 'listen_on_applemusic',
            });
          }
        } catch (e) {
          // log and ignore
          console.error('Apple Music search error:', e);
        }

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎶 *Found track:* *${artist} – ${songName}*`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Album:* ${info.album?.title || '<unknown>'}`,
            },
            accessory: cover
              ? { type: 'image', image_url: cover, alt_text: songName }
              : undefined,
          },
          { type: 'divider' },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Listeners:*\n${listeners}` },
              { type: 'mrkdwn', text: `*Global plays:*\n${globalPlays}` },
            ],
          },
          { type: 'divider' },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Summary:*\n${summaryText}`,
            },
          },
          actionBlocks,
        ];

        await respond({ response_type: 'in_channel', blocks });
      } catch (e) {
        console.error('Last.fm track search error:', e);
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Could not search for song.',
        });
      }
    }
  });
}
