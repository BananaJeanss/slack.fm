const validateEnv = () => {
  const requiredEnvVars = [
    'SLACK_CLIENT_ID',
    'SLACK_CLIENT_SECRET',
    'SLACK_SIGNING_SECRET',
    'SLACK_BOT_TOKEN',
    'SLACK_APP_TOKEN',
    'LASTFM_API_KEY',
    'LASTFM_SHARED_SECRET',
    'LASTFM_CALLBACK_URL',
    'SPOTIFY_CLIENT_ID',
    'SPOTIFY_CLIENT_SECRET',
  ];

  const missing = requiredEnvVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((varName) => {
      console.error(`   - ${varName}`);
    });
    console.error(
      '\n💡 Please check your .env file and ensure all variables are set.'
    );
    console.error('📄 Reference: .env.example\n');
    process.exit(1);
  }

  if (!process.env.USE_LANGUAGE_FILTERING) {
    process.env.USE_LANGUAGE_FILTERING = 'false';
    console.warn(
      "⚠️ USE_LANGUAGE_FILTERING not set in env, defaulting to 'false'"
    );
  }

  // validate formats
  const validations = [
    {
      name: 'SLACK_BOT_TOKEN',
      pattern: /^xoxb-/,
      message: 'SLACK_BOT_TOKEN should start with "xoxb-"',
    },
    {
      name: 'SLACK_APP_TOKEN',
      pattern: /^xapp-/,
      message: 'SLACK_APP_TOKEN should start with "xapp-"',
    },
    {
      name: 'LASTFM_CALLBACK_URL',
      pattern: /^https?:\/\//,
      message: 'LASTFM_CALLBACK_URL should be a valid URL',
    },
  ];

  const formatErrors = [];
  validations.forEach(({ name, pattern, message }) => {
    if (process.env[name] && !pattern.test(process.env[name])) {
      formatErrors.push(`   - ${message}`);
    }
  });

  if (formatErrors.length > 0) {
    console.error('⚠️  Environment variable format warnings:');
    formatErrors.forEach((error) => console.error(error));
    console.error('');
  }

  console.log('✅ Environment validation passed');
};

module.exports = validateEnv;
