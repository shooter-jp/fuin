import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@fuin/chain": new URL("./packages/chain/src/index.ts", import.meta.url)
        .pathname,
      "@fuin/core": new URL("./packages/core/src/index.ts", import.meta.url)
        .pathname,
      "@fuin/mcp": new URL("./packages/mcp/src/index.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
