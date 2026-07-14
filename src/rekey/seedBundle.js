import { PublicKey, PrivateKey, KeyType, Bytes } from "@wharfkit/antelope";
import { mnemonicToSeedSync } from "bip39";
import { HDKey } from "@scure/bip32";

const LIBRE_PATH = "m/44'/194'/0'/0/0";

export function canonicalPubKey(key) {
  return PublicKey.from(key).toString();
}

export function deriveLibreKeys(mnemonic) {
  const seed = mnemonicToSeedSync(mnemonic);
  const node = HDKey.fromMasterSeed(seed).derive(LIBRE_PATH);
  if (!node.privateKey) throw new Error("seedBundle: no private key at path");
  // Antelope K1 private key from raw 32-byte secp256k1 scalar.
  // Note: PrivateKey.from({type, array}) is not supported by the installed
  // @wharfkit/antelope version (PrivateKey.from only accepts a PrivateKey or
  // string); construct directly instead, which is equivalent.
  const priv = new PrivateKey(KeyType.K1, new Bytes(node.privateKey));
  return {
    privateKey: priv.toString(),
    publicKey: canonicalPubKey(priv.toPublic().toString()),
  };
}
