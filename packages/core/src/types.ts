export type NetworkId = "base-sepolia" | "base";

export type PaymentStatus =
  | "requires_human_approval"
  | "approved"
  | "rejected"
  | "sending"
  | "sent"
  | "failed";

export type PaymentRequest = {
  id: string;
  source: "mcp" | "cli" | "ui";
  fromAgentName: string;
  fromAddress: string;
  to: string;
  amountUsd: string;
  asset: "USDC";
  network: NetworkId;
  reason?: string;
  status: PaymentStatus;
  approvalTokenHash?: string;
  txHash?: string;
  error?: string;
  createdAt: string;
  approvedAt?: string;
  sentAt?: string;
};

export type PaymentSummary = Pick<
  PaymentRequest,
  | "id"
  | "to"
  | "amountUsd"
  | "asset"
  | "network"
  | "status"
  | "txHash"
  | "error"
  | "createdAt"
  | "approvedAt"
  | "sentAt"
> & {
  reason?: string;
};

export type FuinConfig = {
  version: 1;
  agentName: string;
  network: NetworkId;
  address: string;
  createdAt: string;
};

export type FuinRuntime = {
  version: 1;
  pid: number;
  startedAt: string;
  approvalServer: {
    host: "127.0.0.1";
    port: number;
    url: string;
  };
};

export type EncryptedWallet = {
  version: 1;
  address: string;
  createdAt: string;
  crypto: {
    kdf: "scrypt";
    salt: string;
    n: number;
    r: number;
    p: number;
    keyLength: 32;
    cipher: "aes-256-gcm";
    iv: string;
    authTag: string;
    ciphertext: string;
  };
};

export type AuditEntry = {
  id: string;
  type: string;
  createdAt: string;
  data?: unknown;
};
