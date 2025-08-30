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

  const usageCounts = (await getRow(
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
      // banner
      type: 'image',
      image_url:
        'https://github.com/BananaJeanss/slack.fm/raw/main/assets/slackfmbanner.png',
      alt_text: 'slack.fm banner',
    },
    {
      type: 'header',
      text: { type: 'plain_text', text: 'slack.fm', emoji: true },
    },
    // basic user bot stats
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
            text: '🔗 Not linked yet. Use `/linklastfm` to connect your Last.fm account.',
          },
        },
    ...(username
      ? [
          {
            type: 'section',
            text: { type: 'plain_text', text: usageLine, emoji: true },
          },
        ]
      : []),
    { type: 'divider' },
    {
      // commands
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Basic Commands',
      },
    },
    {
      type: 'table',
      rows: [
        // Header row
        [
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [
                  { type: 'text', text: 'Command', style: { bold: true } },
                ],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [
                  { type: 'text', text: 'Description', style: { bold: true } },
                ],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [
                  { type: 'text', text: 'Usage', style: { bold: true } },
                ],
              },
            ],
          },
        ],
        // /linklastfm
        [
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/linklastfm' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: 'Link your Last.fm account' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/linklastfm' }],
              },
            ],
          },
        ],
        // /unlinklastfm
        [
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/unlinklastfm' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: 'Unlink your account' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/unlinklastfm' }],
              },
            ],
          },
        ],
        // /profile
        [
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/profile' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: 'Show profile stats' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/profile [@user]' }],
              },
            ],
          },
        ],
        // /nowplaying
        [
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/nowplaying' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: 'Current or last track' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/nowplaying [@user]' }],
              },
            ],
          },
        ],
        // /recent
        [
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/recent' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: 'Last 5 tracks' }],
              },
            ],
          },
          {
            type: 'rich_text',
            elements: [
              {
                type: 'rich_text_section',
                elements: [{ type: 'text', text: '/recent [@user]' }],
              },
            ],
          },
        ],
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'The full commands list is viewable via <https://github.com/BananaJeanss/slack.fm/blob/main/commands.md>',
      },
    },
  ];

  await client.views.publish({
    user_id: userId,
    view: { type: 'home', callback_id: 'home_view', blocks },
  });
}
