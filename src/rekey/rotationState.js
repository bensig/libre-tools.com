import { updateauthAction } from "./rekeyActions";

// Pure decision helper for the rekey wizard: given the account's on-chain
// owner/active keys and the key we rotated TO, classify how far the rotation got.
// "owner-missing" is the dangerous half-rotated state (active new, owner still old).
export function rotationStatus(keys, expectedKey) {
  const activeOk = keys.active === expectedKey;
  const ownerOk = keys.owner === expectedKey;
  if (activeOk && ownerOk) return "confirmed";
  if (activeOk && !ownerOk) return "owner-missing";
  return "incomplete";
}

// Resume flow: rotate ONLY owner, pointing it at the account's current active key.
// Must be signed by the OLD owner key (owner has no parent).
export function ownerCompletionAction(account, activeKey) {
  return updateauthAction(account, "owner", "", activeKey);
}
