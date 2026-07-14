import { canonicalPubKey } from "./seedBundle";

export async function hashPubKey(pubkey) {
  const canon = canonicalPubKey(pubkey);
  const data = new TextEncoder().encode(canon);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function isAffected(pubkey, set) {
  return set.hashes.includes(await hashPubKey(pubkey));
}

export async function fetchAffectedSet(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`affected-set fetch failed: ${res.status}`);
  const json = await res.json();
  if (!json || !Array.isArray(json.hashes)) throw new Error("affected-set: malformed payload");
  return { hashes: json.hashes };
}
