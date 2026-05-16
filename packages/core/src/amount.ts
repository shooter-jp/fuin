const USDC_DECIMALS = 6n;
const USDC_BASE_UNITS = 10n ** USDC_DECIMALS;

export function parseUsdAmountToUsdcUnits(amountUsd: string): bigint {
  const normalized = normalizeAmountUsd(amountUsd);
  const [wholePart = "0", decimalPart = ""] = normalized.split(".");
  const fractionalUnits = BigInt(decimalPart.padEnd(6, "0"));
  return BigInt(wholePart) * USDC_BASE_UNITS + fractionalUnits;
}

export function normalizeAmountUsd(amountUsd: string): string {
  const trimmed = amountUsd.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (!match) {
    throw new Error(
      "amountUsd must be a positive decimal string with up to 2 decimal places",
    );
  }
  const wholePart = match[1] ?? "0";
  const decimalPart = (match[2] ?? "").padEnd(2, "0");
  const units = BigInt(wholePart) * 100n + BigInt(decimalPart);
  if (units <= 0n) {
    throw new Error("amountUsd must be greater than zero");
  }
  return `${wholePart}.${decimalPart}`;
}

export function formatUsdcUnits(units: bigint): string {
  const whole = units / USDC_BASE_UNITS;
  const fraction = units % USDC_BASE_UNITS;
  const fractionText = fraction.toString().padStart(6, "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}
