# Rekey: guarantee owner rotation & recover half-rotated accounts

Date: 2026-08-07
Status: design (approved shape, pending spec review)

## Problem

The rekey wizard can leave an account **half-rotated**: `active` points at the new
key while `owner` still holds the old key. Because `owner` is the parent of
`active`, whoever holds `owner` can reset `active` at will — so a half-rotated
account is effectively **not secured**, even though the UI can read as "done." If
the rotation was in response to a compromised/weak key, the attacker still controls
the account through `owner`.

### Confirmed real-world instance

Account `cboylibre` (mainnet), rotated 2026-08-07T07:01:19Z:

- Current on-chain state: `active = PUB_K1_5nsU1i…LSqSU5c` (new), `owner = PUB_K1_7E8CwR…NN6mV8RTrW` (old, unchanged).
- Hyperion history shows **exactly one** `eosio:updateauth` ever applied to the account:
  tx `ae7420ca60ffea1ff355984abd6afe32d82a7f31c028e0acf64ca2a866ca7853`, containing a
  **single action**: `updateauth perm=active parent=owner auth=[new key] authorization=[cboylibre@owner]`.
- The owner-rotation action was **never in the transaction** — not rejected, absent.

### Root cause (two candidates; one blocks the design)

`executeRekeyOneTx` (Generate / "Path A") builds a **two-action** tx (active + owner).
The landed tx had **one** action. That is only consistent with either:

1. The user was on the **staged path** (`executeRekeyActiveThenChallenge`, active-only)
   and never completed the challenge → owner step, **or**
2. **Bitcoin Libre Wallet stripped the `owner`-permission `updateauth`** from the
   two-action tx and submitted only the active action.

On-chain data cannot distinguish these. Candidate 2 is plausible (wallets commonly
refuse owner-permission edits) and, if true, means **no path in this tool can rotate
owner via Bitcoin Libre Wallet** — owner rotations (including the recovery flow) would
have to go through Anchor. The executor's own comment records that the one-tx path was
verified only with **Anchor/WharfKit on testnet**, never with Bitcoin Libre Wallet
(`src/rekey/executor.js:11-15`). Resolving this is Part 1 and gates the rest.

### Contributing UI weakness

`SuccessStep` already verifies `owner==new && active==new` before showing "Confirmed"
(`src/components/rekey/SuccessStep.jsx:20`), but:

