import { isAddress } from "viem";

export function validateEvmAddress(address: string): string {
  if (!isAddress(address)) {
    throw new Error("to must be a valid EVM address");
  }
  return address;
}
