// Interface for tracking message history
interface MessageRecord {
  senderInboxId: string;
  senderAddress: string;
  timestamp: Date;
  conversationId: string;
  messageContent?: string;
  contentType: string;
}

// Interface for tracking agent responses
interface AgentResponse {
  senderInboxId: string;
  senderAddress: string;
  lastResponseTime: Date;
  conversationId: string;
}

export async function handleTextMessage(
  conversation: any,
  messageContent: string,
  broadcastingControl?: { isActive: boolean },
  messageHistory?: MessageRecord[],
  uniqueSenders?: Set<string>,
  agentResponses?: Map<string, AgentResponse>
) {
  const command = messageContent.toLowerCase().trim();

  // Handle other commands - keeping existing functionality commented out
  // in case you want to restore them later
  switch (true) {
    case command === '/start':
      if (broadcastingControl) {
        // Send immediate GM
        await conversation.send("GM");
        
        // Enable broadcasting
        broadcastingControl.isActive = true;
        
        // Send confirmation message
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

    case command === '/status':
      if (broadcastingControl) {
        const status = broadcastingControl.isActive ? "🟢 Active" : "🔴 Inactive";
        const statusMessage = `📡 **Broadcasting Status**\n\nGM Broadcasting: ${status}`;
        await conversation.send(statusMessage);
      } else {
        await conversation.send("❌ Broadcasting control not available.");
      }
      break;

    case command === '/stats':
      if (messageHistory && uniqueSenders) {
        const totalMessages = messageHistory.length;
        const uniqueWalletAddresses = new Set(messageHistory.map(record => record.senderAddress));
        const totalSenders = uniqueWalletAddresses.size;
        const broadcastStatus = broadcastingControl?.isActive ? "🟢 Active" : "🔴 Inactive";
        
        // Get recent messages (last 5)
        const recentMessages = messageHistory.slice(-5).map(record => 
          `  • ${record.senderAddress.substring(0, 8)}...${record.senderAddress.slice(-6)} at ${record.timestamp.toLocaleString()}`
        ).join('\n');
        
        // Get sender frequency by wallet address
        const senderCount = new Map<string, number>();
        messageHistory.forEach(record => {
          senderCount.set(record.senderAddress, (senderCount.get(record.senderAddress) || 0) + 1);
        });
        
        const topSenders = Array.from(senderCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([senderAddress, count]) => `  • ${senderAddress.substring(0, 8)}...${senderAddress.slice(-6)}: ${count} messages`)
          .join('\n');

        const statsMessage = `📊 **Message Tracking Stats**

🔢 Total Messages: ${totalMessages}
👥 Unique Wallet Addresses: ${totalSenders}
📡 GM Broadcasting: ${broadcastStatus}

🕐 Recent Messages:
${recentMessages || '  No messages yet'}

🔝 Top Senders:
${topSenders || '  No senders yet'}`;

        await conversation.send(statsMessage);
      } else {
        await conversation.send("❌ Message tracking not available.");
      }
      break;

    case command === '/report':
      if (agentResponses) {
        const now = new Date();
        const responses = Array.from(agentResponses.values());
        
        if (responses.length === 0) {
          await conversation.send("📋 **Agent Response Report**\n\nNo responses tracked yet.");
          break;
        }
        
        // Function to get status indicator based on time difference
        const getStatusIndicator = (lastResponseTime: Date): string => {
          const diffMs = now.getTime() - lastResponseTime.getTime();
          const diffSeconds = Math.floor(diffMs / 1000);
          
          if (diffSeconds < 30) {
            return "🟢"; // Green - less than 30 seconds
          } else if (diffSeconds < 60) {
            return "🟡"; // Yellow - 30 seconds to 1 minute
          } else {
            return "🔴"; // Red - longer than 1 minute
          }
        };
        
        // Function to get human-readable time difference
        const getTimeDifference = (lastResponseTime: Date): string => {
          const diffMs = now.getTime() - lastResponseTime.getTime();
          const diffSeconds = Math.floor(diffMs / 1000);
          const diffMinutes = Math.floor(diffSeconds / 60);
          const diffHours = Math.floor(diffMinutes / 60);
          
          if (diffHours > 0) {
            return `${diffHours}h ${diffMinutes % 60}m ago`;
          } else if (diffMinutes > 0) {
            return `${diffMinutes}m ${diffSeconds % 60}s ago`;
          } else {
            return `${diffSeconds}s ago`;
          }
        };
        
        // Sort responses by most recent first
        responses.sort((a, b) => b.lastResponseTime.getTime() - a.lastResponseTime.getTime());
        
        const reportLines = responses.map(response => {
          const status = getStatusIndicator(response.lastResponseTime);
          const timeDiff = getTimeDifference(response.lastResponseTime);
          const walletAddress = `${response.senderAddress.substring(0, 8)}...${response.senderAddress.slice(-6)}`;
          
          return `  ${status} ${walletAddress} - ${timeDiff}`;
        }).join('\n');
        
        const reportMessage = `📋 **Agent Response Report**

🤖 Agent Status by Wallet Address:
${reportLines}

Legend:
🟢 Active (< 30s ago)
🟡 Recent (30s - 1m ago)  
🔴 Inactive (> 1m ago)

Total Active Conversations: ${responses.length}`;

        await conversation.send(reportMessage);
      } else {
        await conversation.send("❌ Agent response tracking not available.");
      }
      break;

    case command.toLowerCase().includes('gm'):
      await conversation.send("GM");
      break;

    default:
      return;
  }
}