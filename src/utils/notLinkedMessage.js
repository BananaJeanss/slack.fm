export default function notLinkedMessage(
  targetSlackId,
  currentUserId,
  respond
) {
  const msg =
    targetSlackId === currentUserId
      ? "⚠️ You haven't linked your Last.fm profile. Use `/linklastfm` first!"
      : "⚠️ That user hasn't linked Last.fm.";

  return respond({ response_type: 'ephemeral', text: msg });
}
