import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getBalances, sendUsdcTransfer } from "@fuin/chain";
import type { PaymentRequest } from "@fuin/core";
import {
  appendAuditEntry,
  approvePayment,
  decryptPrivateKey,
  fileExists,
  isValidApprovalToken,
  isValidPaymentId,
  listPayments,
  markPaymentFailed,
  markPaymentSending,
  markPaymentSent,
  parseUsdAmountToUsdcUnits,
  readConfig,
  readDefaultWallet,
  readPayment,
  rejectPayment,
  validateEvmAddress,
  writeRuntime,
} from "@fuin/core";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono } from "hono";
import type { Address } from "viem";
import { findAvailableLocalPort } from "./ports.js";

export type ApprovalServer = {
  host: "127.0.0.1";
  port: number;
  url: string;
  close: () => Promise<void>;
};

export type StartApprovalServerOptions = {
  home?: string;
  port?: number;
};

type ApprovalRequestBody = {
  passphrase?: string;
  token?: string;
};

const LOW_GAS_APPROVAL_THRESHOLD_WEI = 50_000_000_000_000n;

type GetBalances = typeof getBalances;
type SendUsdcTransfer = typeof sendUsdcTransfer;

export async function startApprovalServer(
  options: StartApprovalServerOptions = {},
): Promise<ApprovalServer> {
  const host = "127.0.0.1" as const;
  const port = options.port ?? (await findAvailableLocalPort(8787));
  const url = `http://${host}:${port}`;
  const app = createApprovalApp({ home: options.home, port });
  const server = serve({ fetch: app.fetch, hostname: host, port });

  await writeRuntime(
    {
      version: 1,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      approvalServer: { host, port, url },
    },
    options.home,
  );

  return {
    host,
    port,
    url,
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error) {
            rejectClose(error);
            return;
          }
          resolveClose();
        });
      }),
  };
}

export function createApprovalApp(
  options: {
    home?: string;
    port?: number;
    getBalances?: GetBalances;
    sendUsdcTransfer?: SendUsdcTransfer;
  } = {},
) {
  const app = new Hono();
  const balanceReader = options.getBalances ?? getBalances;
  const chainSender = options.sendUsdcTransfer ?? sendUsdcTransfer;
  const paymentLocks = new Set<string>();

  app.use("/api/*", async (c, next) => {
    const blockedResponse = validateLocalApiRequest(c, options.port);
    if (blockedResponse) {
      return blockedResponse;
    }
    await next();
  });

  app.get("/api/state", async (c) => {
    const config = await readConfig(options.home);
    const payments = await listPayments(20, options.home);
    const pendingPayments = payments.filter(
      (payment) => payment.status === "requires_human_approval",
    );
    try {
      const balances = await balanceReader(config.network, config.address);
      return c.json({
        agentName: config.agentName,
        address: config.address,
        network: config.network,
        balances: {
          usdc: balances.usdc,
          eth: balances.eth,
        },
        pendingPayments,
        recentPayments: payments,
      });
    } catch (error) {
      return c.json({
        agentName: config.agentName,
        address: config.address,
        network: config.network,
        balances: {
          usdc: "unavailable",
          eth: "unavailable",
        },
        balanceError: errorMessage(error),
        pendingPayments,
        recentPayments: payments,
      });
    }
  });

  app.get("/api/payments", async (c) => {
    const limit = Number(c.req.query("limit") ?? "20");
    return c.json({ payments: await listPayments(limit, options.home) });
  });

  app.get("/api/payments/:paymentId", async (c) => {
    const paymentId = c.req.param("paymentId");
    const invalidPaymentIdResponse = validatePaymentId(c, paymentId);
    if (invalidPaymentIdResponse) {
      return invalidPaymentIdResponse;
    }
    const payment = await readPayment(paymentId, options.home);
    return c.json(toPaymentResponse(payment));
  });

  app.post("/api/payments/:paymentId/reject", async (c) => {
    const paymentId = c.req.param("paymentId");
    const invalidPaymentIdResponse = validatePaymentId(c, paymentId);
    if (invalidPaymentIdResponse) {
      return invalidPaymentIdResponse;
    }
    const unlock = tryLockPayment(paymentLocks, paymentId);
    if (!unlock) {
      return c.json({ error: "Payment is already being processed" }, 409);
    }
    try {
      const body = await readApprovalRequestBody(c);
      const current = await readPayment(paymentId, options.home);
      const tokenResponse = validatePaymentToken(c, current, body.token);
      if (tokenResponse) {
        return tokenResponse;
      }
      const payment = await rejectPayment(paymentId, options.home, body.token);
      return c.json({ payment: toPaymentResponse(payment) });
    } finally {
      unlock();
    }
  });

  app.post("/api/payments/:paymentId/approve", async (c) => {
    const paymentId = c.req.param("paymentId");
    const invalidPaymentIdResponse = validatePaymentId(c, paymentId);
    if (invalidPaymentIdResponse) {
      return invalidPaymentIdResponse;
    }
    const unlock = tryLockPayment(paymentLocks, paymentId);
    if (!unlock) {
      return c.json({ error: "Payment is already being processed" }, 409);
    }

    let approvalRecorded = false;
    try {
      const body = await readApprovalRequestBody(c);
      const current = await readPayment(paymentId, options.home);
      const tokenResponse = validatePaymentToken(c, current, body.token);
      if (tokenResponse) {
        return tokenResponse;
      }
      if (current.status !== "requires_human_approval") {
        return c.json(
          { error: `Payment is ${current.status} and cannot be approved` },
          409,
        );
      }
      if (!body.passphrase) {
        return c.json({ error: "Passphrase is required" }, 400);
      }

      const wallet = await readDefaultWallet(options.home);
      const revalidatedPayment = await revalidatePaymentBeforeApproval({
        getBalances: balanceReader,
        home: options.home,
        paymentId,
        token: body.token,
        walletAddress: wallet.address,
      });
      const privateKey = await decryptPrivateKey(wallet, body.passphrase);
      const approved = await approvePayment(
        paymentId,
        options.home,
        body.token,
      );
      approvalRecorded = true;
      assertPaymentUnchangedForSend(revalidatedPayment, approved);
      await markPaymentSending(approved.id, options.home);
      const txHash = await chainSender({
        amountUsd: approved.amountUsd,
        network: approved.network,
        privateKey,
        to: approved.to as Address,
      });
      const sent = await markPaymentSent(approved.id, txHash, options.home);
      return c.json({ payment: toPaymentResponse(sent) });
    } catch (error) {
      const message = errorMessage(error);
      if (approvalRecorded) {
        try {
          await markPaymentFailed(paymentId, message, options.home);
        } catch {
          await appendAuditEntry(
            "payment.approval_failed",
            { paymentId, error: message },
            options.home,
          );
        }
      }
      return c.json({ error: message }, errorStatus(error));
    } finally {
      unlock();
    }
  });

  app.all("/api/payments/:paymentId/reject", (c) => {
    return c.json({ error: "Method not allowed" }, 405);
  });

  app.all("/api/payments/:paymentId/approve", (c) => {
    return c.json({ error: "Method not allowed" }, 405);
  });

  const uiRoot = resolveUiRoot();
  app.get("/assets/*", serveStatic({ root: uiRoot }));
  app.get("*", async (c) => {
    const indexPath = join(uiRoot, "index.html");
    if (!(await fileExists(indexPath))) {
      return c.text(
        "Fuin approval UI is not built. Run pnpm --filter @fuin/ui build.",
        503,
      );
    }
    return c.html(await readFile(indexPath, "utf8"));
  });

  return app;
}

