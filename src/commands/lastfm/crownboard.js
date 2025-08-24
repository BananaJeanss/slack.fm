import db from '#utils/db.js';
import getDisplayName from '#utils/getDisplayName.js';

export default function (app) {
  app.command('/crownboard', async ({ ack, respond, command }) => {
    await ack();

    const targetSlackId = command.user_id;

    // fetch all crown holders aggregated by user for this workspace
    db.all(
      'SELECT slack_user_id, COUNT(*) AS crown_count FROM whoknows_crowns WHERE workspace_id = ? GROUP BY slack_user_id ORDER BY crown_count DESC',
      [command.team_id],
      async (err, rows) => {
        if (err) {
          console.error('Error fetching crownboard:', err);
          return respond({
            response_type: 'ephemeral',
            text: '⚠️ Error fetching crownboard.',
          });
        }

        if (!rows || rows.length === 0) {
          return respond({
            response_type: 'ephemeral',
            text: '⚠️ No crowns found.',
          });
        }

        const withNames = await Promise.all(
          rows.map(async (row) => {
            const displayName = await getDisplayName(row.slack_user_id);
            return { ...row, displayName: displayName || 'Unknown user' };
          })
        );

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: ':crown: *Top 10 Crown Holders*',
            },
          },
          { type: 'divider' },
        ];

        const top10 = withNames.slice(0, 10);
        for (let i = 0; i < top10.length; i++) {
          const u = top10[i];
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${i + 1}. ${u.displayName}* — ${u.crown_count} crown${
                u.crown_count === 1 ? '' : 's'
              }`,
            },
          });
        }

        // show user's rank if not in top 10
        const userIndex = withNames.findIndex(
          (u) => u.slack_user_id === targetSlackId
        );
        if (userIndex >= 10) {
          blocks.push({ type: 'divider' });
          const userEntry = withNames[userIndex];
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Your rank: *${userIndex + 1}* — ${userEntry.crown_count} crown${
                userEntry.crown_count === 1 ? '' : 's'
              }`,
            },
          });
        }

        await respond({ response_type: 'in_channel', blocks });
      }
    );
  });
}
