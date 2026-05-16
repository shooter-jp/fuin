import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FuinConfig } from "./types.js";

export async function createTempHome(): Promise<string> {
  return mkdtemp(join(tmpdir(), "fuin-test-"));
}

export async function removeTempHome(home: string): Promise<void> {
  await rm(home, { force: true, recursive: true });
}

export function testConfig(overrides: Partial<FuinConfig> = {}): FuinConfig {
  return {
    version: 1,
    agentName: "Test Agent",
    network: "base-sepolia",
    address: "0x1111111111111111111111111111111111111111",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
