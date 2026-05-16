import type { ScryptOptions } from "node:crypto";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from "node:crypto";
import type { Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { EncryptedWallet } from "./types.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_OPTIONS: ScryptOptions = {
  N: SCRYPT_N,
  r: SCRYPT_R,
  p: SCRYPT_P,
  maxmem: 64 * 1024 * 1024,
};

export async function createEncryptedWallet(
  passphrase: string,
  privateKey = createPrivateKey(),
): Promise<{ wallet: EncryptedWallet; privateKey: Hex }> {
  assertPassphrase(passphrase);
  const account = privateKeyToAccount(privateKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    privateKey,
    wallet: {
      version: 1,
      address: account.address,
      createdAt: new Date().toISOString(),
      crypto: {
        kdf: "scrypt",
        salt: salt.toString("base64"),
        n: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        keyLength: 32,
        cipher: "aes-256-gcm",
        iv: iv.toString("base64"),
        authTag: authTag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      },
    },
  };
}

export async function decryptPrivateKey(
  wallet: EncryptedWallet,
  passphrase: string,
): Promise<Hex> {
  assertPassphrase(passphrase);
  const salt = Buffer.from(wallet.crypto.salt, "base64");
  const iv = Buffer.from(wallet.crypto.iv, "base64");
  const authTag = Buffer.from(wallet.crypto.authTag, "base64");
  const ciphertext = Buffer.from(wallet.crypto.ciphertext, "base64");
  const key = await deriveKey(passphrase, salt, {
    N: wallet.crypto.n,
    r: wallet.crypto.r,
    p: wallet.crypto.p,
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const privateKey = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("Decrypted wallet key is invalid");
  }
  return privateKey as Hex;
}

export function addressFromPrivateKey(privateKey: Hex): string {
  return privateKeyToAccount(privateKey).address;
}

function createPrivateKey(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

async function deriveKey(
  passphrase: string,
  salt: Buffer,
  options: ScryptOptions = SCRYPT_OPTIONS,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passphrase, salt, 32, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

function assertPassphrase(passphrase: string): void {
  if (!passphrase || passphrase.length < 8) {
    throw new Error("Passphrase must be at least 8 characters");
  }
}
