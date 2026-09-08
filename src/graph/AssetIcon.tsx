import type { AssetKind } from "../types";

/**
 * One small shape per asset kind, derived from the name by regex, never stated
 * by the model: a screen for a host, a head for a user account, a cloud for
 * something outside the company.
 */
export default function AssetIcon({ kind }: { kind: AssetKind }) {
  if (kind === "host") {
    return (
      <svg viewBox="0 0 24 24" className="asset-icon" aria-hidden="true">
        <rect x="2" y="4" width="20" height="13" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );
  }
  if (kind === "user") {
    return (
      <svg viewBox="0 0 24 24" className="asset-icon" aria-hidden="true">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="asset-icon" aria-hidden="true">
      <path d="M7 19h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.2 4.2 4.2 0 0 0 7 19Z" />
    </svg>
  );
}

export const KIND_WORD: Record<AssetKind, string> = {
  host: "computer",
  user: "account",
  external: "outside the company",
};
