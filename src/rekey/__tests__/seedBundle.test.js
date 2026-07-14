import { describe, it, expect } from "vitest";
import { canonicalPubKey, deriveLibreKeys } from "../seedBundle";

// Standard BIP39 test vector (public, throwaway).
const MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("seedBundle", () => {
  it("canonicalizes to PUB_K1 and is idempotent", () => {
    const { publicKey } = deriveLibreKeys(MNEMONIC);
    expect(publicKey.startsWith("PUB_K1_")).toBe(true);
    expect(canonicalPubKey(publicKey)).toBe(publicKey);
  });

  it("derives stable keys from a mnemonic", () => {
    const a = deriveLibreKeys(MNEMONIC);
    const b = deriveLibreKeys(MNEMONIC);
    expect(a.publicKey).toBe(b.publicKey);
    expect(a.privateKey.startsWith("PVT_K1_")).toBe(true);
    // Matches the Libre EOS path derivation for this vector (cross-checked
    // against bitcoin-libre-expo's mnemonicToEOSPublicKey: same raw
    // secp256k1 pubkey bytes, 0315c358...97197, re-encoded as PUB_K1).
    expect(a.publicKey).toBe("PUB_K1_6zpSNY1YoLxNt2VsvJjoDfBueU6xC1M1ERJw1UoekL1NK2aD4t");
  });
});
