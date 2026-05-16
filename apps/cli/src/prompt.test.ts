import { afterEach, describe, expect, it } from "vitest";
import { promptHidden } from "./prompt.js";

const originalIsTty = process.stdin.isTTY;

afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value: originalIsTty,
  });
});

describe("promptHidden", () => {
  it("fails closed instead of falling back to a visible prompt without a TTY", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: false,
    });

    await expect(promptHidden("Passphrase")).rejects.toThrow(
      /interactive terminal/,
    );
  });
});
