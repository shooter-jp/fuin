import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const distIndex = resolve(cliRoot, "dist/index.js");
const packageIt = existsSync(distIndex) ? it : it.skip;

describe("@fuin/wallet package", () => {
  packageIt(
    "packs docs, built CLI, UI assets, and no workspace dependencies",
    async () => {
      const { stdout } = await execFileAsync(
        "npm",
        ["pack", "--dry-run", "--json"],
        {
          cwd: cliRoot,
          maxBuffer: 1024 * 1024,
        },
      );
      const packOutput = JSON.parse(stdout) as Array<{
        files: Array<{ path: string; mode: number }>;
      }>;
      const pack = packOutput[0];
      if (!pack) {
        throw new Error("npm pack did not return package metadata");
      }
      const files = new Set(pack.files.map((file) => file.path));
      const manifest = readFileSync(resolve(cliRoot, "package.json"), "utf8");
      const bin = readFileSync(distIndex, "utf8");

      expect(files).toContain("README.md");
      expect(files).toContain("LICENSE");
      expect(files).toContain("dist/index.js");
      expect(files).toContain("dist/ui/index.html");
      expect(manifest).not.toContain("workspace:*");
      expect(bin.startsWith("#!/usr/bin/env node")).toBe(true);
      if (process.platform !== "win32") {
        expect(statSync(distIndex).mode & 0o111).not.toBe(0);
      }
    },
  );
});
