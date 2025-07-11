import { getBasename } from "../helpers/basenames.js";
import type { Address } from "viem";

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

/**
 * Get display name for an address - basename if available, otherwise shortened address
 */
async function getDisplayName(address: string): Promise<string> {
  try {
    const basename = await getBasename(address as Address);
    if (basename) {
      console.log(`Using basename ${basename} for address ${address}`);
      return basename;
    } else {
      console.log(`No basename found for ${address}, using shortened address`);
    }
  } catch (error) {
    console.error("Error getting basename for address:", address, error);
  }
  
  // Fallback to shortened address
  const shortened = `${address.substring(0, 8)}...${address.slice(-6)}`;
  console.log(`Using shortened address ${shortened} for ${address}`);
  return shortened;
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
        
        // Get recent messages (last 5) with basename resolution
        const recentMessages = await Promise.all(
          messageHistory.slice(-5).map(async (record) => {
            const displayName = await getDisplayName(record.senderAddress);
            return `  • ${displayName} at ${record.timestamp.toLocaleString()}`;
          })
        );
        
        // Get sender frequency by wallet address
        const senderCount = new Map<string, number>();
        messageHistory.forEach(record => {
          senderCount.set(record.senderAddress, (senderCount.get(record.senderAddress) || 0) + 1);
        });
        
        const topSendersData = Array.from(senderCount.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);
        
        const topSenders = await Promise.all(
          topSendersData.map(async ([senderAddress, count]) => {
            const displayName = await getDisplayName(senderAddress);
            return `  • ${displayName}: ${count} messages`;
          })
        );

        const statsMessage = `📊 **Message Tracking Stats**

🔢 Total Messages: ${totalMessages}
👥 Unique Wallet Addresses: ${totalSenders}
📡 GM Broadcasting: ${broadcastStatus}

🕐 Recent Messages:
${recentMessages.join('\n') || '  No messages yet'}

🔝 Top Senders:
${topSenders.join('\n') || '  No senders yet'}`;

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
        
        const reportLines = await Promise.all(
          responses.map(async (response) => {
            const status = getStatusIndicator(response.lastResponseTime);
            const timeDiff = getTimeDifference(response.lastResponseTime);
            const displayName = await getDisplayName(response.senderAddress);
            
            return `  ${status} ${displayName} - ${timeDiff}`;
          })
        );
        
        const reportMessage = `📋 **Agent Response Report**

🤖 Agent Status:
${reportLines.join('\n')}

Legend:
🟢 Active (< 30s ago)
🟡 Recent (30s - 1m ago)  
🔴 Inactive (> 1m ago)

Total Agents: ${responses.length}`;

        await conversation.send(reportMessage);
      } else {
        await conversation.send("❌ Agent response tracking not available.");
      }
      break;

    case command === '/profile':
      // Get the conversation participants to determine who's asking
      const participants = conversation.members || [];
      let requestingAddress = null;
      
      // Try to find the requesting address from conversation context
      // This will depend on your conversation structure
      if (participants.length > 0) {
        requestingAddress = participants[0]; // This may need adjustment based on your conversation structure
      }
      break;

    case command.toLowerCase().includes('gm'):
      await conversation.send("GM");
      break;

    default:
      return;
  }
}