async function readApprovalRequestBody(
  c: Context,
): Promise<ApprovalRequestBody> {
  return c.req.json<ApprovalRequestBody>().catch(() => ({}));
}

function validatePaymentId(
  c: Context,
  paymentId: string,
): Response | undefined {
  if (!isValidPaymentId(paymentId)) {
    return c.json({ error: "Invalid payment id" }, 400);
  }
  return undefined;
}

function validatePaymentToken(
  c: Context,
  payment: PaymentRequest,
  token: string | undefined,
): Response | undefined {
  if (!token) {
    return c.json({ error: "Approval token is required" }, 401);
  }
  if (!isValidApprovalToken(payment, token)) {
    return c.json({ error: "Invalid approval token" }, 403);
  }
  return undefined;
}

async function revalidatePaymentBeforeApproval(input: {
  paymentId: string;
  token: string | undefined;
  walletAddress: string;
  home: string | undefined;
  getBalances: GetBalances;
}): Promise<PaymentRequest> {
  const payment = await readPayment(input.paymentId, input.home);
  if (!input.token) {
    throw new ApprovalRequestError("Approval token is required", 401);
  }
  if (!isValidApprovalToken(payment, input.token)) {
    throw new ApprovalRequestError("Invalid approval token", 403);
  }
  if (payment.status !== "requires_human_approval") {
    throw new ApprovalRequestError(
      `Payment is ${payment.status} and cannot be approved`,
      409,
    );
  }

  assertSupportedPaymentAsset(payment.asset);
  const network = requireSupportedPaymentNetwork(payment.network);
  const to = requireEvmAddress(payment.to, "Payment recipient");
  const fromAddress = requireEvmAddress(payment.fromAddress, "Payment sender");
  const amountUnits = requireUsdcAmount(payment.amountUsd);

  if (fromAddress.toLowerCase() !== input.walletAddress.toLowerCase()) {
    throw new ApprovalRequestError(
      "Payment was created for a different wallet address.",
      409,
    );
  }

  let balances: Awaited<ReturnType<GetBalances>>;
  try {
    balances = await input.getBalances(network, fromAddress);
  } catch (error) {
    throw new ApprovalRequestError(
      `Unable to re-check balances before approval: ${errorMessage(error)}`,
      502,
    );
  }

  if (balances.usdcRaw < amountUnits) {
    throw new ApprovalRequestError(
      `Insufficient USDC balance before approval. Available ${balances.usdc} USDC.`,
      400,
    );
  }

  if (balances.ethRaw < LOW_GAS_APPROVAL_THRESHOLD_WEI) {
    throw new ApprovalRequestError(
      `ETH balance is likely too low to pay gas for this USDC transfer. Available ${balances.eth} ETH.`,
      400,
    );
  }

  return { ...payment, network, to, fromAddress };
}

