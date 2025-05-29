export default function (app) {
  app.command('/ping', async ({ ack, respond }) => {
    const start = Date.now();
    await ack();
    await respond({
      response_type: 'ephemeral',
      text: `🏓 Pong! (internal latency: ${Date.now() - start}ms)`,
    });
  });
}
