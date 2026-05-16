import { describe, expect, it } from "vitest";
import {
  addressFromPrivateKey,
  createEncryptedWallet,
  decryptPrivateKey,
} from "./wallet.js";

describe("wallet encryption", () => {
  it("encrypts and decrypts a private key with scrypt and AES-GCM", async () => {
    const { privateKey, wallet } = await createEncryptedWallet(
      "correct horse battery staple",
    );

    expect(JSON.stringify(wallet)).not.toContain(privateKey);
    await expect(
      decryptPrivateKey(wallet, "correct horse battery staple"),
    ).resolves.toBe(privateKey);
    expect(wallet.address).toBe(addressFromPrivateKey(privateKey));
  });

  it("rejects incorrect passphrases", async () => {
    const { wallet } = await createEncryptedWallet(
      "correct horse battery staple",
    );
    await expect(
      decryptPrivateKey(wallet, "wrong passphrase"),
    ).rejects.toThrow();
  });
});
