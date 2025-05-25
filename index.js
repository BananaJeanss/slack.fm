const { App } = require("@slack/bolt");
const express = require("express");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
const helmet = require("helmet");
const db = require("./db");

dotenv.config();

// Initialize Express app
const expressApp = express();
expressApp.use(helmet());
expressApp.disable("x-powered-by"); 

// Initialize Slack Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Parse request bodies
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

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

// linking setup
const viewsPath = path.join(__dirname, "routes", "views");
expressApp.use('/lastfm', express.static(viewsPath));
expressApp.use('/lastfm', require('./routes/lastfm'));

// Start the Express server
const PORT = process.env.PORT || 3000;
expressApp.listen(PORT, '0.0.0.0', () =>
  console.log(`Express up on ${PORT}`)
);

// DB Cleanup
require("./dbcleanup");

// Start the Slack app
(async () => {
  await app.start();
  app.logger.info("⚡️ Slack.fm is running!");
})();