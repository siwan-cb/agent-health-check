import {
  createSigner,
  getEncryptionKeyFromHex,
  logAgentDetails,
  validateEnvironment,
} from "./helpers/client.js";
import { getWalletAddressFromInboxId } from "./helpers/utils.js";
import { getBasename } from "./helpers/basenames.js";
import { Client, type XmtpEnv } from "@xmtp/node-sdk";
import { 
  handleTextMessage, 
} from "./handlers/messageHandlers.js";
import type { Address } from "viem";

// Validate required environment variables
const { WALLET_KEY, ENCRYPTION_KEY, XMTP_ENV, NETWORK_ID } = validateEnvironment([
  "WALLET_KEY",
  "ENCRYPTION_KEY",
  "XMTP_ENV",
  "NETWORK_ID",
]);

// Address to skip tracking for
const SKIP_TRACKING_ADDRESS = "0xA5A79Fb7E772b51B12200B2f6282b1beE36dC3cE";

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

async function main() {
  console.log("🚀 Starting Agent Health Check...");
  
  try {
    // Create XMTP client
    const signer = createSigner(WALLET_KEY);
    const dbEncryptionKey = getEncryptionKeyFromHex(ENCRYPTION_KEY);
    
    const client = await Client.create(signer, {
      dbEncryptionKey,
      env: XMTP_ENV as XmtpEnv,
      codecs: [],
    });

    const identifier = await signer.getIdentifier();
    const agentAddress = identifier.identifier;
    
    void logAgentDetails(client);

    // Sync conversations
    console.log("🔄 Syncing conversations...");
    await client.conversations.sync();

    console.log("👂 Listening for messages...");
    
    // Track active conversations for GM broadcasting
    const activeConversations = new Set<string>();
    
    // Broadcasting control - starts disabled
    const broadcastingControl = { isActive: true };
    
    // Message tracking - store message history
    const messageHistory: MessageRecord[] = [];
    
    // Track unique senders by wallet address
    const uniqueSenders = new Set<string>();
    const uniqueWalletAddresses = new Set<string>();
    
    // Track agent responses to each sender
    const agentResponses = new Map<string, AgentResponse>();
    
    // Helper function to get display name for logging
    const getDisplayNameForLogging = async (address: string): Promise<string> => {
      try {
        const basename = await getBasename(address as Address);
        if (basename) {
          return `${basename} (${address})`;
        }
      } catch (error) {
        // Silently handle errors for logging
      }
      return address;
    };
    
    // Function to update agent response tracking
    const updateAgentResponse = (senderInboxId: string, senderAddress: string, conversationId: string) => {
      const existingResponse = agentResponses.get(senderInboxId);
      if (existingResponse) {
        existingResponse.lastResponseTime = new Date();
      } else {
        agentResponses.set(senderInboxId, {
          senderInboxId,
          senderAddress,
          lastResponseTime: new Date(),
          conversationId,
        });
      }
    };
    
    // Set up ping and GM broadcasting every 2 minutes to reduce RPC load
    const broadcastInterval = setInterval(async () => {
      if (!broadcastingControl.isActive) {
        return; // Skip broadcasting if not active
      }
      
      console.log("📢 Broadcasting ping and GM to active conversations...");
      
      for (const conversationId of activeConversations) {
        try {
          const conversation = await client.conversations.getConversationById(conversationId);
          if (conversation) {
            // Find the senderInboxId for this conversation from message history
            const conversationMessages = messageHistory.filter(msg => msg.conversationId === conversationId);
            if (conversationMessages.length > 0) {
              const latestMessage = conversationMessages[conversationMessages.length - 1];
              
              // Skip broadcasting to excluded address
              if (latestMessage.senderAddress.toLowerCase() === SKIP_TRACKING_ADDRESS.toLowerCase()) {
                console.log(`🚫 Skipping broadcast to excluded address: ${latestMessage.senderAddress}`);
                continue;
              }
              
              await conversation.send("ping");
              await conversation.send("GM");
              console.log(`✅ Sent ping and GM to conversation: ${conversationId}`);
              
              updateAgentResponse(latestMessage.senderInboxId, latestMessage.senderAddress, conversationId);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to send ping and GM to conversation ${conversationId}:`, error);
          // Remove failed conversation from active set
          activeConversations.delete(conversationId);
        }
      }
    }, 120000); // 2 minutes
    
    // Keep the bot running with proper error handling
    while (true) {
      try {
        const stream = await client.conversations.streamAllMessages();

        for await (const message of stream) {
          try {
            // Skip messages from the agent itself
            if (!message || message.senderInboxId.toLowerCase() === client.inboxId.toLowerCase()) {
              continue;
            }

            // Get sender address early for display purposes
            const senderAddress = await getWalletAddressFromInboxId(client, message.senderInboxId);
            
            if (!senderAddress) {
              console.log("❌ Unable to find sender address, skipping");
              continue;
            }

            // Skip tracking for specific address
            if (senderAddress.toLowerCase() === SKIP_TRACKING_ADDRESS.toLowerCase()) {
              console.log(`🚫 Skipping tracking for address: ${senderAddress}`);
              
              // Still handle the message but don't track it
              const conversation = await client.conversations.getConversationById(
                message.conversationId
              );

              if (conversation && message.contentType?.typeId === "text") {
                await handleTextMessage(
                  conversation,
                  message.content as string,
                  broadcastingControl,
                  messageHistory,
                  uniqueSenders,
                  agentResponses
                );
              }
              continue;
            }

            // Get display name for logging
            const displayName = await getDisplayNameForLogging(senderAddress);

            // Track message details
            const messageRecord: MessageRecord = {
              senderInboxId: message.senderInboxId,
              senderAddress: senderAddress,
              timestamp: new Date(),
              conversationId: message.conversationId,
              messageContent: message.contentType?.typeId === "text" ? message.content as string : undefined,
              contentType: message.contentType?.typeId || "unknown"
            };
            
            // Add to message history
            messageHistory.push(messageRecord);
            
            // Track unique senders
            const isNewSender = !uniqueSenders.has(message.senderInboxId);
            const isNewWalletAddress = !uniqueWalletAddresses.has(senderAddress);
            uniqueSenders.add(message.senderInboxId);
            uniqueWalletAddresses.add(senderAddress);
            
            console.log(
              `📨 Received: ${message.contentType?.typeId} from ${displayName} at ${messageRecord.timestamp.toISOString()}`
            );
            
            // Log new sender information
            if (isNewSender) {
              console.log(`🆕 New sender detected: ${displayName}`);
            }
            
            // Log message tracking stats
            console.log(`📊 Message tracking stats: ${messageHistory.length} total messages from ${uniqueWalletAddresses.size} unique wallet addresses`);

            const conversation = await client.conversations.getConversationById(
              message.conversationId
            );

            if (!conversation) {
              console.log("❌ Unable to find conversation, skipping");
              continue;
            }

            // Add conversation to active set for GM broadcasting
            activeConversations.add(message.conversationId);

            // Handle different message types
            if (message.contentType?.typeId === "text") {
              const responsePromise = handleTextMessage(
                conversation,
                message.content as string,
                broadcastingControl,
                messageHistory,
                uniqueSenders,
                agentResponses
              );
              
              // Update agent response tracking after handling the message
              await responsePromise;
              updateAgentResponse(message.senderInboxId, senderAddress, message.conversationId);
            }
          } catch (messageError: unknown) {
            const errorMessage = messageError instanceof Error ? messageError.message : String(messageError);
            console.error("❌ Error processing individual message:", errorMessage);
            try {
              const conversation = await client.conversations.getConversationById(
                message?.conversationId || ""
              );
              if (conversation && message) {
                await conversation.send(
                  `❌ Error processing message: ${errorMessage}`
                );
                // Update response tracking for error messages too
                const errorSenderAddress = await getWalletAddressFromInboxId(client, message.senderInboxId);
                if (errorSenderAddress) {
                  updateAgentResponse(message.senderInboxId, errorSenderAddress, message.conversationId);
                }
              }
            } catch (sendError) {
              console.error("❌ Failed to send error message to conversation:", sendError);
            }
          }
        }
      } catch (streamError: unknown) {
        const errorMessage = streamError instanceof Error ? streamError.message : String(streamError);
        console.error("❌ Stream error occurred:", errorMessage);
        console.log("🔄 Attempting to reconnect in 5 seconds...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Re-sync conversations before attempting to recreate stream
        try {
          await client.conversations.sync();
          console.log("✅ Conversations re-synced successfully");
        } catch (syncError) {
          console.error("❌ Failed to sync conversations:", syncError);
        }
      }
    }
  } catch (error) {
    console.error("💥 Initialization error:", error);
    console.log("🔄 Bot failed to initialize. Please check your configuration and try again.");
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down Agent Health Check...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n👋 Shutting down Agent Health Check...");
  process.exit(0);
});

// Start the bot
main().catch((error) => {
  console.error("💥 Unhandled error:", error);
  process.exit(1);
}); 