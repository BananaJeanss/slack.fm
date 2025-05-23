const { App } = require("@slack/bolt");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  port: process.env.PORT || 3000,
});

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

(async () => {
  await app.start();
  app.logger.info("⚡️ Slack.fm is running!");
})();
