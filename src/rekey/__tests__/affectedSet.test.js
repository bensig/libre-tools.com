import { describe, it, expect } from "vitest";
import { hashPubKey, isAffected } from "../affectedSet";
import { deriveLibreKeys } from "../seedBundle";

const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("affectedSet", () => {
  it("hashes canonical pubkeys deterministically", async () => {
    const { publicKey } = deriveLibreKeys(MNEMONIC);
    const h1 = await hashPubKey(publicKey);
    const h2 = await hashPubKey(publicKey);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches a member and rejects a non-member", async () => {
    const { publicKey } = deriveLibreKeys(MNEMONIC);
    const set = { hashes: [await hashPubKey(publicKey)] };
    expect(await isAffected(publicKey, set)).toBe(true);
    expect(await isAffected("PUB_K1_8dzyEjmyrhP23gM7g6pQb3YFVbDEw2FVh9h9ywoGirXbVrTGy2", set)).toBe(false);
  });
});
