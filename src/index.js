import bolt from '@slack/bolt';
const { App } = bolt;
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import axios from 'axios';
import { fileURLToPath, pathToFileURL } from 'url';

// local imports
import { respondWithFooter } from './utils/responsefooter.js';
import { validateEnv } from './utils/validateenv.js';
import { filterPayload } from './utils/languageFilter/languageFilter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
const loadCommands = async (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      await loadCommands(fullPath);
    } else if (file.endsWith('.js')) {
      try {
        const moduleUrl = pathToFileURL(fullPath).href;
        const commandModule = await import(moduleUrl);
        if (typeof commandModule.default === 'function') {
          commandModule.default(app);
        } else {
          console.warn(`[COMMAND] Skipped (not a function): ${fullPath}`);
        }
      } catch (err) {
        console.error(`[COMMAND] Failed to load: ${fullPath}`, err);
      }
    }
  }
};
await loadCommands(path.join(__dirname, 'commands'));

// linking setup
const viewsPath = path.join(__dirname, 'routes', 'views');
expressApp.use('/lastfm', express.static(viewsPath));
expressApp.use('/lastfm', (await import('./routes/lastfm.js')).default);

// health check
expressApp.use('/health', (req, res) => {
  res.status(200);
  res.json({ status: 'ok', timestamp: Date.now(), uptime: process.uptime() });
});

// Start the Express server
const PORT = process.env.PORT || 3000;
expressApp.listen(PORT, '0.0.0.0', () =>
  console.log(`🌐 Express up on port ${PORT}`)
);

// DB Cleanup
await import('./utils/dbcleanup.js');

// Start the Slack app
(async () => {
  await app.start();

  try {
    const auth = await app.client.auth.test({
      token: process.env.SLACK_BOT_TOKEN,
    });
    app.logger.info(
      `⚡️ Slack.fm is running! Workspace: ${auth.team} (${auth.team_id})`
    );
  } catch (err) {
    app.logger.warn(
      `⚡️ Slack.fm is running! (Could not fetch workspace info)`
    );
  }
})();
