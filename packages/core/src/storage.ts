import { randomUUID } from "node:crypto";
import {
  appendFile,
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { getFuinPaths } from "./paths.js";
import type {
  AuditEntry,
  EncryptedWallet,
  FuinConfig,
  FuinRuntime,
  PaymentRequest,
  PaymentSummary,
} from "./types.js";

export async function ensureFuinHome(home?: string): Promise<void> {
  const paths = getFuinPaths(home);
  await mkdir(paths.home, { recursive: true, mode: 0o700 });
  await mkdir(paths.walletsDir, { recursive: true, mode: 0o700 });
  await mkdir(paths.paymentsDir, { recursive: true, mode: 0o700 });
  await chmodBestEffort(paths.home, 0o700);
  await chmodBestEffort(paths.walletsDir, 0o700);
  await chmodBestEffort(paths.paymentsDir, 0o700);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function atomicWriteFile(
  filePath: string,
  data: string,
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tempPath, filePath);
  await chmodBestEffort(filePath, 0o600);
  await fsyncDirectory(dirname(filePath));
}

export async function atomicWriteJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const data = await readFile(filePath, "utf8");
  return JSON.parse(data) as T;
}

export async function writeConfig(
  config: FuinConfig,
  home?: string,
): Promise<void> {
  await ensureFuinHome(home);
  await atomicWriteJson(getFuinPaths(home).config, config);
}

export async function readConfig(home?: string): Promise<FuinConfig> {
  return readJsonFile<FuinConfig>(getFuinPaths(home).config);
}

export async function writeRuntime(
  runtime: FuinRuntime,
  home?: string,
): Promise<void> {
  await ensureFuinHome(home);
  await atomicWriteJson(getFuinPaths(home).runtime, runtime);
}

export async function readRuntime(home?: string): Promise<FuinRuntime> {
  return readJsonFile<FuinRuntime>(getFuinPaths(home).runtime);
}

export async function writeDefaultWallet(
  wallet: EncryptedWallet,
  home?: string,
): Promise<void> {
  await ensureFuinHome(home);
  await atomicWriteJson(getFuinPaths(home).wallet, wallet);
}

export async function readDefaultWallet(
  home?: string,
): Promise<EncryptedWallet> {
  return readJsonFile<EncryptedWallet>(getFuinPaths(home).wallet);
}

const PAYMENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidPaymentId(paymentId: string): boolean {
  return PAYMENT_ID_PATTERN.test(paymentId);
}

export function assertValidPaymentId(paymentId: string): void {
  if (!isValidPaymentId(paymentId)) {
    throw new Error("Invalid payment id");
  }
}

export function paymentPath(paymentId: string, home?: string): string {
  assertValidPaymentId(paymentId);
  return join(getFuinPaths(home).paymentsDir, `${paymentId}.json`);
}

export async function writePayment(
  payment: PaymentRequest,
  home?: string,
): Promise<void> {
  await ensureFuinHome(home);
  await atomicWriteJson(paymentPath(payment.id, home), payment);
}

export async function readPayment(
  paymentId: string,
  home?: string,
): Promise<PaymentRequest> {
  return readJsonFile<PaymentRequest>(paymentPath(paymentId, home));
}

export async function listPayments(
  limit = 20,
  home?: string,
): Promise<PaymentSummary[]> {
  const paths = getFuinPaths(home);
  await ensureFuinHome(home);
  const entries = await readdir(paths.paymentsDir);
  const payments = await Promise.all(
    entries
      .filter((entry) => entry.endsWith(".json"))
      .map(async (entry) =>
        readJsonFile<PaymentRequest>(join(paths.paymentsDir, entry)),
      ),
  );
  return payments
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, Math.max(0, limit))
    .map(toPaymentSummary);
}

export async function appendAuditEntry(
  type: string,
  data?: unknown,
  home?: string,
): Promise<AuditEntry> {
  await ensureFuinHome(home);
  const entry: AuditEntry = {
    id: randomUUID(),
    type,
    createdAt: new Date().toISOString(),
    data: sanitizeForAudit(data),
  };
  await appendFile(getFuinPaths(home).auditLog, `${JSON.stringify(entry)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmodBestEffort(getFuinPaths(home).auditLog, 0o600);
  return entry;
}

export async function resetFuinHomeForTests(home: string): Promise<void> {
  await rm(home, { force: true, recursive: true });
}

export function toPaymentSummary(payment: PaymentRequest): PaymentSummary {
  return {
    id: payment.id,
    to: payment.to,
    amountUsd: payment.amountUsd,
    asset: payment.asset,
    network: payment.network,
    reason: payment.reason,
    status: payment.status,
    txHash: payment.txHash,
    error: payment.error,
    createdAt: payment.createdAt,
    approvedAt: payment.approvedAt,
    sentAt: payment.sentAt,
  };
}

export function sanitizeForAudit(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForAudit(item));
  }
  if (typeof value === "string") {
    return redactTokenQueryParams(value);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (isSecretKey(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeForAudit(nestedValue);
  }
  return output;
}

function isSecretKey(key: string): boolean {
  return /private.?key|passphrase|seed.?phrase|mnemonic|secret|token|approval.?url/i.test(
    key,
  );
}

function redactTokenQueryParams(value: string): string {
  return value.replace(/([?&][^=&\s]*token[^=&\s]*=)[^&\s]+/gi, "$1[redacted]");
}

async function chmodBestEffort(path: string, mode: number): Promise<void> {
  if (process.platform === "win32") {
    return;
  }
  try {
    await chmod(path, mode);
  } catch {
    // chmod is best-effort because not every filesystem supports POSIX modes.
  }
}

async function fsyncDirectory(path: string): Promise<void> {
  try {
    const handle = await open(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is best-effort and not portable across every filesystem.
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
