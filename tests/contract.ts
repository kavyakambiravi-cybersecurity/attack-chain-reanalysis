// Shared helpers for reading the frozen contract examples and the generated scenarios.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("../", import.meta.url);

export function repoPath(relative: string): string {
  return fileURLToPath(new URL(relative, repoRoot));
}

export function readJson<T = unknown>(relative: string): T {
  return JSON.parse(readFileSync(repoPath(relative), "utf8")) as T;
}

export function repoFileExists(relative: string): boolean {
  return existsSync(repoPath(relative));
}

export function contract<T = unknown>(name: string): T {
  return readJson<T>(`specs/001-attack-chain-reanalysis/contract/${name}`);
}
