import db from '../../utils/db.js';

const linkedCountCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const responseText = `users have linked their last.fm accounts in this workspace.`;

export default function (app) {
  app.command('/linkedcount', async ({ ack, respond, command }) => {
    await ack();

    const workspaceId = command.team_id;
    const cacheKey = `linked_count_${workspaceId}`;
    const now = Date.now();

    // Check if we have a cached result
    const cached = linkedCountCache.get(cacheKey);
    if (cached && now - cached.timestamp < CACHE_DURATION) {
      return respond({
        text: `📊 *${cached.count}* ${responseText}`,
      });
    }

    // if not cached, query the database
    db.get(
      'SELECT COUNT(*) as count FROM user_links WHERE workspace_id = ?',
      [workspaceId],
      (err, row) => {
        if (err) {
          console.error('Database error:', err);
          return respond({
            text: '❌ Database error. Please try again later.',
          });
        }

        const count = row ? row.count : 0;

        // Cache the result
        linkedCountCache.set(cacheKey, {
          count: count,
          timestamp: now,
        });

        // clear up old cache entries
        cleanupCache();

        respond({
          text: `📊 *${count}* ${responseText}`,
        });
      }
    );
  });
}

function cleanupCache() {
  const now = Date.now();
  linkedCountCache.forEach((value, key) => {
    if (now - value.timestamp > CACHE_DURATION) {
      linkedCountCache.delete(key);
    }
  });
}

// cleanup every 30 minutes
setInterval(cleanupCache, CACHE_DURATION);
