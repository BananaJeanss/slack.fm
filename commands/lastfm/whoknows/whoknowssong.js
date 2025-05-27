require('dotenv').config();
const axios = require('axios');
const db = require('../../../utils/db');
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const getDisplayName = require('../../../utils/getDisplayName');

module.exports = (app) => {
  app.command('/whoknowssong', async ({ ack, respond, command }) => {
    await ack();

    let songQuery = command.text.trim();
    let targetSlackId = command.user_id;
    let artist = '';
    let song = '';

    // If no song provided, get last played song for the user
    if (!songQuery) {
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
        song = track.name;
      } catch (e) {
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Could not fetch your last played song.',
        });
      }
    } else {
      // Parse input - support both "song" and "artist - song" formats
      if (songQuery.includes(' - ')) {
        const parts = songQuery.split(' - ');
        artist = parts[0].trim();
        song = parts.slice(1).join(' - ').trim();
      } else {
        // Just song name, try to search
        try {
          const searchRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=track.search&track=${encodeURIComponent(
              songQuery
            )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
          );

          const searchResult = searchRes.data.results?.trackmatches?.track?.[0];
          if (searchResult) {
            artist = searchResult.artist;
            song = searchResult.name;
          } else {
            return respond({
              response_type: 'ephemeral',
              text: `⚠️ No song found matching "${songQuery}". Try using "Artist - Song" format.`,
            });
          }
        } catch (e) {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ Could not search for song "${songQuery}". Try using "Artist - Song" format.`,
          });
        }
      }

      // Verify the song exists
      try {
        const verifyRes = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(
            artist
          )}&track=${encodeURIComponent(
            song
          )}&api_key=${LASTFM_API_KEY}&format=json`
        );

        if (verifyRes.data.track) {
          // Use the properly formatted names from Last.fm
          artist = verifyRes.data.track.artist.name;
          song = verifyRes.data.track.name;
        } else {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ Song "${song}" by "${artist}" not found. Try a different search term.`,
          });
        }
      } catch (e) {
        return respond({
          response_type: 'ephemeral',
          text: `⚠️ Song "${song}" by "${artist}" not found. Try a different search term.`,
        });
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

        // Fetch song info to get the cover image
        let songImage = null;
        try {
          const songInfoRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(
              artist
            )}&track=${encodeURIComponent(
              song
            )}&api_key=${LASTFM_API_KEY}&format=json`
          );
          const trackInfo = songInfoRes.data.track;
          // Prefer track image, fallback to album image, then placeholder
          songImage =
            trackInfo?.album?.image?.find((i) => i.size === 'extralarge')?.['#text'] ||
            trackInfo?.album?.image?.pop()?.['#text'] ||
            'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        } catch (e) {
          console.warn('Failed to fetch song/album cover:', e.message);
          songImage = 'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        }

        // Fetch playcount for each user (parallel, but be mindful of rate limits)
        const playcounts = await Promise.all(
          rows.map(async (row) => {
            try {
              const res = await axios.get(
                `https://ws.audioscrobbler.com/2.0/?method=track.getInfo&artist=${encodeURIComponent(
                  artist
                )}&track=${encodeURIComponent(
                  song
                )}&username=${encodeURIComponent(
                  row.lastfm_username
                )}&api_key=${LASTFM_API_KEY}&format=json`
              );
              const userplaycount = parseInt(
                res.data.track?.userplaycount || 0
              );
              return { slack_user_id: row.slack_user_id, userplaycount };
            } catch {
              return { slack_user_id: row.slack_user_id, userplaycount: 0 };
            }
          })
        );

        // Sort by playcount descending
        playcounts.sort((a, b) => b.userplaycount - a.userplaycount);

        const playcountsWithNames = await Promise.all(
          playcounts.map(async (entry) => {
            const displayName = await getDisplayName(entry.slack_user_id);
            return { ...entry, displayName: displayName || 'Unknown user' };
          })
        );

        // Prepare leaderboard
        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `🎵 *Top 10 for* _${song}_ *by* _${artist}_:`,
            },
            accessory: {
              type: 'image',
              image_url: songImage,
              alt_text: `${song} by ${artist} cover`,
            },
          },
          { type: 'divider' },
        ];

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
