export default function (app) {
  app.command('/about', async ({ ack, respond }) => {
    await ack();

    const uptime = process.uptime();
    const days = Math.floor(uptime / (24 * 60 * 60));
    const hours = Math.floor((uptime % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((uptime % (60 * 60)) / 60);
    const seconds = Math.floor(uptime % 60);
    const uptimeText = `:clock1: Uptime: ${days}d ${hours}h ${minutes}m ${seconds}s`;

    const aboutText = `
*slack.fm* – A Last.fm bot for Slack :musical_note:

• Link your Last.fm account and show off your music stats.
• View your or others' now playing track, profile, top artists, albums, and songs.
• Get fun roasts of your music taste.
• See detailed stats for songs, albums, and artists.

${uptimeText}

_View <https://github.com/bananajeanss/slack.fm/commands.md|commands.md> for all commands._

<https://github.com/bananajeanss/slack.fm|GitHub Repo>
        `;

    await respond({
      response_type: 'ephemeral',
      text: aboutText,
    });
  });
}
