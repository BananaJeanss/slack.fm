const db = require("../../db");

module.exports = (app) => {
  // /unlink command
  app.command("/unlink", async ({ ack, respond, command }) => {
    await ack();

    try {
      // fetch the link record for this user in this workspace
      const userLink = await new Promise((resolve, reject) => {
        db.get(
          "SELECT lastfm_username FROM user_links WHERE slack_user_id = ? AND workspace_id = ? AND workspace_id = ?",
          [command.user_id, command.team_id],
          (err, row) => {
            if (err) {
              console.error("DB error fetching user link:", err);
              return reject(err);
            }
            resolve(row);
          }
        );
      });

      if (!userLink) {
        return await respond({
          response_type: "ephemeral",
          text: "❌ You are not linked to any Last.fm account.",
        });
      }

      // ask for confirmation with a Block Kit button
      await respond({
        response_type: "ephemeral",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `⚠️ Are you sure you want to unlink your Last.fm account *${userLink.lastfm_username}*?`
            }
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Unlink"
                },
                style: "danger",
                action_id: "confirm_unlink",
                value: `${command.user_id}|${command.team_id}` // Pass both user and workspace
              }
            ]
          }
        ]
      });
    } catch (err) {
      console.error("Error in /unlink command:", err);
      await respond({
        response_type: "ephemeral",
        text: "⚠️ Something went wrong. Please try again later."
      });
    }
  });

  // single handler for the confirmation button
  app.action("confirm_unlink", async ({ ack, body, action, respond }) => {
    await ack();

    // Extract both user and workspace ID
    const [slackUserId, workspaceId] = action.value.split("|");

    db.run(
      "DELETE FROM user_links WHERE slack_user_id = ? AND workspace_id = ? AND workspace_id = ?",
      [slackUserId, workspaceId],
      (err) => {
        if (err) {
          console.error("DB error deleting link:", err);
          return respond({
            response_type: "ephemeral",
            text: "❌ Failed to unlink your account. Please try again."
          });
        }

        respond({
          response_type: "ephemeral",
          text: "✅ Your Last.fm account has been successfully unlinked."
        });
      }
    );
  });
};