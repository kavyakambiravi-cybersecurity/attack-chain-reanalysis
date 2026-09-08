// Prebuild step: copy data/scenarios -> public/scenarios so Vite serves them as static files.
// public/ is generated and gitignored; never commit it.
import { cp, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, "data", "scenarios");
const dest = join(root, "public", "scenarios");

if (!existsSync(src)) {
  console.error(`copy_scenarios: no ${src}; nothing to copy.`);
  process.exit(1);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });

const copied = await readdir(dest);
console.log(`copy_scenarios: copied ${copied.length} scenario(s) to public/scenarios: ${copied.join(", ")}`);
