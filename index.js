const { App } = require('@slack/bolt');
const express = require('express');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const respondWithFooter = require('./utils/responsefooter');
const validateEnv = require('./utils/validateenv');
const axios = require('axios');
const { filterPayload } = require('./utils/languageFilter/languageFilter');

dotenv.config();

// env validation
validateEnv();

// axios setup
axios.defaults.timeout = 10000; // 10 seconds
axios.defaults.headers.common['User-Agent'] =
  `slack.fm/${process.env.npm_package_version} (+https://github.com/bananajeanss/slack.fm)`;

// Initialize Express app
const expressApp = express();
expressApp.set('trust proxy', 1); // Trust first proxy
expressApp.use(helmet());
expressApp.disable('x-powered-by');
expressApp.use(
  helmet.contentSecurityPolicy({
    directives: { defaultSrc: ["'self'"], imgSrc: ['* data:'] },
  })
);
// ratelimits
const ratelimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
});
expressApp.use(ratelimiter);

// Initialize Slack Bolt app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Middleware
const commandCooldowns = new Map();
const origCommand = app.command.bind(app);
app.command = (commandName, handler) => {
  origCommand(commandName, async (args) => {
    const userId = args.command.user_id;
    const commandKey = `${userId}:${commandName}`;
    const now = Date.now();
    const cooldownTime = 2000;

    if (commandCooldowns.has(commandKey)) {
      const lastUsed = commandCooldowns.get(commandKey);
      const timeLeft = cooldownTime - (now - lastUsed);

      if (timeLeft > 0) {
        return args.respond({
          response_type: 'ephemeral',
          text: `⏱️ Please wait ${Math.ceil(timeLeft / 1000)} second(s) before using ${commandName} again.`,
        });
      }
    }

    commandCooldowns.set(commandKey, now);
    const wrappedRespond = respondWithFooter(args.respond, args.command);

    // use language filtering if enabled
    const languageFiltering =
      process.env.USE_LANGUAGE_FILTERING === 'true' ||
      process.env.USE_LANGUAGE_FILTERING === '1';

    const filteredRespond = async (payload) => {
      if (languageFiltering) {
        payload = filterPayload({ ...payload });
      }
      return wrappedRespond(payload);
    };

    await handler({ ...args, respond: filteredRespond });
  });
};

function clearCooldowns() {
  const now = Date.now();
  commandCooldowns.forEach((lastUsed, key) => {
    if (now - lastUsed > 60 * 1000 * 15) {
      // Clear cooldowns older than 15 minutes
      commandCooldowns.delete(key);
    }
  });
}

setInterval(
  () => {
    clearCooldowns();
  },
  60 * 1000 * 15
); // Clear cooldowns every 15 minutes

// Parse request bodies
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

// Recursively load commands from /commands
const loadCommands = (dir) => {
  fs.readdirSync(dir).forEach((file) => {
    const fullPath = path.join(dir, file);
    if (fs.lstatSync(fullPath).isDirectory()) {
      loadCommands(fullPath);
    } else if (file.endsWith('.js')) {
      try {
        const command = require(fullPath);
        if (typeof command === 'function') {
          command(app);
        } else {
          console.warn(`[COMMAND] Skipped (not a function): ${fullPath}`);
        }
      } catch (err) {
        console.error(`[COMMAND] Failed to load: ${fullPath}`, err);
      }
    }
  });
};
loadCommands(path.join(__dirname, 'commands'));

// linking setup
const viewsPath = path.join(__dirname, 'routes', 'views');
expressApp.use('/lastfm', express.static(viewsPath));
expressApp.use('/lastfm', require('./routes/lastfm'));

// Start the Express server
const PORT = process.env.PORT || 3000;
expressApp.listen(PORT, '0.0.0.0', () => console.log(`Express up on ${PORT}`));

// DB Cleanup
require('./utils/dbcleanup');

// Start the Slack app
(async () => {
  await app.start();
  app.logger.info('⚡️ Slack.fm is running!');
})();
