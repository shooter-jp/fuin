import type { NetworkId } from "@fuin/core";
import type { Address, Chain } from "viem";
import { base, baseSepolia } from "viem/chains";

export type FuinNetwork = {
  id: NetworkId;
  displayName: string;
  chain: Chain;
  usdcAddress: Address;
  rpcEnv: "FUIN_BASE_SEPOLIA_RPC_URL" | "FUIN_BASE_RPC_URL";
  isMainnet: boolean;
};

export const NETWORKS: Record<NetworkId, FuinNetwork> = {
  "base-sepolia": {
    id: "base-sepolia",
    displayName: "Base Sepolia",
    chain: baseSepolia,
    usdcAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    rpcEnv: "FUIN_BASE_SEPOLIA_RPC_URL",
    isMainnet: false,
  },
  base: {
    id: "base",
    displayName: "Base",
    chain: base,
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    rpcEnv: "FUIN_BASE_RPC_URL",
    isMainnet: true,
  },
};

export function getNetwork(networkId: NetworkId): FuinNetwork {
  const network = NETWORKS[networkId];
  if (!network) {
    throw new Error(`Unsupported network: ${networkId}`);
  }
  return network;
}

export function getRpcUrl(networkId: NetworkId): string | undefined {
  const network = getNetwork(networkId);
  return process.env[network.rpcEnv];
}
