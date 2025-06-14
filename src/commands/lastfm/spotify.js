import axios from 'axios';
import db from '../../utils/db.js';
import getDisplayName from '../../utils/getDisplayName.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

async function getSpotifyAccessToken() {
  const auth = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'client_credentials' }),
    {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return response.data.access_token;
}

export default function (app) {
  app.command('/spotify', async ({ ack, respond, command }) => {
    await ack();

    const input = command.text.trim();
    const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

    // === Case 1: Mention or no input → use user's Last.fm recent track
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
                text: `No recent track found for *${username}*.`,
              });
            }

            const artist = track.artist['#text'];
            const title = track.name;

            const token = await getSpotifyAccessToken();
            const searchRes = await axios.get(
              'https://api.spotify.com/v1/search',
              {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                  q: `track:${title} artist:${artist}`,
                  type: 'track',
                  limit: 1,
                },
              }
            );

            const items = searchRes.data.tracks.items;
            if (items.length === 0) {
              return respond({
                response_type: 'ephemeral',
                text: `⚠️ Could not find *${title}* by *${artist}* on Spotify.`,
              });
            }

            const url = items[0].external_urls.spotify;
            const displayName = await getDisplayName(targetSlackId);
            return respond({
              text: `${displayName || 'This user'}, here's the Spotify link for *${title}* by *${artist}*:\n${url}`,
            });
          } catch (e) {
            console.error('Error in /spotify:', e.message);
            return respond({
              response_type: 'ephemeral',
              text: '⚠️ Something went wrong fetching the Spotify link.',
            });
          }
        }
      );
    }

    // === Case 2: Text input that's not a mention → treat as song name
    else {
      try {
        const token = await getSpotifyAccessToken();

        const searchRes = await axios.get('https://api.spotify.com/v1/search', {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            q: input,
            type: 'track',
            limit: 1,
          },
        });

        const items = searchRes.data.tracks.items;
        if (items.length === 0) {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ Could not find a Spotify match for *${input}*.`,
          });
        }

        const track = items[0];
        const artist = track.artists.map((a) => a.name).join(', ');
        const title = track.name;
        const url = track.external_urls.spotify;

        return respond({
          response_type: 'in_channel',
          text: `🎧 Here's the Spotify link for *${title}* by *${artist}*:\n${url}`,
        });
      } catch (e) {
        console.error('Spotify search error:', e.message);
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Something went wrong searching Spotify.',
        });
      }
    }
  });
}
