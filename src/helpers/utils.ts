import { type Client } from "@xmtp/node-sdk";

/**
 * Convert senderInboxId to wallet address
 * @param client - The XMTP client instance
 * @param senderInboxId - The sender's inbox ID
 * @returns The wallet address or null if not found
 */
export async function getWalletAddressFromInboxId(
  client: Client,
  senderInboxId: string
): Promise<string | null> {
  try {
    const inboxState = await client.preferences.inboxStateFromInboxIds([
      senderInboxId,
    ]);
    return inboxState[0]?.identifiers[0]?.identifier || null;
  } catch (error) {
    console.error(`❌ Failed to get wallet address for inbox ID ${senderInboxId}:`, error);
    return null;
  }
}

export function getExplorerUrl(txHash: string, networkId: string): string {
  // Handle hex chain IDs
  const chainId = networkId.startsWith('0x') ? parseInt(networkId, 16) : networkId;
  
  switch (chainId) {
    case 8453:
    case "8453":
    case "base-mainnet":
      return `https://basescan.org/tx/${txHash}`;
    case 84532:
    case "84532":
    case "base-sepolia":
      return `https://sepolia.basescan.org/tx/${txHash}`;
    case 1:
    case "1":
    case "ethereum-mainnet":
      return `https://etherscan.io/tx/${txHash}`;
    case 11155111:
    case "11155111":
    case "ethereum-sepolia":
      return `https://sepolia.etherscan.io/tx/${txHash}`;
    default:
      console.log(`Unknown network ID: ${networkId} (chainId: ${chainId}), defaulting to etherscan`);
      return `https://etherscan.io/tx/${txHash}`;
  }
} 