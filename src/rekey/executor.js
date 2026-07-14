import { buildRekeyActions, updateauthAction } from "./rekeyActions";

// --- Owner-authorization ---------------------------------------------------------
//
// updateauth on the `owner` permission must itself be authorized by `owner`.
// `rekeyActions.js` builds each action with an explicit
// `authorization: [{ actor: account, permission: "owner" }]`, and that is what
// this module submits.
//
// VERIFIED ON TESTNET (2026-07-13): `session.transact({ actions })` HONORS the
// explicit `owner` authorization baked into each action even when the session
// logged in at the default `active` permission level. Confirmed by rotating a
// throwaway testnet account (helloworld) via this exact path with a WharfKit
// session — both owner+active updated in one tx. No `permissionLevel: "owner"`
// login override is needed; the code below ships as-is.

// Path A: both updateauth actions (active + owner) in ONE transaction,
// authorized by account@owner.
export async function executeRekeyOneTx(session, account, newPubKey) {
  const actions = buildRekeyActions(account, newPubKey);
  const result = await session.transact({ actions });
  return { txid: String(result.resolved?.transaction?.id ?? result.response?.transaction_id) };
}

// Path B step 1: rotate ACTIVE only (owner stays as the recovery net until
// the new key has proven control via a challenge in the UI).
export async function executeRekeyActiveThenChallenge(session, account, newPubKey) {
  const result = await session.transact({
    actions: [updateauthAction(account, "active", "owner", newPubKey)],
  });
  return { txid: String(result.resolved?.transaction?.id ?? result.response?.transaction_id) };
}

// Path B step 3: rotate OWNER. Call only AFTER the challenge in the UI has
// verified the new key controls the account (i.e. after
// executeRekeyActiveThenChallenge has succeeded and the challenge passed).
export async function executeRekeyOwner(session, account, newPubKey) {
  const result = await session.transact({
    actions: [updateauthAction(account, "owner", "", newPubKey)],
  });
  return { txid: String(result.resolved?.transaction?.id ?? result.response?.transaction_id) };
}
