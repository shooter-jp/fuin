# Security Model

Fuin Wallet v0.1 is an MVP alpha. Use small amounts only. Base Sepolia is the default network. Base mainnet is an explicit opt-in and is not production-ready.

Fuin is local-first. It has no hosted backend, no telemetry, no analytics, no cloud sync, and no remote signing service.

The local wallet private key is encrypted with Node crypto using `scrypt` and `AES-256-GCM`. The passphrase is required to decrypt the private key and is never stored.

MCP agents can:

- Get the wallet address
- Read balances
- Prepare a local payment request
- Check payment status
- List recent payments

MCP agents cannot:

- Read private key material
- Read passphrases
- Sign transactions
- Send funds directly
- Approve their own payments

The approval server binds to `127.0.0.1` only. Mutating approval APIs require payment-specific local approval tokens. Only a token hash is stored on disk, and the token is invalidated after approval or rejection.

Approval requires passphrase entry in the local UI. Rejecting a payment does not require a passphrase, but it still requires the local approval token.

Audit logs never include private keys, seed phrases, passphrases, or approval tokens.

Rejected payments cannot later be approved. Sent payments cannot be sent again.
