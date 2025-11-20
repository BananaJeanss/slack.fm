import axios from 'axios';
import db from '../../../utils/db.js';
import getDisplayName from '../../../utils/getDisplayName.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

export default function (app) {
  app.command('/whoknowsalbum', async ({ ack, respond, command }) => {
    await ack();

    let albumQuery = command.text.trim();
    let targetSlackId = command.user_id;
    let artist = '';
    let album = '';

    // If no album provided, get last played album for the user
    if (!albumQuery) {
      // Get user's lastfm username
      const row = await new Promise((resolve) =>
        db.get(
          'SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ?',
          [targetSlackId, command.team_id],
          (err, row) => resolve(row)
        )
      );
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
            text: '⚠️ No recent tracks found.',
          });
        }
        artist = track.artist['#text'];
        album = track.album['#text'];
        if (!album) {
          return respond({
            response_type: 'ephemeral',
            text: "⚠️ Your last played track doesn't have album information.",
          });
        }
      } catch (e) {
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Could not fetch your last played album.',
        });
      }
    } else {
      // Parse input - support both "album" and "artist - album" formats
      if (albumQuery.includes(' - ')) {
        const parts = albumQuery.split(' - ');
        artist = parts[0].trim();
        album = parts.slice(1).join(' - ').trim();
      } else {
        // Just album name, try to search
        try {
          const searchRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=album.search&album=${encodeURIComponent(
              albumQuery
            )}&api_key=${LASTFM_API_KEY}&format=json&limit=1`
          );

          const searchResult = searchRes.data.results?.albummatches?.album?.[0];
          if (searchResult) {
            artist = searchResult.artist;
            album = searchResult.name;
          } else {
            return respond({
              response_type: 'ephemeral',
              text: `⚠️ No album found matching "${albumQuery}". Try using "Artist - Album" format.`,
            });
          }
        } catch (e) {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ Could not search for album "${albumQuery}". Try using "Artist - Album" format.`,
          });
        }
      }

      // Verify the album exists
      try {
        const verifyRes = await axios.get(
          `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist=${encodeURIComponent(
            artist
          )}&album=${encodeURIComponent(
            album
          )}&api_key=${LASTFM_API_KEY}&format=json`
        );

        if (verifyRes.data.album) {
          // Use the properly formatted names from Last.fm
          artist = verifyRes.data.album.artist;
          album = verifyRes.data.album.name;
        } else {
          return respond({
            response_type: 'ephemeral',
            text: `⚠️ Album "${album}" by "${artist}" not found. Try a different search term.`,
          });
        }
      } catch (e) {
        return respond({
          response_type: 'ephemeral',
          text: `⚠️ Album "${album}" by "${artist}" not found. Try a different search term.`,
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

        // Fetch album info to get the cover image
        let albumImage = null;
        try {
          const albumInfoRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist=${encodeURIComponent(
              artist
            )}&album=${encodeURIComponent(
              album
            )}&api_key=${LASTFM_API_KEY}&format=json`
          );

          const albumInfo = albumInfoRes.data.album;
          albumImage =
            albumInfo?.image?.find((i) => i.size === 'extralarge')?.['#text'] ||
            'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        } catch (e) {
          console.warn('Failed to fetch album cover:', e.message);
          albumImage =
            'https://lastfm.freetls.fastly.net/i/u/300x300/2a96cbd8b46e442fc41c2b86b821562f.png';
        }

        // Fetch playcount for each user
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        const playcounts = await Promise.all(
          rows.map(async (row, index) => {
            await delay(index * process.env.APICALL_DELAY);
            try {
              const res = await axios.get(
                `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist=${encodeURIComponent(
                  artist
                )}&album=${encodeURIComponent(
                  album
                )}&username=${encodeURIComponent(
                  row.lastfm_username
                )}&api_key=${LASTFM_API_KEY}&format=json`
              );
              const userplaycount = parseInt(
                res.data.album?.userplaycount || 0
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
              text: `📀 *Top 10 for* *${album}* by *${artist}*:`,
            },
            accessory: {
              type: 'image',
              image_url: albumImage,
              alt_text: `${album} by ${artist} cover`,
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
}
