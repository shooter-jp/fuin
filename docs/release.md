# Release Checklist

Use this checklist before publishing an npm alpha.

- Confirm the working tree is clean except for the intended release changes.
- Confirm npm 2FA is enabled for the publishing account.
- Install from the lockfile:

```sh
pnpm install --frozen-lockfile
```

- Run the full local verification:

```sh
pnpm build
pnpm typecheck
pnpm test
pnpm lint
pnpm --filter @fuin/wallet exec npm pack --dry-run --json
```

- Inspect the dry-run package output for `dist/index.js`, `dist/ui/index.html`, `README.md`, `LICENSE`, and no `workspace:*` dependencies.
- Publish alpha releases with provenance where available:

```sh
pnpm --filter @fuin/wallet exec npm publish --tag alpha --provenance
```
