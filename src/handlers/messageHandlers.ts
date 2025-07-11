export async function handleTextMessage(
  conversation: any,
  messageContent: string,
) {
  const command = messageContent.toLowerCase().trim();

  // Handle other commands - keeping existing functionality commented out
  // in case you want to restore them later
  switch (true) {
    case command.toLowerCase().includes('gm'):
      await conversation.send("GM");
      break;

    default:
      return;
  }
}