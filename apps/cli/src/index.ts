import { getBalances, getNetwork } from "@fuin/chain";
import {
  appendAuditEntry,
  createEncryptedWallet,
  ensureFuinHome,
  fileExists,
  getFuinPaths,
  listPayments,
  readConfig,
  writeConfig,
  writeDefaultWallet,
} from "@fuin/core";
import { startFuinMcpServer } from "@fuin/mcp";
import { Command } from "commander";
import { promptHidden, promptText } from "./prompt.js";
import { startApprovalServer } from "./server/approvalServer.js";

const program = new Command();

program
  .name("fuin")
  .description("Fuin Wallet: give your AI agent a wallet.")
  .version("0.1.0");

program
  .command("init")
  .description("Create a local encrypted Fuin agent wallet")
  .action(async () => {
    const paths = getFuinPaths();
    await ensureFuinHome();
    if ((await fileExists(paths.config)) || (await fileExists(paths.wallet))) {
      throw new Error(`Fuin is already initialized at ${paths.home}`);
    }

    const agentName = await promptText("Agent name", "Fuin Agent");
    const networkAnswer = await promptText(
      "Network: base-sepolia or base",
      "base-sepolia",
    );
    const normalizedNetworkAnswer = networkAnswer.toLowerCase();
    if (
      normalizedNetworkAnswer !== "base" &&
      normalizedNetworkAnswer !== "base-sepolia"
    ) {
      throw new Error("Network must be base-sepolia or base");
    }
    const network = normalizedNetworkAnswer;

    if (network === "base") {
      const confirmation = await promptText(
        'Base mainnet uses real money. Type "I understand this uses real money" to continue',
      );
      if (confirmation !== "I understand this uses real money") {
        throw new Error("Mainnet initialization cancelled");
      }
    }

    const passphrase = await promptHidden("Passphrase");
    const confirmation = await promptHidden("Confirm passphrase");
    if (passphrase !== confirmation) {
      throw new Error("Passphrases do not match");
    }

    const { wallet } = await createEncryptedWallet(passphrase);
    await writeDefaultWallet(wallet);
    await writeConfig({
      version: 1,
      agentName,
      network,
      address: wallet.address,
      createdAt: new Date().toISOString(),
    });
    await appendAuditEntry("wallet.initialized", {
      agentName,
      network,
      address: wallet.address,
    });

    console.log("Fuin wallet initialized.");
    console.log(`Agent: ${agentName}`);
    console.log(`Network: ${getNetwork(network).displayName}`);
    console.log(`Address: ${wallet.address}`);
    console.log("");
    console.log("Connect Codex:");
    console.log("codex mcp add fuin -- npx -y @fuin/wallet mcp");
  });

program
  .command("mcp")
  .description("Start the Fuin MCP stdio server and local approval server")
  .action(async () => {
    const approvalServer = await startApprovalServer();
    console.error(`Fuin approval server listening on ${approvalServer.url}`);
    await startFuinMcpServer({ approvalBaseUrl: approvalServer.url });
  });

program
  .command("ui")
  .description("Start the local Fuin approval UI")
  .action(async () => {
    const approvalServer = await startApprovalServer();
    console.log(`Fuin approval UI: ${approvalServer.url}`);
    keepProcessAlive(approvalServer.close);
  });

program
  .command("address")
  .description("Print the current wallet address")
  .action(async () => {
    const config = await readConfig();
    console.log(config.address);
  });

program
  .command("balance")
  .description("Print USDC and ETH balances")
  .action(async () => {
    const config = await readConfig();
    const balances = await getBalances(config.network, config.address);
    console.log(`Network: ${getNetwork(config.network).displayName}`);
    console.log(`Address: ${config.address}`);
    console.log(`USDC: ${balances.usdc}`);
    console.log(`ETH: ${balances.eth}`);
  });

program
  .command("payments")
  .description("List recent local payment requests")
  .option("-l, --limit <number>", "number of payments to list", "20")
  .action(async (options: { limit: string }) => {
    const payments = await listPayments(Number(options.limit));
    console.log(JSON.stringify({ payments }, null, 2));
  });

program
  .command("connect")
  .description("Print MCP setup instructions")
  .argument("<client>", "codex, claude, or cursor")
  .action((client: string) => {
    if (client === "codex") {
      console.log("codex mcp add fuin -- npx -y @fuin/wallet mcp");
      return;
    }
    if (client === "claude") {
      console.log(
        "claude mcp add --transport stdio fuin -- npx -y @fuin/wallet mcp",
      );
      return;
    }
    if (client === "cursor") {
      console.log(
        JSON.stringify(
          {
            mcpServers: {
              fuin: {
                command: "npx",
                args: ["-y", "@fuin/wallet", "mcp"],
              },
            },
          },
          null,
          2,
        ),
      );
      return;
    }
    throw new Error("Unknown client. Use codex, claude, or cursor.");
  });

try {
  await program.parseAsync(process.argv);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function keepProcessAlive(close: () => Promise<void>): void {
  const shutdown = async () => {
    await close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
