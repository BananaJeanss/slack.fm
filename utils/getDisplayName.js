const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.SLACK_BOT_TOKEN);

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getDisplayName(userId) {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && now - cached.fetched < CACHE_TTL) {
    return cached.name;
  }
  try {
    const res = await web.users.info({ user: userId });
    let name =
      res.user.profile.display_name_normalized ||
      res.user.profile.real_name_normalized ||
      res.user.real_name ||
      res.user.name;

    name = name.replace(/^@+\s*/, '');
    cache.set(userId, { name, fetched: now });

    console.log('debug info:', {
      userId,
      name,
      fetched: now,
      cacheSize: cache.size,
    });
    return name;
  } catch (e) {
    console.warn('Could not fetch display name for', userId, e.message);
    return 'Unknown User';
  }
}

module.exports = getDisplayName;
