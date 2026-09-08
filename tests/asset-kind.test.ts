import { describe, expect, it } from "vitest";
import { assetKind } from "../src/types";

describe("assetKind", () => {
  it.each([
    ["203.0.113.47", "external"],
    ["198.51.100.22", "external"],
    ["151.101.1.140 (fastly-cdn)", "external"],
    ["192.0.2.20 (corp-vpn-gateway)", "external"],
    ["WKSTN-042", "host"],
    ["FILESRV-01", "host"],
    ["DC-01", "host"],
    ["MAIL-01", "host"],
    ["jsmith", "user"],
    ["administrator", "user"],
    ["svc_backup", "user"],
  ])("classifies %s as %s", (name, kind) => {
    expect(assetKind(name)).toBe(kind);
  });
});
