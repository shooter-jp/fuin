# Fuin Wallet

Give your AI agent a wallet.

Fuin lets Codex, Claude Code, Cursor, and other MCP agents receive money, check balances, and prepare payments. You approve outgoing sends locally.

Your agent never sees your private key.
No custody. No backend. Local-first. Open source.

Fuin v0.1 is an MVP alpha. Use small amounts only. Base Sepolia is the default network, and Base mainnet support is an explicit opt-in that is not production-ready.

If you lose `~/.fuin` or forget your passphrase, you may lose access to funds. Back up carefully and keep alpha wallets small.

## Quickstart

1. Install / initialize

```sh
npx @fuin/wallet init
```

2. Connect Codex

```sh
codex mcp add fuin -- npx -y @fuin/wallet mcp
```

3. Ask your agent

```text
"What is your wallet address?"
```

4. Send test funds to the address.

Need test funds? Fund the wallet with Base Sepolia ETH for gas and Base Sepolia USDC before preparing a payment.

5. Ask:

```text
"What is your balance?"
```

6. Ask:

```text
"Send $0.50 to 0x..."
```

7. Approve in Fuin.

## Security Model

Fuin creates a local encrypted EVM wallet in `~/.fuin/wallets/default.wallet.json`. The private key is encrypted with Node crypto using `scrypt` and `AES-256-GCM`. Your passphrase is never stored.

Agents can ask Fuin to prepare a payment, but they cannot send funds directly. Fuin returns a localhost approval URL, and the transfer is signed and submitted only after you approve locally and enter your passphrase.

The local approval server binds only to `127.0.0.1`. Mutating approval APIs require a payment-specific local approval token. The token is included in the localhost approval URL, only a hash is stored on disk, and the token is invalidated after approval or rejection.

Audit logs never include private keys, seed phrases, passphrases, or approval tokens. The MCP stdio process keeps stdout reserved for JSON-RPC and writes logs to stderr.

## Supported Networks

Fuin v0.1 supports:

- Base Sepolia by default
- Base mainnet only as an explicit opt-in during `fuin init`

Fuin displays balances in USD terms, but the underlying asset is USDC on Base. Mainnet uses real money and is not production-ready in this MVP alpha.

## What Agents Can Do

- Get the wallet address
- Check USDC and ETH balances
- Prepare a USDC payment request
- Check payment status
- List recent local payment requests

## What Agents Cannot Do

- Read private keys, seed phrases, or passphrases
- Send funds directly
- Bypass local approval
- Auto-approve payments
- Change wallet config files for Codex, Claude Code, or Cursor

Outgoing payments require local human approval in the Fuin approval UI. Agents can prepare payments, but they cannot directly send funds or receive your passphrase.

## CLI

```sh
fuin init
fuin mcp
fuin ui
fuin address
fuin balance
fuin payments
fuin connect codex
fuin connect claude
fuin connect cursor
```

## Development

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm lint
```

Package verification before release:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm --filter @fuin/wallet exec npm pack --dry-run --json
```

Release and supply-chain notes:

- Publish from a clean working tree.
- Keep `pnpm-lock.yaml` committed.
- Verify package contents with `npm pack --dry-run`.
- Use npm 2FA.
- Use npm provenance where available.
- Publish alpha builds with `pnpm --filter @fuin/wallet exec npm publish --tag alpha --provenance`.

See [docs/release.md](docs/release.md) for the release checklist.

Optional RPC overrides:

```sh
export FUIN_BASE_SEPOLIA_RPC_URL="https://..."
export FUIN_BASE_RPC_URL="https://..."
```

For local testing without touching `~/.fuin`, set:

```sh
export FUIN_HOME="/tmp/fuin-dev"
```

## License

Apache-2.0
