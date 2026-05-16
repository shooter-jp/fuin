# Agent Guidance

Fuin Wallet is a local-first wallet for MCP agents. Treat it as security-sensitive code.

## Hard Rules

- Do not expose private keys, seed phrases, or passphrases.
- Do not add a direct send MCP tool.
- Do not add telemetry, analytics, a hosted backend, cloud sync, or remote signing.
- Do not bind the approval server to `0.0.0.0`.
- Do not write normal MCP logs to stdout.
- Do not make Base mainnet the default.

## Development Commands

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

## Scope

Fuin v0.1 supports only USDC on Base Sepolia by default, with Base mainnet as an explicit opt-in.
