const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./slackfm.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_links (
      slack_user_id TEXT PRIMARY KEY,
      lastfm_username TEXT NOT NULL,
      session_key TEXT
    )
  `);
});

module.exports = db;