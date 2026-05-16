import {
  createEncryptedWallet,
  readPayment,
  writeConfig,
  writeDefaultWallet,
} from "@fuin/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTempHome,
  removeTempHome,
  testConfig,
} from "../../core/src/testUtils.js";
import type { BalanceReader } from "./handlers.js";
import { createFuinToolHandlers } from "./handlers.js";

const fakeBalances: BalanceReader = async () => ({
  eth: "0.01",
  ethRaw: 10_000_000_000_000_000n,
  usdc: "10",
  usdcRaw: 10_000_000n,
});

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) {
    await removeTempHome(tempHome);
    tempHome = undefined;
  }
});

describe("Fuin MCP handlers", () => {
  it("prepare_payment creates a local request and does not sign or send", async () => {
    tempHome = await createTempHome();
    await writeConfig(testConfig(), tempHome);
    const handlers = createFuinToolHandlers({
      approvalBaseUrl: "http://127.0.0.1:8787",
      getBalances: fakeBalances,
      home: tempHome,
    });

    const output = await handlers.fuin_prepare_payment({
      amountUsd: "0.50",
      reason: "unit test",
      to: "0x2222222222222222222222222222222222222222",
    });

    expect(output.status).toBe("requires_human_approval");
    expect(output.approvalUrl).toMatch(
      /^http:\/\/127\.0\.0\.1:8787\/approve\/[^?]+\?token=/,
    );
    expect(new URL(output.approvalUrl).searchParams.get("token")).toEqual(
      expect.any(String),
    );
    const payment = await readPayment(output.paymentId, tempHome);
    expect(payment.status).toBe("requires_human_approval");
    const approvalTokenHash = payment.approvalTokenHash;
    expect(approvalTokenHash).toEqual(expect.any(String));
    expect(output.approvalUrl).not.toContain(approvalTokenHash as string);
    expect(payment.txHash).toBeUndefined();
  });

  it("does not include private keys or passphrases in MCP outputs", async () => {
    tempHome = await createTempHome();
    const passphrase = "correct horse battery staple";
    const { privateKey, wallet } = await createEncryptedWallet(passphrase);
    await writeDefaultWallet(wallet, tempHome);
    await writeConfig(testConfig({ address: wallet.address }), tempHome);

    const handlers = createFuinToolHandlers({
      approvalBaseUrl: "http://127.0.0.1:8787",
      getBalances: fakeBalances,
      home: tempHome,
    });

    const addressOutput = await handlers.fuin_get_wallet_address();
    const balanceOutput = await handlers.fuin_get_balance();
    const prepareOutput = await handlers.fuin_prepare_payment({
      amountUsd: "1",
      to: "0x2222222222222222222222222222222222222222",
    });
    const statusOutput = await handlers.fuin_get_payment_status({
      paymentId: prepareOutput.paymentId,
    });
    const listOutput = await handlers.fuin_list_recent_payments({ limit: 10 });
    const serialized = JSON.stringify({
      addressOutput,
      balanceOutput,
      prepareOutput,
      statusOutput,
      listOutput,
    });

    expect(serialized).not.toContain(privateKey);
    expect(serialized).not.toContain(passphrase);
  });

  it("rejects prepare_payment when USDC balance is insufficient", async () => {
    tempHome = await createTempHome();
    await writeConfig(testConfig(), tempHome);
    const handlers = createFuinToolHandlers({
      approvalBaseUrl: "http://127.0.0.1:8787",
      getBalances: async () => ({
        eth: "0.01",
        ethRaw: 10_000_000_000_000_000n,
        usdc: "0.10",
        usdcRaw: 100_000n,
      }),
      home: tempHome,
    });

    await expect(
      handlers.fuin_prepare_payment({
        amountUsd: "1.00",
        to: "0x2222222222222222222222222222222222222222",
      }),
    ).rejects.toThrow(/Insufficient USDC/);
  });
});
