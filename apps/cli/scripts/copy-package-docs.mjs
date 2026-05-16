import { copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const repoRoot = resolve(cliRoot, "../..");

await copyFile(resolve(repoRoot, "README.md"), resolve(cliRoot, "README.md"));
await copyFile(resolve(repoRoot, "LICENSE"), resolve(cliRoot, "LICENSE"));
