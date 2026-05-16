import type { NetworkId } from "@fuin/core";
import { parseUsdAmountToUsdcUnits } from "@fuin/core";
import type { Address, Hex } from "viem";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getNetwork, getRpcUrl } from "./networks.js";
import { ERC20_BALANCE_ABI, ERC20_TRANSFER_ABI } from "./usdc.js";

export type Balances = {
  usdc: string;
  eth: string;
  usdcRaw: bigint;
  ethRaw: bigint;
};

export type SendUsdcTransferInput = {
  network: NetworkId;
  privateKey: Hex;
  to: Address;
  amountUsd: string;
};

export function createFuinPublicClient(networkId: NetworkId) {
  const network = getNetwork(networkId);
  return createPublicClient({
    chain: network.chain,
    transport: http(getRpcUrl(networkId)),
  });
}

export function createFuinWalletClient(networkId: NetworkId, privateKey: Hex) {
  const network = getNetwork(networkId);
  return createWalletClient({
    account: privateKeyToAccount(privateKey),
    chain: network.chain,
    transport: http(getRpcUrl(networkId)),
  });
}

export async function getBalances(
  network: NetworkId,
  address: string,
): Promise<Balances> {
  const fuinNetwork = getNetwork(network);
  const client = createFuinPublicClient(network);
  const account = address as Address;
  const [ethRaw, usdcRaw] = await Promise.all([
    client.getBalance({ address: account }),
    client.readContract({
      abi: ERC20_BALANCE_ABI,
      address: fuinNetwork.usdcAddress,
      functionName: "balanceOf",
      args: [account],
    }),
  ]);

  return {
    eth: formatEther(ethRaw),
    ethRaw,
    usdc: formatUnits(usdcRaw, 6),
    usdcRaw,
  };
}

export async function sendUsdcTransfer(
  input: SendUsdcTransferInput,
): Promise<Hex> {
  const network = getNetwork(input.network);
  const walletClient = createFuinWalletClient(input.network, input.privateKey);
  return walletClient.writeContract({
    abi: ERC20_TRANSFER_ABI,
    address: network.usdcAddress,
    functionName: "transfer",
    args: [input.to, parseUsdAmountToUsdcUnits(input.amountUsd)],
  });
}
