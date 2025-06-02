import db from './db.js';

function roastCleanup() {
  // Clear roast ratelimit database
  const cutoff = Date.now() - 3 * 86400 * 1000; // 3 days
  db.run('DELETE FROM roast_usage WHERE timestamp < ?', [cutoff]);
}
roastCleanup();

function linkstatesCleanup() {
  // Clear link states older than 10 minutes
  db.run('DELETE FROM link_states WHERE created_at < ?', [
    Date.now() - 10 * 60 * 1000,
  ]);
}
linkstatesCleanup();

// every 2 hours
setInterval(roastCleanup, 60 * 60 * 2000);

// every 10 minutes
setInterval(linkstatesCleanup, 10 * 60 * 1000);
