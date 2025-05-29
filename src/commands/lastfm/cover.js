import axios from 'axios';
import db from '../../utils/db.js';
import { WebClient } from '@slack/web-api';
const web = new WebClient(process.env.SLACK_BOT_TOKEN);
const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
import getDisplayName from '../../utils/getDisplayName.js';

export default function (app) {
  app.command('/cover', async ({ ack, respond, command }) => {
    await ack();

    let input = command.text.trim();
    const mention = input.match(/^<@([UW][A-Z0-9]+)(?:\|[^>]+)?>$/);

    // === Case 1: No input or Slack mention → show user's latest album cover ===
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
            const msg =
              targetSlackId === command.user_id
                ? '⚠️ You haven’t linked your Last.fm profile. Use `/link` first!'
                : '⚠️ That user hasn’t linked Last.fm.';
            return respond({ response_type: 'ephemeral', text: msg });
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

            const cover = info.image.find((i) => i.size === 'extralarge')?.[
              '#text'
            ];

            const displayName = await getDisplayName(targetSlackId);
            const blocks = [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*${albumName}* by *${artist}* (last played by ${displayName})`,
                },
              },
              cover
                ? {
                    type: 'image',
                    image_url: cover,
                    alt_text: albumName,
                  }
                : {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: '_No album cover available._',
                    },
                  },
            ];

            await respond({ response_type: 'in_channel', blocks });
          } catch (e) {
            console.error('Last.fm error:', e);
            await respond({
              response_type: 'ephemeral',
              text: '⚠️ Could not fetch album cover.',
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

        const cover =
          info.image?.find((i) => i.size === 'extralarge')?.['#text'] || null;

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${albumName}* by *${artist}*`,
            },
          },
          cover
            ? {
                type: 'image',
                image_url: cover,
                alt_text: albumName,
              }
            : {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '_No album cover available._',
                },
              },
        ];

        await respond({ response_type: 'in_channel', blocks });
      } catch (e) {
        console.error('Last.fm album search error:', e);
        return respond({
          response_type: 'ephemeral',
          text: '⚠️ Could not search for album cover.',
        });
      }
    }
  });
}
