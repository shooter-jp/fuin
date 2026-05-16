# Security

Fuin Wallet v0.1 is an MVP alpha. Use small amounts only. Base Sepolia is the default network. Do not treat Base mainnet support as production-ready.

## Core Guarantees

- Private keys are never returned from MCP tools.
- Private keys, seed phrases, and passphrases must never be logged.
- The passphrase is never stored.
- The wallet private key is encrypted locally with `scrypt` and `AES-256-GCM`.
- AI agents can prepare payments, but they cannot directly send funds.
- Outgoing payments require local human approval.
- Only the local approval UI can sign and send after passphrase entry.
- The local server binds to `127.0.0.1` only.
- Mutating approval APIs require payment-specific local approval tokens.
- Approval tokens are stored only as hashes and invalidated after approval or rejection.
- Audit logs never include private keys, seed phrases, passphrases, or approval tokens.
- No telemetry, analytics, hosted backend, cloud sync, or remote signing service.

## Reporting

Please report security issues privately before public disclosure. Include the affected version, reproduction steps, and whether funds or private key material could be exposed.

## Local Files

By default Fuin stores files in `~/.fuin`:

- `config.json`
- `runtime.json`
- `wallets/default.wallet.json`
- `payments/*.json`
- `audit.log`

`audit.log` is append-only JSONL and must not include private keys, seed phrases, passphrases, or approval tokens.

## Release Supply Chain

- Publish from a clean working tree.
- Keep `pnpm-lock.yaml` committed.
- Verify `@fuin/wallet` package contents with `npm pack --dry-run --json`.
- Enable npm 2FA.
- Use npm provenance where available.