function assertPaymentUnchangedForSend(
  beforeApproval: PaymentRequest,
  approved: PaymentRequest,
): void {
  const protectedFields: Array<keyof PaymentRequest> = [
    "id",
    "fromAddress",
    "to",
    "amountUsd",
    "asset",
    "network",
  ];
  for (const field of protectedFields) {
    if (approved[field] !== beforeApproval[field]) {
      throw new ApprovalRequestError(
        "Payment changed during approval; refusing to send.",
        409,
      );
    }
  }
}

function assertSupportedPaymentAsset(asset: unknown): asserts asset is "USDC" {
  if (asset !== "USDC") {
    throw new ApprovalRequestError(
      `Unsupported payment asset: ${String(asset)}. Only USDC is supported.`,
      400,
    );
  }
}

function requireSupportedPaymentNetwork(
  network: unknown,
): PaymentRequest["network"] {
  if (network === "base-sepolia" || network === "base") {
    return network;
  }
  throw new ApprovalRequestError(
    `Unsupported payment network: ${String(network)}`,
    400,
  );
}

function requireEvmAddress(address: string, label: string): string {
  try {
    return validateEvmAddress(address);
  } catch {
    throw new ApprovalRequestError(
      `${label} must be a valid EVM address.`,
      400,
    );
  }
}

function requireUsdcAmount(amountUsd: string): bigint {
  try {
    return parseUsdAmountToUsdcUnits(amountUsd);
  } catch (error) {
    throw new ApprovalRequestError(
      `Invalid payment amount: ${errorMessage(error)}`,
      400,
    );
  }
}

function validateLocalApiRequest(
  c: Context,
  port: number | undefined,
): Response | undefined {
  const requestHost = c.req.header("host") ?? new URL(c.req.url).host;
  if (!isAllowedHost(requestHost, port)) {
    return c.json({ error: "Invalid Host header" }, 403);
  }

  const origin = c.req.header("origin");
  if (origin && !isAllowedOrigin(origin, port)) {
    return c.json({ error: "Invalid Origin header" }, 403);
  }

  return undefined;
}

function tryLockPayment(
  lockedPayments: Set<string>,
  paymentId: string,
): (() => void) | undefined {
  if (lockedPayments.has(paymentId)) {
    return undefined;
  }
  lockedPayments.add(paymentId);
  return () => lockedPayments.delete(paymentId);
}

function isAllowedOrigin(origin: string, port: number | undefined): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === "http:" && isAllowedHost(parsed.host, port);
  } catch {
    return false;
  }
}

function isAllowedHost(host: string, port: number | undefined): boolean {
  if (host.includes("/") || host.includes("@")) {
    return false;
  }
  try {
    const parsed = new URL(`http://${host}`);
    const hostname = parsed.hostname.toLowerCase();
    const localHost = hostname === "127.0.0.1" || hostname === "localhost";
    return localHost && (port === undefined || parsed.port === String(port));
  } catch {
    return false;
  }
}

function toPaymentResponse(payment: PaymentRequest): PaymentRequest {
  const response = { ...payment };
  delete response.approvalTokenHash;
  return response;
}

function resolveUiRoot(): string {
  if (process.env.FUIN_UI_DIST) {
    return resolve(process.env.FUIN_UI_DIST);
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const bundledUiRoot = resolve(here, "ui");
  const candidates = [
    // Bundled CLI: apps/cli/dist/index.js -> apps/cli/dist/ui
    bundledUiRoot,
    // Unbundled CLI: apps/cli/dist/server/approvalServer.js -> apps/cli/dist/ui
    resolve(here, "../ui"),
    // Local tsx dev: apps/cli/src/server/approvalServer.ts -> apps/ui/dist
    resolve(here, "../../../ui/dist"),
  ];
  return candidates.find(hasBuiltUi) ?? bundledUiRoot;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorStatus(error: unknown): 400 | 401 | 403 | 409 | 500 | 502 {
  return error instanceof ApprovalRequestError ? error.status : 500;
}

class ApprovalRequestError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 409 | 502,
  ) {
    super(message);
    this.name = "ApprovalRequestError";
  }
}

function hasBuiltUi(root: string): boolean {
  return existsSync(join(root, "index.html"));
}
