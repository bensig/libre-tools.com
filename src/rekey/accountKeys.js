import { canonicalPubKey } from "./seedBundle";

function singleKey(perm) {
  const ra = perm.required_auth;
  if (ra.threshold !== 1 || ra.keys.length !== 1 || ra.accounts.length > 0) {
    throw new Error(`${perm.perm_name}: not a single key threshold-1 auth (multisig/complex — use the manual flow)`);
  }
  return canonicalPubKey(ra.keys[0].key);
}

export async function getAccountKeys(apiUrl, accountName) {
  const res = await fetch(`${apiUrl}/v1/chain/get_account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_name: accountName }),
  });
  if (!res.ok) throw new Error(`get_account failed: ${res.status}`);
  const acct = await res.json();
  const byName = Object.fromEntries(acct.permissions.map((p) => [p.perm_name, p]));
  if (!byName.owner || !byName.active) throw new Error("account missing owner/active");
  return { owner: singleKey(byName.owner), active: singleKey(byName.active) };
}
