import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type FuinPaths = {
  home: string;
  config: string;
  runtime: string;
  wallet: string;
  walletsDir: string;
  paymentsDir: string;
  auditLog: string;
};

export function getFuinHome(home = process.env.FUIN_HOME): string {
  return home ? resolve(home) : join(homedir(), ".fuin");
}

export function getFuinPaths(home = getFuinHome()): FuinPaths {
  return {
    home,
    config: join(home, "config.json"),
    runtime: join(home, "runtime.json"),
    wallet: join(home, "wallets", "default.wallet.json"),
    walletsDir: join(home, "wallets"),
    paymentsDir: join(home, "payments"),
    auditLog: join(home, "audit.log"),
  };
}
