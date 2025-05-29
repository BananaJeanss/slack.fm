// adds a footer which displays the user who ran the command and the time it was run
export function respondWithFooter(respond, command) {
  return async (payload) => {
    // Only add to block responses
    if (payload && payload.blocks && Array.isArray(payload.blocks)) {
      payload.blocks.push(
        { type: 'divider' },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Command run by <@${command.user_id}> at <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} {time}|${new Date().toLocaleString()}>`,
            },
          ],
        }
      );
    }
    return respond(payload);
  };
}
