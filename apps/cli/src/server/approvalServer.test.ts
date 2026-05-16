import {
  createEncryptedWallet,
  createPaymentRequest,
  readPayment,
  writeConfig,
  writeDefaultWallet,
} from "@fuin/core";
import { afterEach, describe, expect, it } from "vitest";
import {
  createTempHome,
  removeTempHome,
  testConfig,
} from "../../../../packages/core/src/testUtils.js";
import { createApprovalApp } from "./approvalServer.js";

const TEST_PORT = 8787;
const TEST_TX_HASH =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

let tempHome: string | undefined;

afterEach(async () => {
  if (tempHome) {
    await removeTempHome(tempHome);
    tempHome = undefined;
  }
});

describe("approval server", () => {
  it("redacts approval token hashes from read-only payment detail", async () => {
    tempHome = await createTempHome();
    const payment = await createPendingPayment(tempHome);
    const app = createApprovalApp({ home: tempHome, port: TEST_PORT });

    const response = await app.request(paymentUrl(payment.id));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.approvalTokenHash).toBeUndefined();
  });

  it("validates Host headers for read-only API routes", async () => {
    tempHome = await createTempHome();
    const payment = await createPendingPayment(tempHome);
    const app = createApprovalApp({ home: tempHome, port: TEST_PORT });

    const badState = await app.request(
      `http://evil.test:${TEST_PORT}/api/state`,
    );
    const badDetail = await app.request(
      `http://evil.test:${TEST_PORT}/api/payments/${payment.id}`,
    );
    const goodDetail = await app.request(paymentUrl(payment.id));

    expect(badState.status).toBe(403);
    expect(badDetail.status).toBe(403);
    expect(goodDetail.status).toBe(200);
  });

  it("rejects missing or invalid approval tokens for mutating routes", async () => {
    tempHome = await createTempHome();
    const payment = await createPendingPayment(tempHome);
    const app = createApprovalApp({ home: tempHome, port: TEST_PORT });

    const missing = await postJson(app, `${paymentUrl(payment.id)}/reject`, {});
    const invalid = await postJson(app, `${paymentUrl(payment.id)}/reject`, {
      token: "wrong",
    });

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(403);
    await expect(readPayment(payment.id, tempHome)).resolves.toMatchObject({
      status: "requires_human_approval",
    });
  });

  it("accepts valid approval tokens for reject and invalidates them", async () => {
    tempHome = await createTempHome();
    const payment = await createPendingPayment(tempHome);
    const app = createApprovalApp({ home: tempHome, port: TEST_PORT });

    const accepted = await postJson(app, `${paymentUrl(payment.id)}/reject`, {
      token: payment.approvalToken,
    });
    const acceptedBody = (await accepted.json()) as {
      payment: { status: string; approvalTokenHash?: string };
    };
    const replay = await postJson(app, `${paymentUrl(payment.id)}/reject`, {
      token: payment.approvalToken,
    });

    expect(accepted.status).toBe(200);
    expect(acceptedBody.payment.status).toBe("rejected");
    expect(acceptedBody.payment.approvalTokenHash).toBeUndefined();
    expect(replay.status).toBe(403);
    await expect(readPayment(payment.id, tempHome)).resolves.not.toHaveProperty(
      "approvalTokenHash",
    );
  });

  it("accepts valid approval tokens for approve", async () => {
    tempHome = await createTempHome();
    const passphrase = "correct horse battery staple";
    const payment = await createPendingPaymentWithWallet(tempHome, passphrase);
    const app = createApprovalApp({
      home: tempHome,
      port: TEST_PORT,
      sendUsdcTransfer: async () => TEST_TX_HASH,
    });

    const response = await postJson(app, `${paymentUrl(payment.id)}/approve`, {
      passphrase,
      token: payment.approvalToken,
    });
    const body = (await response.json()) as {
      payment: { status: string; txHash?: string; approvalTokenHash?: string };
    };

    expect(response.status).toBe(200);
    expect(body.payment.status).toBe("sent");
    expect(body.payment.txHash).toBe(TEST_TX_HASH);
    expect(body.payment.approvalTokenHash).toBeUndefined();
    await expect(readPayment(payment.id, tempHome)).resolves.not.toHaveProperty(
      "approvalTokenHash",
    );
  });

  it("does not let concurrent approve requests fail an in-flight payment", async () => {
    tempHome = await createTempHome();
    const passphrase = "correct horse battery staple";
    const payment = await createPendingPaymentWithWallet(tempHome, passphrase);
    let markSendStarted: () => void = () => {};
    let finishSend: (txHash: typeof TEST_TX_HASH) => void = () => {};
    const sendStarted = new Promise<void>((resolve) => {
      markSendStarted = resolve;
    });
    const sendFinished = new Promise<typeof TEST_TX_HASH>((resolve) => {
      finishSend = resolve;
    });
    const app = createApprovalApp({
      home: tempHome,
      port: TEST_PORT,
      sendUsdcTransfer: async () => {
        markSendStarted();
        return sendFinished;
      },
    });

    const firstApprove = postJson(app, `${paymentUrl(payment.id)}/approve`, {
      passphrase,
      token: payment.approvalToken,
    });
    await sendStarted;
    const secondApprove = await postJson(
      app,
      `${paymentUrl(payment.id)}/approve`,
      {
        passphrase,
        token: payment.approvalToken,
      },
    );
    finishSend(TEST_TX_HASH);
    const firstResponse = await firstApprove;

    expect(secondApprove.status).toBe(409);
    expect(firstResponse.status).toBe(200);
    await expect(readPayment(payment.id, tempHome)).resolves.toMatchObject({
      status: "sent",
      txHash: TEST_TX_HASH,
    });
  });

  it("does not mutate approval state through non-POST requests", async () => {
    tempHome = await createTempHome();
    const payment = await createPendingPayment(tempHome);
    const app = createApprovalApp({ home: tempHome, port: TEST_PORT });

    const approveResponse = await app.request(
      `${paymentUrl(payment.id)}/approve`,
    );
    const rejectResponse = await app.request(
      `${paymentUrl(payment.id)}/reject`,
    );

    expect(approveResponse.status).toBe(405);
    expect(rejectResponse.status).toBe(405);
    await expect(readPayment(payment.id, tempHome)).resolves.toMatchObject({
      status: "requires_human_approval",
    });
  });

  it("validates Host and Origin headers for mutating routes", async () => {
    tempHome = await createTempHome();
    const payment = await createPendingPayment(tempHome);
    const app = createApprovalApp({ home: tempHome, port: TEST_PORT });

    const badHost = await postJson(
      app,
      `http://evil.test:${TEST_PORT}/api/payments/${payment.id}/reject`,
      { token: payment.approvalToken },
    );
    const badOrigin = await postJson(
      app,
      `${paymentUrl(payment.id)}/reject`,
      {
        token: payment.approvalToken,
      },
      {
        origin: `http://evil.test:${TEST_PORT}`,
      },
    );
    const goodOrigin = await postJson(
      app,
      `${paymentUrl(payment.id)}/reject`,
      {
        token: payment.approvalToken,
      },
      {
        origin: `http://localhost:${TEST_PORT}`,
      },
    );

    expect(badHost.status).toBe(403);
    expect(badOrigin.status).toBe(403);
    expect(goodOrigin.status).toBe(200);
  });
});

async function createPendingPayment(home: string) {
  await writeConfig(testConfig(), home);
  return createPaymentRequest(
    {
      source: "mcp",
      config: testConfig(),
      to: "0x2222222222222222222222222222222222222222",
      amountUsd: "0.50",
    },
    home,
  );
}

async function createPendingPaymentWithWallet(
  home: string,
  passphrase: string,
) {
  const { wallet } = await createEncryptedWallet(passphrase);
  const config = testConfig({ address: wallet.address });
  await writeDefaultWallet(wallet, home);
  await writeConfig(config, home);
  return createPaymentRequest(
    {
      source: "mcp",
      config,
      to: "0x2222222222222222222222222222222222222222",
      amountUsd: "0.50",
    },
    home,
  );
}

function paymentUrl(paymentId: string): string {
  return `http://127.0.0.1:${TEST_PORT}/api/payments/${paymentId}`;
}

async function postJson(
  app: ReturnType<typeof createApprovalApp>,
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return app.request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
