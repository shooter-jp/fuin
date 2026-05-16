import { getBalances as getChainBalances } from "@fuin/chain";
import type { NetworkId, PaymentSummary } from "@fuin/core";
import {
  createPaymentRequest,
  listPayments,
  parseUsdAmountToUsdcUnits,
  readConfig,
  readPayment,
  validateEvmAddress,
} from "@fuin/core";

const LOW_GAS_WARNING_THRESHOLD_WEI = 50_000_000_000_000n;

export type BalanceReader = typeof getChainBalances;

export type FuinToolHandlerOptions = {
  approvalBaseUrl: string;
  home?: string;
  getBalances?: BalanceReader;
};

export type WalletAddressOutput = {
  agentName: string;
  network: NetworkId;
  address: string;
  asset: "USDC";
  message: string;
};

export type BalanceOutput = {
  network: NetworkId;
  address: string;
  balances: {
    usdc: string;
    eth: string;
  };
  display: string;
};

export type PreparePaymentInput = {
  to: string;
  amountUsd: string;
  reason?: string;
};

export type PreparePaymentOutput = {
  paymentId: string;
  status: "requires_human_approval";
  summary: string;
  approvalUrl: string;
  warnings: string[];
};

export type PaymentStatusOutput = {
  paymentId: string;
  status:
    | "requires_human_approval"
    | "approved"
    | "rejected"
    | "sending"
    | "sent"
    | "failed";
  txHash?: string;
  network: NetworkId;
  error?: string;
};

export type ListRecentPaymentsOutput = {
  payments: PaymentSummary[];
};

export function createFuinToolHandlers(options: FuinToolHandlerOptions) {
  const balanceReader = options.getBalances ?? getChainBalances;

  return {
    async fuin_get_wallet_address(): Promise<WalletAddressOutput> {
      const config = await readConfig(options.home);
      return {
        agentName: config.agentName,
        network: config.network,
        address: config.address,
        asset: "USDC",
        message: `${config.agentName}'s Fuin wallet address on ${config.network} is ${config.address}.`,
      };
    },

    async fuin_get_balance(): Promise<BalanceOutput> {
      const config = await readConfig(options.home);
      const balances = await balanceReader(config.network, config.address);
      return {
        network: config.network,
        address: config.address,
        balances: {
          usdc: balances.usdc,
          eth: balances.eth,
        },
        display: `$${balances.usdc} USDC and ${balances.eth} ETH on ${config.network}`,
      };
    },

    async fuin_prepare_payment(
      input: PreparePaymentInput,
    ): Promise<PreparePaymentOutput> {
      const config = await readConfig(options.home);
      const to = validateEvmAddress(input.to);
      const amountUnits = parseUsdAmountToUsdcUnits(input.amountUsd);
      const balances = await balanceReader(config.network, config.address);
      if (balances.usdcRaw < amountUnits) {
        throw new Error(
          `Insufficient USDC balance. Available ${balances.usdc} USDC.`,
        );
      }

      const warnings: string[] = [];
      if (balances.ethRaw < LOW_GAS_WARNING_THRESHOLD_WEI) {
        warnings.push(
          "ETH balance may be too low to pay gas for this USDC transfer.",
        );
      }

      const payment = await createPaymentRequest(
        {
          source: "mcp",
          config,
          to,
          amountUsd: input.amountUsd,
          reason: input.reason,
        },
        options.home,
      );

      return {
        paymentId: payment.id,
        status: "requires_human_approval",
        summary: `Approve sending $${payment.amountUsd} USDC to ${payment.to} on ${payment.network}.`,
        approvalUrl: `${options.approvalBaseUrl}/approve/${payment.id}?token=${encodeURIComponent(payment.approvalToken)}`,
        warnings,
      };
    },

    async fuin_get_payment_status(input: {
      paymentId: string;
    }): Promise<PaymentStatusOutput> {
      const payment = await readPayment(input.paymentId, options.home);
      return {
        paymentId: payment.id,
        status: payment.status,
        txHash: payment.txHash,
        network: payment.network,
        error: payment.error,
      };
    },

    async fuin_list_recent_payments(input: {
      limit?: number;
    }): Promise<ListRecentPaymentsOutput> {
      const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
      const payments = await listPayments(limit, options.home);
      return { payments };
    },
  };
}
