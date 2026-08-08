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
