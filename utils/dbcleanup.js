const db = require('./db');

function cleanup() {
  // Clear roast ratelimit database
  const cutoff = Date.now() - 3 * 86400 * 1000; // 3 days
  db.run('DELETE FROM roast_usage WHERE timestamp < ?', [cutoff]);

  // Clear link states older than 10 minutes
  db.run('DELETE FROM link_states WHERE created_at < ?', [
    Date.now() - 10 * 60 * 1000,
  ]);
}
cleanup();

// every 2 hours
setInterval(cleanup, 60 * 60 * 2000);
