export async function handleTextMessage(
  conversation: any,
  messageContent: string,
  broadcastingControl?: { isActive: boolean }
) {
  const command = messageContent.toLowerCase().trim();

  // Handle other commands - keeping existing functionality commented out
  // in case you want to restore them later
  switch (true) {
    case command === '/start':
      if (broadcastingControl) {
        broadcastingControl.isActive = true;
        await conversation.send("🚀 GM broadcasting started! I'll send GM every 30 seconds.");
      } else {
        await conversation.send("❌ Broadcasting control not available.");
      }
      break;

    case command === '/stop':
      if (broadcastingControl) {
        broadcastingControl.isActive = false;
        await conversation.send("🛑 GM broadcasting stopped.");
      } else {
        await conversation.send("❌ Broadcasting control not available.");
      }
      break;

    case command.toLowerCase().includes('gm'):
      await conversation.send("GM");
      break;

    default:
      return;
  }
}