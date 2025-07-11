import {
  Address,
  createPublicClient,
  encodePacked,
  http,
  keccak256,
  namehash,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import L2ResolverAbi from "../abis/L2ResolverAbi.js";

// Base L2 resolver address
const BASENAME_L2_RESOLVER_ADDRESS = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as Address;

// Create a public client for Base
const baseClient = createPublicClient({
  chain: base,
  transport: http(),
});

export type BaseName = string;

export enum BasenameTextRecordKeys {
  Description = "description",
  Keywords = "keywords",
  URL = "url",
  Email = "email",
  Phone = "phone",
  Github = "com.github",
  Twitter = "com.twitter",
  Instagram = "com.instagram",
  LinkedIn = "com.linkedin",
  Discord = "com.discord",
  Telegram = "org.telegram",
  Avatar = "avatar",
}

/**
 * Converts an address to a reverse node for ENS lookups
 * @param address - The address to convert
 * @param chainId - The chain ID
 * @returns The reverse node as bytes32
 */
export function convertReverseNodeToBytes(address: Address, chainId: number): Hex {
  const addressFormatted = address.toLowerCase().replace('0x', '');
  const reverseName = `${addressFormatted}.addr.reverse`;
  return namehash(reverseName);
}

/**
 * Resolves an address to its basename
 * @param address - The address to resolve
 * @returns The basename or null if not found
 */
export async function getBasename(address: Address): Promise<BaseName | null> {
  try {
    const addressReverseNode = convertReverseNodeToBytes(address, base.id);
    
    const basename = await baseClient.readContract({
      abi: L2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "name",
      args: [addressReverseNode],
    });

    if (basename && basename.length > 0) {
      return basename as BaseName;
    }
    return null;
  } catch (error) {
    console.error("Error resolving basename:", error);
    return null;
  }
}

/**
 * Gets the avatar for a basename
 * @param basename - The basename to get avatar for
 * @returns The avatar URL or null if not found
 */
export async function getBasenameAvatar(basename: BaseName): Promise<string | null> {
  try {
    const node = namehash(basename);
    
    const avatar = await baseClient.readContract({
      abi: L2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "avatar",
      args: [node],
    });

    if (avatar && avatar.length > 0) {
      return avatar;
    }
    return null;
  } catch (error) {
    console.error("Error resolving basename avatar:", error);
    return null;
  }
}

/**
 * Gets a text record for a basename
 * @param basename - The basename to get text record for
 * @param key - The text record key
 * @returns The text record value or null if not found
 */
export async function getBasenameTextRecord(
  basename: BaseName,
  key: BasenameTextRecordKeys
): Promise<string | null> {
  try {
    const node = namehash(basename);
    
    const textRecord = await baseClient.readContract({
      abi: L2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "text",
      args: [node, key],
    });

    if (textRecord && textRecord.length > 0) {
      return textRecord;
    }
    return null;
  } catch (error) {
    console.error("Error resolving basename text record:", error);
    return null;
  }
}

/**
 * Gets the address for a basename
 * @param basename - The basename to resolve
 * @returns The address or null if not found
 */
export async function getBasenameAddress(basename: BaseName): Promise<Address | null> {
  try {
    const node = namehash(basename);
    
    const address = await baseClient.readContract({
      abi: L2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      functionName: "addr",
      args: [node],
    });

    if (address && address !== "0x0000000000000000000000000000000000000000") {
      return address as Address;
    }
    return null;
  } catch (error) {
    console.error("Error resolving basename address:", error);
    return null;
  }
}

/**
 * Checks if a basename is available
 * @param basename - The basename to check
 * @returns True if available, false if taken
 */
export async function isBasenameAvailable(basename: BaseName): Promise<boolean> {
  try {
    const address = await getBasenameAddress(basename);
    return address === null;
  } catch (error) {
    console.error("Error checking basename availability:", error);
    return false;
  }
}

/**
 * Gets multiple text records for a basename
 * @param basename - The basename to get text records for
 * @param keys - Array of text record keys to retrieve
 * @returns Object with text record values
 */
export async function getBasenameTextRecords(
  basename: BaseName,
  keys: BasenameTextRecordKeys[]
): Promise<Record<string, string | null>> {
  const results: Record<string, string | null> = {};
  
  for (const key of keys) {
    results[key] = await getBasenameTextRecord(basename, key);
  }
  
  return results;
}

/**
 * Gets comprehensive profile information for a basename
 * @param basename - The basename to get profile for
 * @returns Profile information object
 */
export async function getBasenameProfile(basename: BaseName) {
  const [avatar, address, textRecords] = await Promise.all([
    getBasenameAvatar(basename),
    getBasenameAddress(basename),
    getBasenameTextRecords(basename, [
      BasenameTextRecordKeys.Description,
      BasenameTextRecordKeys.Twitter,
      BasenameTextRecordKeys.Github,
      BasenameTextRecordKeys.Discord,
      BasenameTextRecordKeys.Email,
      BasenameTextRecordKeys.URL,
    ]),
  ]);

  return {
    basename,
    avatar,
    address,
    ...textRecords,
  };
}

/**
 * Gets comprehensive profile information for an address
 * @param address - The address to get profile for
 * @returns Profile information object or null if no basename found
 */
export async function getAddressProfile(address: Address) {
  const basename = await getBasename(address);
  
  if (!basename) {
    return null;
  }
  
  return await getBasenameProfile(basename);
} 