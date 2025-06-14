import axios from 'axios';
import db from '../../utils/db.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

export default function (app) {
  app.command('/compliment', async ({ ack, respond, command }) => {
    await ack();

    // Step 1: Parse input
    let targetSlackId = command.user_id;
    const input = (command.text || '').trim();

    const mentionMatch = input.match(/^<@([UW][A-Z0-9]+)(\|[^>]+)?>$/);
    if (mentionMatch) {
      targetSlackId = mentionMatch[1];
    }

    // Step 2: Rate limit check
    const now = Date.now();
    const oneHourAgo = now - 3600 * 1000;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const todayStart = midnight.getTime();

    db.get(
      `SELECT 
        (SELECT COUNT(*) FROM roast_usage WHERE slack_user_id = ? AND timestamp > ?) as count_hour,
        (SELECT COUNT(*) FROM roast_usage WHERE slack_user_id = ? AND timestamp > ?) as count_day`,
      [command.user_id, oneHourAgo, command.user_id, todayStart],
      async (err, counts) => {
        if (err)
          return respond({
            text: ':x: Rate limit check failed.',
            response_type: 'ephemeral',
          });

        if (counts.count_hour >= 3 || counts.count_day >= 10) {
          return respond({
            response_type: 'ephemeral',
            text: `🚫 You've reached your roast/compliment limit.\nHourly: ${counts.count_hour}/3, Daily: ${counts.count_day}/10`,
          });
        }

        // Step 3: Get Last.fm username
        db.get(
          'SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?',
          [targetSlackId, command.team_id],
          async (err, row) => {
            if (err || !row) {
              return notLinkedMessage(targetSlackId, command.user_id, respond);
            }

            const username = row.lastfm_username;

            // Step 4: Fetch top data from Last.fm
            try {
              const endpoints = [
                `user.gettopartists&limit=10&period=1month`,
                `user.gettopalbums&limit=10&period=1month`,
                `user.gettoptracks&limit=10&period=1month`,
              ];

              const requests = await Promise.all(
                endpoints.map((method) =>
                  axios.get(
                    `https://ws.audioscrobbler.com/2.0/?method=${method}&user=${username}&api_key=${LASTFM_API_KEY}&format=json`
                  )
                )
              );

              const topArtistsArray = requests[0].data.topartists.artist;
              const topAlbumsArray = requests[1].data.topalbums.album;
              const topTracksArray = requests[2].data.toptracks.track;

              if (
                topArtistsArray.length === 0 &&
                topAlbumsArray.length === 0 &&
                topTracksArray.length === 0
              ) {
                return respond({
                  response_type: 'ephemeral',
                  text: "⚠️ Not enough recent listening data found to compliment. Try again after you've scrobbled more!",
                });
              }

              // then format the strings
              const topArtists = topArtistsArray.map((a) => a.name).join(', ');
              const topAlbums = topAlbumsArray
                .map((a) => `${a.name} by ${a.artist.name}`)
                .join(', ');
              const topTracks = topTracksArray
                .map((t) => `${t.name} by ${t.artist.name}`)
                .join(', ');

              const prompt = `
You're a warm, thoughtful music lover with a deep appreciation for great taste — and you're here to **gently hype up** someone's music preferences based on their top 10 artists, albums, and tracks.

Here’s what they’ve been listening to:
- Top artists: ${topArtists}
- Top albums: ${topAlbums}
- Top tracks: ${topTracks}

Deliver a heartwarming, sincere celebration of their music taste. Be poetic, kind, and full of admiration — avoid sarcasm or critique. No negativity, no jokes at their expense. Just pure, wholesome praise.
`;

              // Step 5: Send to ai.hackclub.com
              const aiResponse = await axios.post(
                'https://ai.hackclub.com/chat/completions',
                {
                  messages: [{ role: 'user', content: prompt }],
                }
              );

              const compliment = aiResponse.data.choices?.[0]?.message?.content;

              // Step 6: Record compliment usage
              db.run(
                `INSERT INTO roast_usage (slack_user_id, timestamp) VALUES (?, ?)`,
                [command.user_id, now]
              );

              // Step 7: Respond
              await respond({
                response_type: 'in_channel',
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `🌟 *Here's a compliment for <@${targetSlackId}>'s music taste:*`,
                    },
                  },
                  {
                    type: 'divider',
                  },
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text:
                        compliment.length > 3000
                          ? compliment.slice(0, 2997) + '...'
                          : compliment,
                    },
                  },
                  {
                    type: 'context',
                    elements: [
                      {
                        type: 'mrkdwn',
                        text: `Powered by ai.hackclub.com`,
                      },
                    ],
                  },
                ],
              });
            } catch (e) {
              console.error('Compliment fetch error:', e);
              respond({
                response_type: 'ephemeral',
                text: ':x: Failed to generate compliment.',
              });
            }
          }
        );
      }
    );
  });
}
