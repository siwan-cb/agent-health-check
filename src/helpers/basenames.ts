import {
    Address,
    ContractFunctionParameters,
    createPublicClient,
    encodePacked,
    http,
    keccak256,
    namehash,
  } from "viem";
  import { base, mainnet } from "viem/chains";
  import L2ResolverAbi from "../abis/L2ResolverAbi.js";
  
  export type Basename = `${string}.base.eth`;
  
  export const BASENAME_L2_RESOLVER_ADDRESS =
    "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD";
  
  // Cache for basename resolution
  const basenameCache = new Map<string, { basename: Basename | null; timestamp: number }>();
  const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  
  export enum BasenameTextRecordKeys {
    Description = "description",
    Keywords = "keywords",
    Url = "url",
    Email = "email",
    Phone = "phone",
    Github = "com.github",
    Twitter = "com.twitter",
    Farcaster = "xyz.farcaster",
    Lens = "xyz.lens",
    Telegram = "org.telegram",
    Discord = "com.discord",
    Avatar = "avatar",
  }
  
  export const textRecordsKeysEnabled = [
    BasenameTextRecordKeys.Description,
    BasenameTextRecordKeys.Keywords,
    BasenameTextRecordKeys.Url,
    BasenameTextRecordKeys.Github,
    BasenameTextRecordKeys.Email,
    BasenameTextRecordKeys.Phone,
    BasenameTextRecordKeys.Twitter,
    BasenameTextRecordKeys.Farcaster,
    BasenameTextRecordKeys.Lens,
    BasenameTextRecordKeys.Telegram,
    BasenameTextRecordKeys.Discord,
    BasenameTextRecordKeys.Avatar,
  ];
  
  const baseClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org", {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 10000,
  }),
});

// Fallback client with different RPC endpoint
const fallbackBaseClient = createPublicClient({
  chain: base,
  transport: http("https://base.llamarpc.com", {
    retryCount: 2,
    retryDelay: 1000,
    timeout: 10000,
  }),
});
  
  export async function getBasenameAvatar(basename: Basename) {
    const avatar = await baseClient.getEnsAvatar({
      name: basename,
      universalResolverAddress: BASENAME_L2_RESOLVER_ADDRESS,
    });
  
    return avatar;
  }
  
  export function buildBasenameTextRecordContract(
    basename: Basename,
    key: BasenameTextRecordKeys
  ): ContractFunctionParameters {
    return {
      abi: L2ResolverAbi,
      address: BASENAME_L2_RESOLVER_ADDRESS,
      args: [namehash(basename), key],
      functionName: "text",
    };
  }
  
  // Get a single TextRecord
  export async function getBasenameTextRecord(
    basename: Basename,
    key: BasenameTextRecordKeys
  ) {
    try {
      const contractParameters = buildBasenameTextRecordContract(basename, key);
      const textRecord = await baseClient.readContract(contractParameters);
      return textRecord as string;
    } catch (error) {}
  }
  
  // Get a all TextRecords
  export async function getBasenameTextRecords(basename: Basename) {
    try {
      const readContracts: ContractFunctionParameters[] =
        textRecordsKeysEnabled.map((key) =>
          buildBasenameTextRecordContract(basename, key)
        );
      const textRecords = await baseClient.multicall({
        contracts: readContracts,
      });
  
      return textRecords;
    } catch (error) {}
  }
  
  /**
   * Convert an chainId to a coinType hex for reverse chain resolution
   */
  export const convertChainIdToCoinType = (chainId: number): string => {
    // L1 resolvers to addr
    if (chainId === mainnet.id) {
      return "addr";
    }
  
    const cointype = (0x80000000 | chainId) >>> 0;
    return cointype.toString(16).toLocaleUpperCase();
  };
  
  /**
   * Convert an address to a reverse node for ENS resolution
   */
  export const convertReverseNodeToBytes = (
    address: Address,
    chainId: number
  ) => {
    const addressFormatted = address.toLocaleLowerCase() as Address;
    const addressNode = keccak256(addressFormatted.substring(2) as Address);
    const chainCoinType = convertChainIdToCoinType(chainId);
    const baseReverseNode = namehash(
      `${chainCoinType.toLocaleUpperCase()}.reverse`
    );
    const addressReverseNode = keccak256(
      encodePacked(["bytes32", "bytes32"], [baseReverseNode, addressNode])
    );
    return addressReverseNode;
  };
  
  export async function getBasename(address: Address) {
  try {
    // Check cache first
    const cacheKey = address.toLowerCase();
    const cached = basenameCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
      return cached.basename;
    }
    
    const addressReverseNode = convertReverseNodeToBytes(address, base.id);
    let basename: string | null = null;
    
    // Try primary client first
    try {
      basename = await baseClient.readContract({
        abi: L2ResolverAbi,
        address: BASENAME_L2_RESOLVER_ADDRESS,
        functionName: "name",
        args: [addressReverseNode],
      });
    } catch (primaryError: any) {
      // If primary client fails with rate limiting, try fallback
      if (primaryError?.message?.includes("rate limit") || primaryError?.status === 429) {
        console.log(`Primary RPC rate limited for ${address}, trying fallback...`);
        try {
          basename = await fallbackBaseClient.readContract({
            abi: L2ResolverAbi,
            address: BASENAME_L2_RESOLVER_ADDRESS,
            functionName: "name",
            args: [addressReverseNode],
          });
        } catch (fallbackError) {
          console.error(`Fallback RPC also failed for ${address}:`, fallbackError);
          throw primaryError; // Re-throw original error
        }
      } else {
        throw primaryError; // Re-throw if not rate limit error
      }
    }
    
    const result = basename ? (basename as Basename) : null;
    
    // Cache the result
    basenameCache.set(cacheKey, {
      basename: result,
      timestamp: Date.now()
    });
    
    if (result) {
      console.log(`Successfully resolved ${address} to ${result}`);
      return result;
    } else {
      console.log(`No basename found for address: ${address}`);
    }
  } catch (error) {
    console.error(`Error resolving basename for address ${address}:`, error);
    // Cache failed lookups temporarily to prevent repeated failed calls
    basenameCache.set(address.toLowerCase(), {
      basename: null,
      timestamp: Date.now()
    });
  }
}