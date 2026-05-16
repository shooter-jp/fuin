import { rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");

await Promise.all([
  rm(resolve(cliRoot, "README.md"), { force: true }),
  rm(resolve(cliRoot, "LICENSE"), { force: true }),
]);
