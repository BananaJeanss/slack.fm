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
async function searchSpotifyAlbum(albumName) {
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

  // search album
  const constructedUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(
    albumName
  )}&type=album&limit=1`;
  const searchResp = await axios.get(constructedUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return searchResp.data.albums?.items?.[0] || null;
}

export default function (app) {
  app.command('/album', async ({ ack, respond, command }) => {
    await ack();

    let input = command.text.trim();
    const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

    // === Case 1: No input or Slack mention → show user's latest album ===
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
            const albumName = track.album['#text'] || '<unknown>';

            const infoRes = await axios.get(
              `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist=${encodeURIComponent(
                artist
              )}&album=${encodeURIComponent(
                albumName
              )}&username=${encodeURIComponent(
                username
              )}&api_key=${LASTFM_API_KEY}&format=json`
            );
            const info = infoRes.data.album;

            let releaseDate = 'Unavailable';
            try {
              const mbRes = await axios.get(
                `https://musicbrainz.org/ws/2/release-group`,
                {
                  params: {
                    query: `release:${albumName} AND artist:${artist}`,
                    fmt: 'json',
                  },
                }
              );

              const match = mbRes.data['release-groups']?.[0];
              if (match?.['first-release-date']) {
                releaseDate = match['first-release-date'];
              }
            } catch (e) {
              console.warn('MusicBrainz lookup failed:', e.message);
            }

            const listeners = info.listeners;
            const globalPlays = info.playcount;
            const yourPlays = info.userplaycount || 0;

            const summary = info.wiki?.summary
              ? info.wiki.summary
                  .replace(/<a href=".*">Read more on Last.fm<\/a>/, '')
                  .trim()
              : 'No summary available.';
            const cover = info.image.find((i) => i.size === 'extralarge')?.[
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
                  action_id: 'view_album_on_lastfm',
                },
              ],
            };

            // if spotify url available, add button
            try {
              if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
                const spotifyTrack = await searchSpotifyAlbum(
                  `${artist} ${albumName}`
                );
                if (spotifyTrack?.external_urls?.spotify) {
                  actionButtons.elements.push({
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

            const blocks = [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `📀 *Last played album by* ${displayName}`,
                },
              },

              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Album:* ${artist} – *${info.name}*`,
                },
                accessory: cover
                  ? { type: 'image', image_url: cover, alt_text: info.name }
                  : undefined,
              },
              { type: 'divider' },
              {
                type: 'section',
                fields: [
                  { type: 'mrkdwn', text: `*Release date:*\n${releaseDate}` },
                  {
                    type: 'mrkdwn',
                    text: `*Listeners:*\n${listeners} listeners`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*Global plays:*\n${globalPlays} scrobbles`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*${displayName} plays:*\n${yourPlays} scrobbles`,
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
              text: '⚠️ Could not fetch album info.',
            });
          }
        }
      );
    }

    // === Case 2: Treat input as album name → search and return best match ===
    else {
      try {
        const res = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(
            input
          )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
        );

        const album = res.data.results.albummatches.album[0];
        if (!album) {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ No match found for *${input}*.`,
          });
        }

        const artist = album.artist;
        const albumName = album.name;

        const infoRes = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist=${encodeURIComponent(
            artist
          )}&album=${encodeURIComponent(albumName)}&api_key=${LASTFM_API_KEY}&format=json`
        );

        const info = infoRes.data.album;

        let releaseDate = 'Unavailable';
        try {
          const mbRes = await axios.get(
            `https://musicbrainz.org/ws/2/release-group`,
            {
              params: {
                query: `release:${albumName} AND artist:${artist}`,
                fmt: 'json',
              },
            }
          );

          const match = mbRes.data['release-groups']?.[0];
          if (match?.['first-release-date']) {
            releaseDate = match['first-release-date'];
          }
        } catch (e) {
          console.warn('MusicBrainz lookup failed:', e.message);
        }

        const listeners = info.listeners;
        const globalPlays = info.playcount;
        const summary = info.wiki?.summary
          ? info.wiki.summary
              .replace(/<a href=".*">Read more on Last.fm<\/a>/, '')
              .trim()
          : 'No summary available.';
        const cover =
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
              action_id: 'view_album_on_lastfm',
            },
          ],
        };

        // if spotify url available, add button
        try {
          if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
            const spotifyTrack = await searchSpotifyAlbum(
              `${artist} ${albumName}`
            );
            if (spotifyTrack?.external_urls?.spotify) {
              actionButtons.elements.push({
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

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📀 *Found album:* *${artist} – ${albumName}*`,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Release date:* ${releaseDate}`,
            },
            accessory: cover
              ? { type: 'image', image_url: cover, alt_text: albumName }
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
        console.error('Last.fm album search error:', e);
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Could not search for album.',
        });
      }
    }
  });
}
