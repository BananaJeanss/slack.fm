export default function (app) {
  app.command('/slackfmcommands', async ({ ack, respond }) => {
    await ack();

    const commandsText = `
*🎵 slack.fm Commands*

*Basic Commands:*
• \`/link\` - Link your Last.fm account
• \`/nowplaying\` - Show current/last played track
• \`/artist\` - Show info about last played artist
• \`/album\` - Show info about last played album
• \`/song\` - Show info about last played song
• \`/whoknows\` - Top listeners for an artist
• \`/profile\` - Show Last.fm profile stats

View more commands at: <https://github.com/bananajeanss/slack.fm/blob/main/commands.md|commands.md>`;

    await respond({
      response_type: 'ephemeral',
      text: commandsText,
    });
  });
}
