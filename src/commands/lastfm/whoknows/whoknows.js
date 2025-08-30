import axios from 'axios';
import db from '#utils/db.js';
import getDisplayName from '#utils/getDisplayName.js';
import { resolveArtistImage, getPlaceholderImage } from '#utils/getImage.js';
import notLinkedMessage from '#utils/notLinkedMessage.js';
import { API_CALL_DELAY } from '#utils/apicalldelay.js';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;

export default function (app) {
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

        // Fetch artist image using the new resolver
        let artistImage = null;
        try {
          const artistInfoRes = await axios.get(
            `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(
              artist
            )}&api_key=${LASTFM_API_KEY}&format=json`
          );

          const artistInfo = artistInfoRes.data.artist;
          artistImage = await resolveArtistImage(artist, artistInfo?.image);
        } catch (e) {
          console.warn('Failed to fetch artist info:', e.message);
        }

        // Use placeholder only if no image found
        if (!artistImage) {
          artistImage = getPlaceholderImage('artist');
        }

        const delay = (ms) => new Promise((r) => setTimeout(r, ms));

        // Fetch playcount for each user
        const playcounts = await Promise.all(
          rows.map(async (row, index) => {
            await delay(index * API_CALL_DELAY);  // .env APICALL_DELAY wait between each request
            console.log(index * API_CALL_DELAY)
            try {
              const res = await axios.get(
                `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(
                  artist
                )}&username=${encodeURIComponent(
                  row.lastfm_username
                )}&api_key=${LASTFM_API_KEY}&format=json`
              );
              const userplaycount = parseInt(
                res.data.artist?.stats?.userplaycount || 0,
                10
              ); // ensure base 10
              return { slack_user_id: row.slack_user_id, userplaycount };
            } catch {
              return { slack_user_id: row.slack_user_id, userplaycount: 0 };
            }
          })
        );

        // Sort by playcount descending
        playcounts.sort((a, b) => b.userplaycount - a.userplaycount);

        // crown check
        // person with most streams gets/steals the crown if streams >=100
        const crownLeader = playcounts[0];

        let newLeaderType = 'none'; // "stealer" or "first"
        let crownRow = null;

        if (crownLeader.userplaycount >= 100) {
          try {
            crownRow = await new Promise((resolve, reject) => {
              db.get(
                'SELECT slack_user_id, playcount, earned_at FROM whoknows_crowns WHERE workspace_id = ? AND artist_name = ?',
                [command.team_id, artist],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                }
              );
            });

            if (!crownRow) {
              // No crown exists, assign to current leader
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO whoknows_crowns (slack_user_id, workspace_id, artist_name, playcount, earned_at) VALUES (?, ?, ?, ?, ?)',
                  [
                    crownLeader.slack_user_id,
                    command.team_id,
                    artist,
                    crownLeader.userplaycount,
                    Math.floor(Date.now() / 1000),
                  ],
                  (err) => {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });
              newLeaderType = 'first';
              crownRow = {
                slack_user_id: crownLeader.slack_user_id,
                playcount: crownLeader.userplaycount,
                earned_at: Math.floor(Date.now() / 1000),
              };
            } else if (crownRow.slack_user_id !== crownLeader.slack_user_id) {
              if (crownLeader.userplaycount > crownRow.playcount) {
                // different user has the crown, steal the crown
                await new Promise((resolve, reject) => {
                  db.run(
                    'UPDATE whoknows_crowns SET slack_user_id = ?, playcount = ?, earned_at = ? WHERE workspace_id = ? AND artist_name = ?',
                    [
                      crownLeader.slack_user_id,
                      crownLeader.userplaycount,
                      Math.floor(Date.now() / 1000),
                      command.team_id,
                      artist,
                    ],
                    (err) => {
                      if (err) reject(err);
                      else resolve();
                    }
                  );
                });
                newLeaderType = 'stealer';
                crownRow = {
                  slack_user_id: crownLeader.slack_user_id,
                  playcount: crownLeader.userplaycount,
                  earned_at: Math.floor(Date.now() / 1000),
                };
              }
            } else if (crownLeader.userplaycount > crownRow.playcount) {
              // Current leader has increased their playcount
              await new Promise((resolve, reject) => {
                db.run(
                  'UPDATE whoknows_crowns SET playcount = ? WHERE workspace_id = ? AND artist_name = ?',
                  [crownLeader.userplaycount, command.team_id, artist],
                  (err) => {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });
            }
          } catch (error) {
            console.error('Crown database error:', error);
          }
        }

        // Prepare leaderboard
        let firstSectionText = `:trophy: *Top 10 for* *${artist}*:`;

        if (newLeaderType != 'none') {
          if (newLeaderType === 'stealer') {
            firstSectionText += `\n\n:crown: *${await getDisplayName(crownLeader.slack_user_id)} has stolen the crown!*`;
          } else {
            firstSectionText += `\n\n:crown: *${await getDisplayName(crownLeader.slack_user_id)} is the first to earn the crown!*`;
          }
        }

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: firstSectionText,
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
          if (
            i === 0 &&
            crownRow &&
            user.slack_user_id === crownRow.slack_user_id
          ) {
            // add since date for crown leader
            if (newLeaderType === 'none') { // only if not changed
              blocks.push({
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${i + 1}. ${user.displayName}* — ${user.userplaycount} plays (since ${new Date(crownRow.earned_at * 1000).toLocaleDateString()})`,
                },
              });
              continue;
            }
          }
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
