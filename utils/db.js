const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./slackfm.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS user_links (
      slack_user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      lastfm_username TEXT NOT NULL,
      session_key TEXT,
      PRIMARY KEY (slack_user_id, workspace_id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS roast_usage (
      slack_user_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS link_states (
      slack_user_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (slack_user_id, workspace_id, state)
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS workspace_tokens (
    workspace_id TEXT NOT NULL PRIMARY KEY,
    access_token TEXT NOT NULL,
    bot_user_id TEXT NOT NULL,
    installed_at INTEGER NOT NULL
  )
  `);

  db.run(
    `CREATE INDEX IF NOT EXISTS idx_roast_time ON roast_usage(slack_user_id, timestamp)`
  );

  db.run("PRAGMA journal_mode=WAL;");
});

module.exports = db;