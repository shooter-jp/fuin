# Quickstart

Initialize a local Fuin wallet:

```sh
npx @fuin/wallet init
```

If you lose `~/.fuin` or forget your passphrase, you may lose access to funds. Use small amounts only in this alpha.

Connect Codex:

```sh
codex mcp add fuin -- npx -y @fuin/wallet mcp
```

Ask Codex:

```text
What is your wallet address?
```

Fund the address with Base Sepolia ETH for gas and Base Sepolia USDC. Use test funds on Base Sepolia before preparing a payment. Then ask:

```text
What is your balance?
```

Prepare a payment:

```text
Send $0.50 to 0x...
```

Open the localhost approval URL returned by Fuin, verify the amount and recipient, enter your passphrase, and approve or reject.
