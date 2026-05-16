import { describe, expect, it } from "vitest";
import {
  formatUsdcUnits,
  normalizeAmountUsd,
  parseUsdAmountToUsdcUnits,
} from "./amount.js";
import { validateEvmAddress } from "./validation.js";

describe("amount parsing", () => {
  it("parses USD strings into USDC base units", () => {
    expect(parseUsdAmountToUsdcUnits("0.50")).toBe(500_000n);
    expect(parseUsdAmountToUsdcUnits("1")).toBe(1_000_000n);
    expect(parseUsdAmountToUsdcUnits("12.34")).toBe(12_340_000n);
  });

  it("normalizes user amounts to two decimal places", () => {
    expect(normalizeAmountUsd("1")).toBe("1.00");
    expect(normalizeAmountUsd("1.5")).toBe("1.50");
  });

  it("rejects zero, negative, and over-precise amounts", () => {
    expect(() => parseUsdAmountToUsdcUnits("0")).toThrow(/greater than zero/);
    expect(() => parseUsdAmountToUsdcUnits("-1")).toThrow(/positive decimal/);
    expect(() => parseUsdAmountToUsdcUnits("1.234")).toThrow(/2 decimal/);
  });
});

describe("USDC formatting", () => {
  it("formats USDC base units", () => {
    expect(formatUsdcUnits(1_000_000n)).toBe("1");
    expect(formatUsdcUnits(1_230_000n)).toBe("1.23");
  });
});

describe("EVM address validation", () => {
  it("accepts valid EVM addresses", () => {
    expect(
      validateEvmAddress("0x1111111111111111111111111111111111111111"),
    ).toBe("0x1111111111111111111111111111111111111111");
  });

  it("rejects invalid EVM addresses", () => {
    expect(() => validateEvmAddress("not-an-address")).toThrow(/valid EVM/);
  });
});
