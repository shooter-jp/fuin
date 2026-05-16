import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const uiDist = resolve(cliRoot, "../ui/dist");
const target = resolve(cliRoot, "dist/ui");

await mkdir(target, { recursive: true });
await cp(uiDist, target, { recursive: true });
