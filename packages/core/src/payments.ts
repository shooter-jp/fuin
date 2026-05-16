import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { normalizeAmountUsd } from "./amount.js";
import { appendAuditEntry, readPayment, writePayment } from "./storage.js";
import type { FuinConfig, PaymentRequest, PaymentStatus } from "./types.js";
import { validateEvmAddress } from "./validation.js";

const APPROVAL_TOKEN_BYTES = 32;

export type CreatePaymentInput = {
  source: PaymentRequest["source"];
  config: FuinConfig;
  to: string;
  amountUsd: string;
  reason?: string;
};

export type CreatedPaymentRequest = PaymentRequest & {
  approvalToken: string;
};

export function createApprovalToken(): string {
  return randomBytes(APPROVAL_TOKEN_BYTES).toString("base64url");
}

export function hashApprovalToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function isValidApprovalToken(
  payment: PaymentRequest,
  token: string | undefined,
): boolean {
  if (!payment.approvalTokenHash || !token) {
    return false;
  }
  const expected = Buffer.from(payment.approvalTokenHash, "utf8");
  const actual = Buffer.from(hashApprovalToken(token), "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildPaymentRequest(
  input: CreatePaymentInput,
  approvalToken = createApprovalToken(),
): CreatedPaymentRequest {
  const normalizedAmount = normalizeAmountUsd(input.amountUsd);
  const to = validateEvmAddress(input.to);
  const payment: PaymentRequest = {
    id: randomUUID(),
    source: input.source,
    fromAgentName: input.config.agentName,
    fromAddress: input.config.address,
    to,
    amountUsd: normalizedAmount,
    asset: "USDC",
    network: input.config.network,
    reason: input.reason,
    status: "requires_human_approval",
    createdAt: new Date().toISOString(),
    approvalTokenHash: hashApprovalToken(approvalToken),
  };
  return { ...payment, approvalToken };
}

export async function createPaymentRequest(
  input: CreatePaymentInput,
  home?: string,
): Promise<CreatedPaymentRequest> {
  const created = buildPaymentRequest(input);
  const { approvalToken: _approvalToken, ...payment } = created;
  await writePayment(payment, home);
  await appendAuditEntry(
    "payment.created",
    {
      paymentId: payment.id,
      source: payment.source,
      to: payment.to,
      amountUsd: payment.amountUsd,
      asset: payment.asset,
      network: payment.network,
      reason: payment.reason,
    },
    home,
  );
  return created;
}

export async function rejectPayment(
  paymentId: string,
  home?: string,
  approvalToken?: string,
): Promise<PaymentRequest> {
  const payment = await readPayment(paymentId, home);
  assertValidApprovalToken(payment, approvalToken);
  const rejected = transitionPayment(payment, "rejected", {
    approvalTokenHash: undefined,
  });
  await writePayment(rejected, home);
  await appendAuditEntry(
    "payment.rejected",
    { paymentId: rejected.id, network: rejected.network },
    home,
  );
  return rejected;
}

export async function approvePayment(
  paymentId: string,
  home?: string,
  approvalToken?: string,
): Promise<PaymentRequest> {
  const payment = await readPayment(paymentId, home);
  assertValidApprovalToken(payment, approvalToken);
  const approved = transitionPayment(payment, "approved", {
    approvedAt: new Date().toISOString(),
    approvalTokenHash: undefined,
  });
  await writePayment(approved, home);
  await appendAuditEntry(
    "payment.approved",
    { paymentId: approved.id, network: approved.network },
    home,
  );
  return approved;
}

function assertValidApprovalToken(
  payment: PaymentRequest,
  token: string | undefined,
): void {
  if (!isValidApprovalToken(payment, token)) {
    throw new Error("Invalid approval token");
  }
}

export async function markPaymentSending(
  paymentId: string,
  home?: string,
): Promise<PaymentRequest> {
  const payment = await readPayment(paymentId, home);
  const sending = transitionPayment(payment, "sending");
  await writePayment(sending, home);
  return sending;
}

export async function markPaymentSent(
  paymentId: string,
  txHash: string,
  home?: string,
): Promise<PaymentRequest> {
  const payment = await readPayment(paymentId, home);
  const sent = transitionPayment(payment, "sent", {
    txHash,
    sentAt: new Date().toISOString(),
  });
  await writePayment(sent, home);
  await appendAuditEntry(
    "payment.sent",
    { paymentId: sent.id, network: sent.network, txHash },
    home,
  );
  return sent;
}

export async function markPaymentFailed(
  paymentId: string,
  error: string,
  home?: string,
): Promise<PaymentRequest> {
  const payment = await readPayment(paymentId, home);
  const failed = transitionPayment(payment, "failed", { error });
  await writePayment(failed, home);
  await appendAuditEntry(
    "payment.failed",
    { paymentId: failed.id, network: failed.network, error },
    home,
  );
  return failed;
}

export function transitionPayment(
  payment: PaymentRequest,
  nextStatus: PaymentStatus,
  patch: Partial<PaymentRequest> = {},
): PaymentRequest {
  if (!isAllowedTransition(payment.status, nextStatus)) {
    throw new Error(
      `Cannot transition payment ${payment.id} from ${payment.status} to ${nextStatus}`,
    );
  }
  return {
    ...payment,
    ...patch,
    status: nextStatus,
  };
}

function isAllowedTransition(
  currentStatus: PaymentStatus,
  nextStatus: PaymentStatus,
): boolean {
  if (currentStatus === nextStatus) {
    return false;
  }
  if (currentStatus === "requires_human_approval") {
    return nextStatus === "approved" || nextStatus === "rejected";
  }
  if (currentStatus === "approved") {
    return nextStatus === "sending" || nextStatus === "failed";
  }
  if (currentStatus === "sending") {
    return nextStatus === "sent" || nextStatus === "failed";
  }
  return false;
}
