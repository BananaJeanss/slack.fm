import axios from 'axios';
import db from '../../utils/db.js';
import { WebClient } from '@slack/web-api';
import getDisplayName from '../../utils/getDisplayName.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';

const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// spotify search helper
async function searchSpotifyArtist(artistName) {
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

  // search artist
  const constructedUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    artistName
  )}&type=artist&limit=1`;
  const searchResp = await axios.get(constructedUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return searchResp.data.artists?.items?.[0] || null;
}

async function searchAppleMusicArtist(artistName) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`;
  const res = await axios.get(url);
  return res.data.results[0] || null;
}

export default function (app) {
  app.command('/artist', async ({ ack, respond, command }) => {
    await ack();

    let input = command.text.trim();
    const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

    // === Case 1: No input or Slack mention → show user's latest artist ===
    if (!input || mention) {
      let targetSlackId = mention ? mention[1] : command.user_id;
      if (input && !mention) {
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

            const infoRes = await axios.get(
              `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(
                artist
              )}&username=${encodeURIComponent(
                username
              )}&api_key=${LASTFM_API_KEY}&format=json`
            );
            const info = infoRes.data.artist;

            const listeners = info.stats.listeners;
            const globalPlays = info.stats.playcount;
            const userPlays = info.stats.userplaycount || 0;
            const summary = info.bio?.summary
              ? info.bio.summary
                  .replace(/<a href=".*">Read more on Last.fm<\/a>/, '')
                  .trim()
              : 'No summary available.';
            const image = info.image.find((i) => i.size === 'extralarge')?.[
              '#text'
            ];

            let summaryText = summary;
            if (summaryText.length > 600) {
              summaryText = summaryText.slice(0, 590) + '…';
            }

            const displayName = await getDisplayName(targetSlackId);

            let actionButtons = {
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
                  action_id: 'view_artist_on_lastfm',
                },
              ],
            };

            // if spotify url available, add button
            try {
              if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
                const spotifyArtist = await searchSpotifyArtist(`${artist}`);
                if (spotifyArtist?.external_urls?.spotify) {
                  actionButtons.elements.push({
                    type: 'button',
                    text: {
                      type: 'plain_text',
                      text: 'Listen on Spotify',
                      emoji: true,
                    },
                    url: spotifyArtist.external_urls.spotify,
                    action_id: 'listen_on_spotify',
                  });
                }
              }
            } catch (e) {
              // log and ignore
              console.error('Spotify search error:', e);
            }

            try {
              const appleTrack = await searchAppleMusicArtist(artist);
              if (appleTrack?.artistLinkUrl) {
                actionButtons.elements.push({
                  type: 'button',
                  text: {
                    type: 'plain_text',
                    text: 'Listen on Apple Music',
                    emoji: true,
                  },
                  url: appleTrack.artistLinkUrl,
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
                  text: `🎤 *Last played artist by* ${displayName}`,
                },
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Artist:* ${info.name}`,
                },
                accessory: image
                  ? { type: 'image', image_url: image, alt_text: info.name }
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
                    text: `*${displayName} plays:*\n${userPlays}`,
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
              actionButtons,
            ];

            await respond({ response_type: 'in_channel', blocks });
          } catch (e) {
            console.error('Last.fm error:', e);
            await respond({
              response_type: 'ephemeral',
              text: '⚠️ Could not fetch artist info.',
            });
          }
        }
      );
    }

    // === Case 2: Treat input as artist name → search and return best match ===
    else {
      try {
        const res = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=artist.search&artist=${encodeURIComponent(
            input
          )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
        );

        const artistMatch = res.data.results.artistmatches.artist[0];
        if (!artistMatch) {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ No match found for *${input}*.`,
          });
        }

        const artist = artistMatch.name;

        const infoRes = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(
            artist
          )}&api_key=${LASTFM_API_KEY}&format=json`
        );
        const info = infoRes.data.artist;

        const listeners = info.stats.listeners;
        const globalPlays = info.stats.playcount;
        const summary = info.bio?.summary
          ? info.bio.summary
              .replace(/<a href=".*">Read more on Last.fm<\/a>/, '')
              .trim()
          : 'No summary available.';
        const image =
          info.image?.find((i) => i.size === 'extralarge')?.['#text'] || null;

        let summaryText = summary;
        if (summaryText.length > 600) {
          summaryText = summaryText.slice(0, 590) + '…';
        }

        let actionButtons = {
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
              action_id: 'view_artist_on_lastfm',
            },
          ],
        };

        // if spotify url available, add button
        try {
          if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
            const spotifyArtist = await searchSpotifyArtist(`${artist}`);
            if (spotifyArtist?.external_urls?.spotify) {
              actionButtons.elements.push({
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'Listen on Spotify',
                  emoji: true,
                },
                url: spotifyArtist.external_urls.spotify,
                action_id: 'listen_on_spotify',
              });
            }
          }
        } catch (e) {
          // log and ignore
          console.error('Spotify search error:', e);
        }

        try {
          const appleTrack = await searchAppleMusicArtist(artist);
          if (appleTrack?.artistLinkUrl) {
            actionButtons.elements.push({
              type: 'button',
              text: {
                type: 'plain_text',
                text: 'Listen on Apple Music',
                emoji: true,
              },
              url: appleTrack.artistLinkUrl,
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
              text: `🎤 *Found artist:* *${artist}*`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Artist:* ${info.name}`,
            },
            accessory: image
              ? { type: 'image', image_url: image, alt_text: info.name }
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
          actionButtons,
        ];

        await respond({ response_type: 'in_channel', blocks });
      } catch (e) {
        console.error('Last.fm artist search error:', e);
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Could not search for artist.',
        });
      }
    }
  });
}
