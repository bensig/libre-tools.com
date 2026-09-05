# Permission manager for tools.libre.org

> **Status:** LIVE (design — approved in outline 2026-09-05, not yet implemented)
> **Last verified:** 2026-09-05
> Supersedes the scope of `/bot-account` (PR #2), which becomes one template of this.

## What and why

`/bot-account` grants a bot a fixed `agent` permission from four preset bundles. That covers
one case well and nothing else: it can't name a permission, can't link to a contract we
didn't anticipate, and can't show or edit what an account already has.

This generalises it into a permission manager: create, inspect, edit and revoke **named child
permissions of `active`**, linked to actions on **any contract**, with templates seeding the
common cases.

The motivating want was "a permission just for borrowing, or just for trading, or for my own
contract" — which is the same machinery with the contract list unfixed.

## Hard boundary: `active` and `owner` are never written

The tool reads and displays them; it can never emit an `updateauth` or `deleteauth` targeting
them, and permission names are rejected if they are `owner` or `active`.

This is the design's whole safety argument. A wrong `updateauth` on `owner` is an
**unrecoverable lockout** — no reset, no support. By confining writes to child permissions,
the worst outcome is an over-powered child, removable in one transaction. `/rekey` already
exists for the dangerous operation, with staged flows and a challenge transaction; this tool
should not become a second, blunter path to it.

## Chain constraints that shape the design

Both discovered the hard way; both must be encoded, not assumed.

**`deleteauth` refuses a linked authority.** Leap `eosio_contract.cpp:346` — *"Cannot delete a
linked authority. Unlink the authority first."* Every permission this tool creates is linked,
so revocation is always `unlinkauth` × N **then** `deleteauth`, in one transaction. A
create-only tool can ignore this; a manager cannot. (This was shipped wrong in PR #2 and
fixed before merge.)

**Links are not implied by the permission.** `updateauth` alone changes keys; it does not
change what the permission may do. Editing must therefore be a **diff**, not a rewrite:
re-issuing `linkauth` for the desired set leaves previously-linked actions still linked. A
silent over-grant, invisible in the UI unless we read `linked_actions` back.

**`linked_action.action` is optional** (`chain_plugin.hpp:80`) — a contract-wide link with no
specific action. `unlinkauth` takes an empty `type` for that case. Must round-trip correctly
or revocation of such a permission fails.

## Components

### `src/utils/permissions.js` — pure, tested, no React

The whole risk lives here, so it stays a pure module with no UI dependencies.

- `buildCreateActions({ account, permission, key, links })` — `updateauth` (parent `active`,
  threshold 1, one key) + one `linkauth` per link.
- `diffLinks(current, desired)` → `{ add, remove }`, comparing `{account, action}` pairs with
  `action` optional.
- `buildEditActions({ account, permission, key, currentKey, current, desired })` — `updateauth`
  **only if the key changed**, plus `linkauth` for `add` and `unlinkauth` for `remove`. Emits
  nothing when nothing changed.
- `buildRevokeActions({ account, permission, linkedActions })` — unlinks then deletes.
- `validatePermissionName(name)` — Antelope name rules (`[a-z1-5.]{1,12}`), rejecting `owner`
  and `active` explicitly.
- `TEMPLATES` — named presets (`bot`, `trade`, `borrow`, `lend`) reusing the bundles already
  defined in `botAccount.js`, which move here.

### `src/Permissions.jsx` — the page

Four states, one screen:

1. **Inspect.** Account in, permission tree out: every child of `active`, its key, and its
   real `linked_actions` from `/v1/chain/get_account`. `owner`/`active` shown greyed and
   uneditable. Reuses `buildPermTree` from `AccountLookup.jsx`.
2. **Create.** Name, key, actions — from a template or picked directly.
3. **Edit.** Same form pre-filled from chain, showing the **diff** before signing: actions
   being added, actions being removed, whether the key changes.
4. **Revoke.** Confirmation naming the permission and what will be unlinked.

### `src/components/permissions/ActionPicker.jsx`

Type a contract name → `POST /v1/chain/get_abi` → list its actions with checkboxes. This is
what makes "my own contract" work: no hardcoded contract list, anything deployed on Libre.

Caches ABIs per contract for the session. Debounced on input.

## Decisions taken without the operator (overturn if wrong)

**1. URL prefill is limited to named templates, never raw action lists.**
`?account=x&template=trade&network=mainnet` is supported. `?actions=contract::action,…` is
**not**.

Reasoning: a link that pre-selects a *named, inspectable* template is a convenience. A link
that injects an arbitrary action set is a phishing vector — someone sends "set up your bot,
click here", and the victim signs a grant they didn't compose and can't easily read. The
template name is auditable in the UI and in this repo; an arbitrary list is not. The
convenience of shareable custom grants does not justify that.

**2. An unfetchable ABI does not block, but requires an explicit opt-in.**
If `get_abi` fails or returns no actions, the picker shows the error and offers "enter the
action manually" behind a toggle, warning that the action cannot be verified.

Reasoning: refusing outright would break a legitimate case — linking a permission for a
contract **not yet deployed**, which is valid on chain and reasonable when preparing an
account. But silently accepting free text invites typos that produce dead grants. An explicit
toggle keeps the default safe and the capable path available.

## Error handling

- **ABI fetch fails** → surfaced inline with the manual-entry escape hatch above.
- **Account not found** → stated plainly; no form shown.
- **Wallet rejects / transaction fails** → chain error shown verbatim. In particular the
  "Cannot delete a linked authority" message should now be unreachable; if it ever appears,
  the diff logic is wrong and the message says so.
- **Nothing changed** → the sign button is disabled with "no changes to apply", rather than
  emitting an empty transaction.
- **Editing a permission that changed on chain since load** → re-read `linked_actions`
  immediately before building the diff, so a stale view can't cause an unintended unlink.

## Testing

Everything above the UI is pure and unit-tested, following `botAccount.test.js`:

- `diffLinks` — additions, removals, no-ops, and the optional-`action` contract-wide case.
- `buildEditActions` — no `updateauth` when the key is unchanged; correct `linkauth` /
  `unlinkauth` sets; empty output when nothing changed.
- `buildRevokeActions` — unlinks precede the delete; contract-wide links unlink with an empty
  type.
- `validatePermissionName` — rejects `owner`, `active`, names over 12 chars, and invalid
  characters.
- **Boundary tests**: no builder ever emits an action targeting `owner` or `active`, asserted
  across every entry point. This is the safety claim, so it gets an explicit test rather than
  relying on the UI to prevent it.

Component tests are not proposed — the repo has no React testing setup and adding one is out
of scope. The UI stays a thin shell over tested builders.

## Migration of `/bot-account`

`/bot-account` keeps working. `mcp.libre.org` and `docs.libre.org` both publish that URL, so
it cannot 404.

Implementation: `/bot-account` renders `Permissions` with the `bot` template preselected and
the permission name fixed to `agent`. `botAccount.js` moves into `permissions.js`; the four
bundles become templates. The existing tests move with them, including the parity test
asserting the bundles cover the `mcp.libre.org` whitelist exactly.

## Out of scope

- **Multi-key permissions and thresholds** (2-of-3 etc.) — decided against for v1. Every bot
  case is single-key; thresholds add UI and more ways to build something subtly wrong.
- **Account-delegated auth** (`accounts` in a permission's auth, rather than keys).
- **Editing `owner` / `active`** — permanently out of scope for this tool; `/rekey` owns it.
- **Cross-account permissions** — you may only edit permissions on the account you sign with.

## Open question for the operator

Should the **inspect** view be reachable for accounts you don't control — i.e. as a read-only
"what can this account's permissions do" lookup? It is public chain data and useful for
auditing a counterparty or a bot, and `AccountLookup` already shows much of it. The argument
against is only that it makes the page feel like an explorer rather than a tool. Defaulting to
**yes, read-only inspection of any account**, with signing gated to the connected one.
