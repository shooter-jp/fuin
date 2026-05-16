import { readFile, stat } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { getFuinPaths } from "./paths.js";
import {
  appendAuditEntry,
  atomicWriteJson,
  readConfig,
  readJsonFile,
  writeConfig,
  writeDefaultWallet,
  writeRuntime,
} from "./storage.js";
import { createTempHome, removeTempHome, testConfig } from "./testUtils.js";
import { createEncryptedWallet } from "./wallet.js";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) {
    await removeTempHome(tempHome);
    tempHome = undefined;
  }
});

describe("storage", () => {
  it("writes and reads JSON atomically", async () => {
    tempHome = await createTempHome();
    const path = `${tempHome}/example.json`;
    await atomicWriteJson(path, { ok: true });
    await expect(readJsonFile<{ ok: boolean }>(path)).resolves.toEqual({
      ok: true,
    });
  });

  it("writes and reads config", async () => {
    tempHome = await createTempHome();
    const config = testConfig();
    await writeConfig(config, tempHome);
    await expect(readConfig(tempHome)).resolves.toEqual(config);
  });

  it("redacts private keys, passphrases, and approval tokens from audit logs", async () => {
    tempHome = await createTempHome();
    await appendAuditEntry(
      "test.secret",
      {
        privateKey: "0xabc",
        passphrase: "hunter2",
        approvalToken: "approval-token",
        approvalUrl: "http://127.0.0.1:8787/approve/abc?token=url-token",
        nested: {
          seedPhrase: "words",
          callback: "http://127.0.0.1:8787/path?token=query-token",
        },
      },
      tempHome,
    );
    const log = await readFile(getFuinPaths(tempHome).auditLog, "utf8");
    expect(log).not.toContain("0xabc");
    expect(log).not.toContain("hunter2");
    expect(log).not.toContain("words");
    expect(log).not.toContain("approval-token");
    expect(log).not.toContain("url-token");
    expect(log).not.toContain("query-token");
    expect(log).toContain("[redacted]");
  });

  const posixIt = process.platform === "win32" ? it.skip : it;

  posixIt(
    "writes wallet and runtime files with restrictive permissions",
    async () => {
      tempHome = await createTempHome();
      const paths = getFuinPaths(tempHome);
      const { wallet } = await createEncryptedWallet(
        "correct horse battery staple",
      );

      await writeDefaultWallet(wallet, tempHome);
      await writeRuntime(
        {
          version: 1,
          pid: 123,
          startedAt: "2026-01-01T00:00:00.000Z",
          approvalServer: {
            host: "127.0.0.1",
            port: 8787,
            url: "http://127.0.0.1:8787",
          },
        },
        tempHome,
      );

      await expect(fileMode(paths.home)).resolves.toBe(0o700);
      await expect(fileMode(paths.walletsDir)).resolves.toBe(0o700);
      await expect(fileMode(paths.paymentsDir)).resolves.toBe(0o700);
      await expect(fileMode(paths.wallet)).resolves.toBe(0o600);
      await expect(fileMode(paths.runtime)).resolves.toBe(0o600);
    },
  );
});

async function fileMode(path: string): Promise<number> {
  return (await stat(path)).mode & 0o777;
}
