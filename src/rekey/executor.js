import { buildRekeyActions, updateauthAction } from "./rekeyActions";

// --- Owner-authorization wrinkle -------------------------------------------------
//
// updateauth on the `owner` permission must itself be authorized by `owner`
// (an account can never re-key its own owner permission using a lower
// permission). `rekeyActions.js` already builds each action with an explicit
// `authorization: [{ actor: account, permission: "owner" }]`, and that is what
// this module submits.
//
// UNVERIFIED ON LIVE CHAIN: WharfKit's `session.transact()` has been observed
// (in other integrations) to override an action's `authorization` with the
// session's own `permissionLevel` (normally `<actor>@active`, set at login)
// rather than honoring the explicit `owner` authorization baked into the
// action data. Whether that happens with this WharfKit version + the
// Bitcoin-Libre / Anchor wallet plugins used here has NOT been confirmed --
// there is no live testnet/wallet available in this environment. A human
// must verify this on testnet per task-5-brief.md Step 5 before this path
// ships:
//
//   - If `session.transact({ actions })` preserves the explicit
//     `owner` authorization on each action (as constructed here), no
//     change is needed -- this is the code path that should ship.
//   - If WharfKit overrides the authorization with the session's
//     permissionLevel, the fix is to log the session in at the `owner`
//     permission level instead of the default `active`, e.g.:
//       sessionKit.login({ walletPlugin, permissionLevel: "owner" })
//     This is valid for Ill-Bloom accounts because owner == active == the
//     same (weak) key being rotated, so the wallet can sign as `owner`.
//     After that change, the actions below can keep their explicit
//     `owner` authorization (harmless/no-op) or it can be dropped, since
//     the session-level permission would already be `owner`.
//
// Do not change this comment to claim testnet verification happened until
// Step 5 of task-5-brief.md has actually been run against testnet.libre.org.

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
