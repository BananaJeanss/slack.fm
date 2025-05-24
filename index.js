const { App } = require("@slack/bolt");
const express = require("express");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const db = require("./db");

dotenv.config();

// Initialize Express app
const expressApp = express();

// Initialize Slack Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Parse request bodies
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

// Load routes
expressApp.use(require('./routes/lastfm'));

// Recursively load commands from /commands
const loadCommands = (dir) => {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      loadCommands(fullPath);
    } else if (file.endsWith(".js")) {
      require(fullPath)(app);
    }
  });
};

loadCommands(path.join(__dirname, "commands"));

// Start the Express server
const PORT = process.env.PORT || 3000;
expressApp.listen(PORT, () => {
  console.log(`Express server listening on port ${PORT}`);
});

// Serve static files for views (CSS, images, etc.)
const viewsPath = path.join(__dirname, "routes", "views");
expressApp.use("/lastfm", express.static(viewsPath));

// DB Cleanup
require("./dbcleanup");

// Start the Slack app
(async () => {
  await app.start();
  app.logger.info("⚡️ Slack.fm is running!");
})();