- its card title asserts "Your account keys have been changed" **before** verification resolves, and
- the not-yet-confirmed branch is framed as benign **load-balancer lag** ("almost always
  resolves within a few seconds"), which under-sells a genuine owner-didn't-rotate failure.

## Goals

1. **Prevent:** no future rotation ends silently at active-only. The tool either
   completes owner or shows an unambiguous, actionable "owner NOT rotated" state.
2. **Resume:** an account already stuck half-rotated can finish owner from the tool.
3. **Clarify:** de-conflate the overloaded `path` value so a future path can't
   accidentally inherit active-only behavior.

Non-goals: multisig/complex-auth accounts (still out of scope, unchanged);
changing the generate-vs-paste UX; supporting an owner key that differs from active
(the tool's model is single-key, owner == active).

## Part 1 — Confirm the mechanism (do first, no code)

Run one rotation on **testnet** with **Bitcoin Libre Wallet** through the existing
Generate/Path-A flow. Inspect the resulting transaction's action count via Hyperion
`get_transaction`:

- **Two actions landed (owner+active):** Candidate 1. Bitcoin Libre Wallet honors
  owner `updateauth`. The stranding is purely the staged-path / UI issue → Parts 2-4
  as written.
- **One action landed (active only):** Candidate 2. Bitcoin Libre Wallet strips owner
  `updateauth`. Then additionally:
  - Owner rotation (fresh and resume) must be routed to **Anchor** for Bitcoin Libre
    Wallet users; the UI must say so explicitly.
  - The success/resume screens must detect this wallet and warn before the user
    believes owner will rotate.

This outcome is recorded in the spec/plan before Parts 2-4 are finalized.

## Part 2 — Prevent: verify-before-success, no ambiguous "done"

`src/components/rekey/SuccessStep.jsx`:

- The card must not assert completion until verification resolves. While `status ===
  "checking"`, the title is neutral (e.g. "Confirming your key rotation"). Only
  `status === "confirmed"` (owner==new AND active==new) shows a success title.
- Replace the single `pending` branch with two distinct outcomes derived from the
  on-chain read:
  - **active==new but owner!=new →** a `danger`-level state:
    "⚠ Owner NOT rotated — your account is only half-secured. Anyone holding the old
    owner key can reset your account." Primary action: **Finish owner rotation** →
    routes into the Part 3 resume flow (owner-only), pre-filled for this account.
  - **neither==new yet →** keep the existing benign load-balancer-lag copy + "Check
    again" (this really is read lag).
- Distinguishing the two requires reading both permissions (already available from
  `getAccountKeys`); no new endpoint.

## Part 3 — Resume: finish a half-rotated account

Entry via `DetectStep` (already reads owner+active):

- When `owner !== active`, surface a **Finish owner rotation** entry alongside the
  normal Continue. It jumps directly to a connect-and-sign screen that submits a
  **single** owner-only `updateauth` setting `owner` to the **current active key**
  (reuse `executeRekeyOwner`; target key = the account's existing active key, no new
  key generated).
- After signing, verify `owner == active` on-chain before showing success (same
  verify-before-success rule as Part 2).

**Hard requirements surfaced in the UI up front:**

- Finishing owner **must be signed by the old owner key** — `owner` has no parent, so
  only `owner` can rotate `owner`. The new active key **cannot** do it. If the user no
  longer has the old seed, the tool cannot help and owner is permanently stuck; say
  this before they connect.
- If Part 1 = Candidate 2: for Bitcoin Libre Wallet users this step must direct them to
  **Anchor with the old private key (WIF)**, because Bitcoin Libre Wallet won't sign an
  owner `updateauth`.

Note: `owner !== active` is not *proof* the account was half-rotated by this tool
(an account may legitimately run split keys). The entry is therefore an **offer**,
clearly labeled ("If you meant to rotate both keys, finish owner"), never an
auto-forced step.

## Part 4 — De-conflate `path`

Today `path` ("A"/"B") simultaneously means "generate vs paste" **and** selects the
transaction strategy in `ConnectSignStep` (one-tx vs staged). Split them:

- Keep the generate/paste choice for what it is (how the key is supplied).
- Make transaction strategy an explicit value (e.g. `txStrategy: "oneTx" | "staged" |
  "ownerOnly"`) passed to `ConnectSignStep`, derived deliberately rather than reused
  from the key-source choice.
- `ownerOnly` is the Part 3 resume strategy.

This is a rename/threading change, no behavior change beyond making the resume
strategy expressible.

## Testing

- **Unit** (`src/rekey/__tests__/`):
  - owner-only resume action builds the correct `updateauth` (perm=owner, parent="",
    auth=target active key, authorization=account@owner).
  - `txStrategy` selection maps correctly for generate / paste / resume.
- **Component:** SuccessStep renders the three outcomes correctly given mocked
  `getAccountKeys` returns: both-new → confirmed; active-new/owner-old → danger +
  Finish-owner CTA; neither-new → lag/pending.
- **Manual (required):** the Part 1 Bitcoin Libre Wallet testnet run, and — if
  Candidate 2 — an Anchor-with-old-WIF owner-completion run on testnet, before ship.

## Immediate operational note (out of band from the code change)

`cboylibre` can be finished now, independent of these changes, by signing a single
owner `updateauth` (owner → current active key) **with the old owner key**
(`PUB_K1_7E8CwR…NN6mV8RTrW`). If Bitcoin Libre Wallet won't sign it, use Anchor with
the old WIF.
