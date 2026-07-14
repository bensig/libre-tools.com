export function authBlock(newPubKey) {
  return { threshold: 1, keys: [{ key: newPubKey, weight: 1 }], accounts: [], waits: [] };
}

export function updateauthAction(account, permission, parent, newPubKey) {
  return {
    account: "eosio",
    name: "updateauth",
    authorization: [{ actor: account, permission: "owner" }],
    data: { account, permission, parent, auth: authBlock(newPubKey) },
  };
}

export function buildRekeyActions(account, newPubKey) {
  return [
    updateauthAction(account, "active", "owner", newPubKey),
    updateauthAction(account, "owner", "", newPubKey),
  ];
}
