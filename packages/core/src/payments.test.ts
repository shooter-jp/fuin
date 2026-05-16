import { afterEach, describe, expect, it } from "vitest";
import {
  approvePayment,
  createPaymentRequest,
  isValidApprovalToken,
  markPaymentSending,
  markPaymentSent,
  readPayment,
  rejectPayment,
  writeConfig,
} from "./index.js";
import { createTempHome, removeTempHome, testConfig } from "./testUtils.js";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) {
    await removeTempHome(tempHome);
    tempHome = undefined;
  }
});

describe("payment state transitions", () => {
  it("creates local payment requests requiring approval", async () => {
    tempHome = await createTempHome();
    const config = testConfig();
    await writeConfig(config, tempHome);
    const payment = await createPaymentRequest(
      {
        source: "mcp",
        config,
        to: "0x2222222222222222222222222222222222222222",
        amountUsd: "0.50",
        reason: "test",
      },
      tempHome,
    );

    expect(payment.status).toBe("requires_human_approval");
    expect(payment.approvalToken).toEqual(expect.any(String));
    await expect(readPayment(payment.id, tempHome)).resolves.toMatchObject({
      amountUsd: "0.50",
      asset: "USDC",
      status: "requires_human_approval",
    });
  });

  it("stores only a hash of the approval token", async () => {
    tempHome = await createTempHome();
    const config = testConfig();
    const payment = await createPaymentRequest(
      {
        source: "mcp",
        config,
        to: "0x2222222222222222222222222222222222222222",
        amountUsd: "0.50",
      },
      tempHome,
    );

    const persisted = await readPayment(payment.id, tempHome);
    expect(persisted.approvalTokenHash).toEqual(expect.any(String));
    expect(JSON.stringify(persisted)).not.toContain(payment.approvalToken);
    expect(isValidApprovalToken(persisted, payment.approvalToken)).toBe(true);
    expect(isValidApprovalToken(persisted, "wrong")).toBe(false);
  });

  it("does not allow rejected payments to be approved", async () => {
    tempHome = await createTempHome();
    const config = testConfig();
    const payment = await createPaymentRequest(
      {
        source: "mcp",
        config,
        to: "0x2222222222222222222222222222222222222222",
        amountUsd: "0.50",
      },
      tempHome,
    );

    await rejectPayment(payment.id, tempHome, payment.approvalToken);
    await expect(
      approvePayment(payment.id, tempHome, payment.approvalToken),
    ).rejects.toThrow(/Invalid approval token/);
  });

  it("invalidates approval tokens after terminal approval decisions", async () => {
    tempHome = await createTempHome();
    const config = testConfig();
    const rejectedPayment = await createPaymentRequest(
      {
        source: "mcp",
        config,
        to: "0x2222222222222222222222222222222222222222",
        amountUsd: "0.50",
      },
      tempHome,
    );

    await rejectPayment(
      rejectedPayment.id,
      tempHome,
      rejectedPayment.approvalToken,
    );
    await expect(
      readPayment(rejectedPayment.id, tempHome),
    ).resolves.not.toHaveProperty("approvalTokenHash");

    const approvedPayment = await createPaymentRequest(
      {
        source: "mcp",
        config,
        to: "0x3333333333333333333333333333333333333333",
        amountUsd: "0.75",
      },
      tempHome,
    );

    await approvePayment(
      approvedPayment.id,
      tempHome,
      approvedPayment.approvalToken,
    );
    await expect(
      readPayment(approvedPayment.id, tempHome),
    ).resolves.not.toHaveProperty("approvalTokenHash");
  });

  it("does not allow sent payments to be sent again", async () => {
    tempHome = await createTempHome();
    const config = testConfig();
    const payment = await createPaymentRequest(
      {
        source: "mcp",
        config,
        to: "0x2222222222222222222222222222222222222222",
        amountUsd: "0.50",
      },
      tempHome,
    );

    await approvePayment(payment.id, tempHome, payment.approvalToken);
    await markPaymentSending(payment.id, tempHome);
    await markPaymentSent(
      payment.id,
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      tempHome,
    );

    await expect(
      markPaymentSent(
        payment.id,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        tempHome,
      ),
    ).rejects.toThrow(/Cannot transition/);
  });
});
