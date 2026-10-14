import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { aventyKeyVaultFromEnv, createAventyKeyVault, redactKey } from "./key-vault";

const hex = () => randomBytes(32).toString("hex");
const KEY = "av_live_9f8e7d6c5b4a39281706f5e4d3c2b1a0";

describe("the Aventy key vault", () => {
  it("seals a key so that only the same channel opens it, and keeps the last four characters as a hint", () => {
    const vault = createAventyKeyVault(hex());
    const sealed = vault.seal("store-a", KEY);
    expect(sealed.ciphertext).not.toContain(KEY);
    expect(Buffer.from(sealed.ciphertext, "base64").toString("latin1")).not.toContain(KEY);
    expect(sealed.hint).toBe("b1a0");
    expect(vault.open("store-a", sealed)).toBe(KEY);
    expect(() => vault.open("store-b", sealed)).toThrow();
    expect(vault.seal("store-a", KEY).ciphertext).not.toBe(sealed.ciphertext);
  });

  it("refuses a tampered ciphertext and an encryption key it does not hold", () => {
    const vault = createAventyKeyVault(hex());
    const sealed = vault.seal("store-a", KEY);
    const raw = Buffer.from(sealed.ciphertext, "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => vault.open("store-a", { ...sealed, ciphertext: raw.toString("base64") })).toThrow();
    expect(() => createAventyKeyVault(hex()).open("store-a", sealed)).toThrow(/No encryption key/);
  });

  it("still opens keys sealed with the previous encryption key during a rotation", () => {
    const old = hex();
    const sealed = createAventyKeyVault(old).seal("store-a", KEY);
    const rotated = createAventyKeyVault(hex(), old);
    expect(rotated.open("store-a", sealed)).toBe(KEY);
    expect(rotated.seal("store-a", KEY).encryptionKeyId).toBe(rotated.currentKeyId);
    expect(rotated.currentKeyId).not.toBe(sealed.encryptionKeyId);
  });

  it("accepts a 32-byte key as hex or base64, refuses anything else, and is off without one", () => {
    expect(() => createAventyKeyVault(randomBytes(32).toString("base64"))).not.toThrow();
    expect(() => createAventyKeyVault("too-short")).toThrow(/32 bytes/);
    expect(aventyKeyVaultFromEnv({})).toBeNull();
  });

  it("redacts a key from any message", () => {
    expect(redactKey(`refused ${KEY} at ${KEY}`, KEY)).toBe("refused •••• at ••••");
  });
});
