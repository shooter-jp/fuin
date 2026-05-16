import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { FuinToolHandlerOptions } from "./handlers.js";
import { createFuinToolHandlers } from "./handlers.js";

const PreparePaymentSchema = {
  to: z.string(),
  amountUsd: z.string(),
  reason: z.string().optional(),
};

const PaymentStatusSchema = {
  paymentId: z.string(),
};

const ListPaymentsSchema = {
  limit: z.number().int().positive().max(50).optional(),
};

export async function startFuinMcpServer(
  options: FuinToolHandlerOptions,
): Promise<void> {
  const server = new McpServer({
    name: "fuin-wallet",
    version: "0.1.0",
  });
  const handlers = createFuinToolHandlers(options);

  server.registerTool(
    "fuin_get_wallet_address",
    {
      description: "Return the local Fuin wallet address for this agent.",
      inputSchema: {},
      title: "Get Fuin wallet address",
    },
    async () => toolResult(await handlers.fuin_get_wallet_address()),
  );

  server.registerTool(
    "fuin_get_balance",
    {
      description: "Return USDC and ETH balances for the local Fuin wallet.",
      inputSchema: {},
      title: "Get Fuin wallet balance",
    },
    async () => toolResult(await handlers.fuin_get_balance()),
  );

  server.registerTool(
    "fuin_prepare_payment",
    {
      description:
        "Prepare a USDC payment request that requires local human approval.",
      inputSchema: PreparePaymentSchema,
      title: "Prepare Fuin payment",
    },
    async (input) => toolResult(await handlers.fuin_prepare_payment(input)),
  );

  server.registerTool(
    "fuin_get_payment_status",
    {
      description: "Return the status of a local Fuin payment request.",
      inputSchema: PaymentStatusSchema,
      title: "Get Fuin payment status",
    },
    async (input) => toolResult(await handlers.fuin_get_payment_status(input)),
  );

  server.registerTool(
    "fuin_list_recent_payments",
    {
      description: "List recent local Fuin payment requests.",
      inputSchema: ListPaymentsSchema,
      title: "List recent Fuin payments",
    },
    async (input) =>
      toolResult(await handlers.fuin_list_recent_payments(input)),
  );

  await server.connect(new StdioServerTransport());
}

function toolResult<T extends Record<string, unknown>>(data: T) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
    structuredContent: data,
  };
}
