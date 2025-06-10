import { getRandomValues } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { IdentifierKind, type Client, type Signer } from "@xmtp/node-sdk";
import { fromString, toString } from "uint8arrays";
import { createWalletClient, http, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

interface User {
  key: `0x${string}`;
  account: ReturnType<typeof privateKeyToAccount>;
  wallet: ReturnType<typeof createWalletClient>;
}

export const createUser = (key: string): User => {
  const account = privateKeyToAccount(key as `0x${string}`);
  return {
    key: key as `0x${string}`,
    account,
    wallet: createWalletClient({
      account,
      chain: sepolia,
      transport: http(),
    }),
  };
};

export const createSigner = (key: string): Signer => {
  const sanitizedKey = key.startsWith("0x") ? key : `0x${key}`;
  const user = createUser(sanitizedKey);
  return {
    type: "EOA",
    getIdentifier: () => ({
      identifierKind: IdentifierKind.Ethereum,
      identifier: user.account.address.toLowerCase(),
    }),
    signMessage: async (message: string) => {
      const signature = await user.wallet.signMessage({
        message,
        account: user.account,
      });
      return toBytes(signature);
    },
  };
};

/**
 * Generate a random encryption key
 * @returns The encryption key
 */
export const generateEncryptionKeyHex = () => {
  const uint8Array = getRandomValues(new Uint8Array(32));
  return toString(uint8Array, "hex");
};

/**
 * Get the encryption key from a hex string
 * @param hex - The hex string
 * @returns The encryption key
 */
export const getEncryptionKeyFromHex = (hex: string) => {
  return fromString(hex, "hex");
};

export const getDbPath = (description: string = "xmtp") => {
  // Check if running on Railway or other cloud platforms
  const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH ?? ".data/xmtp";
  
  // Create database directory if it doesn't exist
  if (!fs.existsSync(volumePath)) {
    fs.mkdirSync(volumePath, { recursive: true });
  }
  return `${volumePath}/${description}.db3`;
};

export const logAgentDetails = async (client: Client<any>): Promise<void> => {
  const address = client.accountIdentifier?.identifier as string;
  const inboxId = client.inboxId;
  const environment = client.options?.env ?? "dev";

  console.log(`\x1b[38;2;252;76;52m
      ██╗  ██╗███╗   ███╗████████╗██████╗ 
      ╚██╗██╔╝████╗ ████║╚══██╔══╝██╔══██╗
       ╚███╔╝ ██╔████╔██║   ██║   ██████╔╝
       ██╔██╗ ██║╚██╔╝██║   ██║   ██╔═══╝ 
      ██╔╝ ██╗██║ ╚═╝ ██║   ██║   ██║     
      ╚═╝  ╚═╝╚═╝     ╚═╝   ╚═╝   ╚═╝     
    \x1b[0m`);

  const urls = [`http://xmtp.chat/dm/${address}`];
  const conversations = await client.conversations.list();
  const installations = await client.preferences.inboxState();

  console.log(`
  ✓ TBA Chat Bot Agent:
  • Address: ${address}
  • Installations: ${installations.installations.length}
  • Conversations: ${conversations.length}
  • InboxId: ${inboxId}
  • Network: ${environment}
  ${urls.map((url) => `• URL: ${url}`).join("\n")}`);
};

export function validateEnvironment(vars: string[]): Record<string, string> {
  const missing = vars.filter((v) => !process.env[v]);

  if (missing.length) {
    try {
      const envPath = path.resolve(process.cwd(), ".env");
      if (fs.existsSync(envPath)) {
        const envVars = fs
          .readFileSync(envPath, "utf-8")
          .split("\n")
          .filter((line) => line.trim() && !line.startsWith("#"))
          .reduce<Record<string, string>>((acc, line) => {
            const [key, ...val] = line.split("=");
            if (key && val.length) acc[key.trim()] = val.join("=").trim();
            return acc;
          }, {});

        missing.forEach((v) => {
          if (envVars[v]) process.env[v] = envVars[v];
        });
      }
    } catch (e) {
      console.error("Error reading .env file:", e);
    }

    const stillMissing = vars.filter((v) => !process.env[v]);
    if (stillMissing.length) {
      console.error("Missing env vars:", stillMissing.join(", "));
      process.exit(1);
    }
  }

  return vars.reduce<Record<string, string>>((acc, key) => {
    acc[key] = process.env[key] as string;
    return acc;
  }, {});
} 