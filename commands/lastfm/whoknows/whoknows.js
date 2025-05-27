require('dotenv').config();
const axios = require('axios');
const db = require('../../../utils/db');
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const getDisplayName = require('../../../utils/getDisplayName');

module.exports = (app) => {
  app.command('/whoknows', async ({ ack, respond, command }) => {
    await ack();

    let artist = command.text.trim();
    let targetSlackId = command.user_id;

    // If no artist provided, get last played artist for the user
    if (!artist) {
      // Get user's lastfm username
      const row = await new Promise((resolve) =>
        db.get(
          'SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?',
          [targetSlackId, command.team_id],
          (err, row) => resolve(row)
        )
      );
      if (!row) {
        return respond({
          response_type: 'ephemeral',
          text: "⚠️ You haven't linked your Last.fm profile. Use `/link` first!",
        });
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
            text: '⚠️ No recent tracks found.',
          });
        }
        artist = track.artist['#text'];
      } catch (e) {
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Could not fetch your last played artist.',
        });
      }
    } else {
      // Search for the artist to get the correct capitalization and exact match
      try {
        const searchRes = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=artist.search&artist=${encodeURIComponent(
            artist
          )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
        );

        const searchResult = searchRes.data.results?.artistmatches?.artist?.[0];
        if (searchResult) {
          artist = searchResult.name; // Use the properly formatted name from Last.fm
        } else {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ No artist found matching "${artist}". Try a different search term.`,
          });
        }
      } catch (e) {
        console.warn('Artist search failed, using original input:', e.message);
        // Continue with original input if search fails
      }
    }

    // Get all linked users in this workspace
    db.all(
      'SELECT slack_user_id, lastfm_username FROM user_links WHERE workspace_id = ?',
      [command.team_id],
      async (err, rows) => {
        if (err || !rows || rows.length === 0) {
          return respond({
            response_type: 'ephemeral',
            text: '⚠️ No linked users found in this workspace.',
          });
        }

        // Fetch artist info to get the image
        let artistImage = null;
        try {
          const artistInfoRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(
              artist
            )}&api_key=${LASTFM_API_KEY}&format=json`
          );

          const artistInfo = artistInfoRes.data.artist;
          artistImage = artistInfo?.image?.find((i) => i.size === 'extralarge')?.['#text'] ||
            'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        } catch (e) {
          console.warn('Failed to fetch artist image:', e.message);
          artistImage = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        }

        // Fetch playcount for each user (parallel, but be mindful of rate limits)
        const playcounts = await Promise.all(
          rows.map(async (row) => {
            try {
              const res = await axios.get(
                `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(
                  artist
                )}&username=${encodeURIComponent(
                  row.lastfm_username
                )}&api_key=${LASTFM_API_KEY}&format=json`
              );
              const userplaycount = parseInt(
                res.data.artist?.stats?.userplaycount || 0
              );
              return { slack_user_id: row.slack_user_id, userplaycount };
            } catch {
              return { slack_user_id: row.slack_user_id, userplaycount: 0 };
            }
          })
        );

        // Sort by playcount descending
        playcounts.sort((a, b) => b.userplaycount - a.userplaycount);

        // Prepare leaderboard
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `:trophy: *Top 10 for* _${artist}_:`,
            },
            accessory: {
              type: 'image',
              image_url: artistImage,
              alt_text: `${artist} image`,
            },
          },
          { type: 'divider' },
        ];

        const playcountsWithNames = await Promise.all(
          playcounts.map(async (entry) => {
            const displayName = await getDisplayName(entry.slack_user_id);
            return { ...entry, displayName: displayName || 'Unknown user' };
          })
        );

        for (let i = 0; i < Math.min(10, playcountsWithNames.length); i++) {
          const user = playcountsWithNames[i];
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${i + 1}. ${user.displayName}* — ${user.userplaycount} plays`,
            },
          });
        }

        // If the user isn't in the top 10, show their rank
        const userIndex = playcountsWithNames.findIndex(
          (u) => u.slack_user_id === targetSlackId
        );
        if (userIndex >= 10) {
          blocks.push({ type: 'divider' });
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Your rank: *${userIndex + 1}* — ${playcountsWithNames[userIndex].userplaycount} plays`,
            },
          });
        }

        await respond({ response_type: 'in_channel', blocks });
      }
    );
  });
};
