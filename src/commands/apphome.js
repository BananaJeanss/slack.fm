import db from '#utils/db.js';

export default function (app) {
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      await publishHome(client, event.user);
    } catch (e) {
      console.error('Home publish error:', e);
    }
  });

  app.action('refresh_home', async ({ ack, body, client }) => {
    await ack();
    try {
      await publishHome(client, body.user.id);
    } catch (e) {
      console.error('Home refresh error:', e);
    }
  });
}

function getRow(sql, params) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

async function publishHome(client, userId) {
  const linkRow = await getRow(
    'SELECT lastfm_username FROM user_links WHERE slack_user_id = ?',
    [userId]
  );
  const username = linkRow?.lastfm_username;

  // Rate limit counts
  const now = Date.now();
  const oneHourAgo = now - 3600 * 1000;
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const todayStart = midnight.getTime();

  const usageCounts =
    (await getRow(
      `SELECT
        (SELECT COUNT(*) FROM roast_usage WHERE slack_user_id = ? AND timestamp > ?) AS hourly_usage,
        (SELECT COUNT(*) FROM roast_usage WHERE slack_user_id = ? AND timestamp > ?) AS daily_usage`,
      [userId, oneHourAgo, userId, todayStart]
    ).catch(() => null)) || { hourly_usage: 0, daily_usage: 0 };

  const hourlyRoastUsage = usageCounts.hourly_usage || 0;
  const dailyRoastUsage = usageCounts.daily_usage || 0;

  const usageLine = `Roast/Compliment Usage | Hourly: ${hourlyRoastUsage}/3 | Daily: ${dailyRoastUsage}/10`;

  const blocks = [
    {
      type: 'image',
      image_url:
        'https://github.com/BananaJeanss/slack.fm/raw/main/assets/slackfmbanner.png',
      alt_text: 'slack.fm banner',
    },
    {
      type: 'header',
      text: { type: 'plain_text', text: 'slack.fm', emoji: true },
    },
    { type: 'divider' },
    username
      ? {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `🔗 Linked as <https://www.last.fm/user/${username}|${username}>`,
          },
        }
      : {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '🔗 Not linked yet. Use `/link` to connect your Last.fm account.',
          },
        },
    {
      type: 'section',
      text: { type: 'plain_text', text: usageLine, emoji: true },
    },
    { type: 'divider' },
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Commands', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'The commands list is viewable via /slackfmcommands or <https://github.com/BananaJeanss/slack.fm/blob/main/commands.md>',
      },
    },
  ];

  await client.views.publish({
    user_id: userId,
    view: { type: 'home', callback_id: 'home_view', blocks },
  });
}
