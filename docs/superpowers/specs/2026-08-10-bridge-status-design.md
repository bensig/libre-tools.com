# Bridge Status Page — Design

Date: 2026-08-10
Status: Approved (pending spec review)

## Problem

Peg-out transactions on the bridge contracts (`x.libre`, `v.libre`, `t.libre`) sit in the `ptxhistory` table under scope `review` until approved via multisig. Operators need a fast, bookmarkable way to see what's awaiting review across all three contracts, plus a general view of pending/completed bridge activity. Today the explorer can show a single contract's table, but the intuitive URL (`/explorer/mainnet/v.libre/ptxhistory/review`) doesn't route — the working form requires a `tables` segment — and there is no cross-contract view.

## Goals

- One page showing all `review` peg-outs across `x.libre`, `v.libre`, `t.libre` with multisig-proposal status per row.
- Deep-linkable tabs for review, peg-outs (all statuses), and peg-ins.
- Fix the intuitive explorer URL so it redirects to the working form.

## Non-goals

- Signing/approving proposals from this page (link out to `/multisig`).
- Historical pagination beyond what `get_table_rows` returns per scope (row counts are small: hundreds).

## Routes

- `/bridge-status` → redirect to `/bridge-status/mainnet/review`
- `/bridge-status/:network` → default tab `review`
- `/bridge-status/:network/:tab` — `tab` ∈ `review` | `pegouts` | `pegins`
- Explorer alias: `/explorer/:network/:contract/ptxhistory/:scope` → redirect to `/explorer/:network/:contract/tables/ptxhistory/:scope` (generalize only for `ptxhistory`/`txhistory`, or safely for any 4th segment that isn't `tables`/`actions` — decision: a `Navigate` route matching `:view` values other than `tables`/`actions` rewrites to the `tables` form).

Network toggle (mainnet/testnet) follows the existing pattern used by Loans/Account pages and updates the URL.

## Data model (verified on chain, 2026-08-10)

Contracts: `x.libre` (BTC), `v.libre` (vault CBTC), `t.libre` (ETH/USDT).

- `ptxhistory` (peg-outs): scopes `review`, `completed`, `canceled`. Row fields: `id`, `from`, `to` (BTC/ETH address), `quantity`, `tx_hash`, `btc_hash`, `burn_hash`, `tx_fee`, `net_amount`, `miner_fee`, `fee_version`.
- `txhistory` (peg-ins): scope `confirmed`. (Other scopes may appear transiently; fetch via `get_table_by_scope` rather than hardcoding.)
- Empty scopes disappear from `get_table_by_scope` (e.g. `t.libre` currently has no `review` scope). Treat missing scope as zero rows, not an error.

## Tabs

1. **Review** (default): merged table of `ptxhistory`/`review` rows from all three contracts. Columns: contract, id, from, to, quantity, msig status. Rows styled as warnings; tab header shows total count badge, e.g. "Review (18)".
2. **Peg-outs**: `ptxhistory` rows across `review` + `completed` + `canceled`, filterable by contract and status, newest (highest id) first.
3. **Peg-ins**: `txhistory` `confirmed` rows per contract, same filter/sort pattern.

All three contracts are fetched in parallel; a per-contract fetch failure renders an inline error for that contract without blanking the others.

## Msig cross-reference (Review tab only)

Reuse the fetch pattern from `MultisigProposals.jsx`:

1. `get_table_by_scope` on `eosio.msig` table `proposal` → proposer scopes.
2. Per scope, fetch `proposal` rows and `approvals2` rows.
3. For each proposal, attempt to match it to a review row: decode the packed transaction where feasible; a proposal matches when its transaction contains an action on one of the bridge contracts. If decoding fails or is impractical client-side, fall back to listing open proposals whose proposer/name suggests bridge relevance and link generically.
4. Per review row, render either a badge "proposal `<name>` (`k/n` approvals)" linking to `/multisig`, or "no proposal yet".

Msig matching is best-effort: failures degrade to the "no proposal detected" state with the generic `/multisig` link, never block rendering of review rows.

## UI / Nav

- New nav item **Bridge Status** in `Layout.jsx` next to the existing **Bridge** (tracker) link. Existing bridge-tracker is unchanged.
- Follows existing Bootstrap styling conventions used across the app.

## Testing

Vitest unit tests (mocked `fetch`) for:

- scope-merge helper (three contracts, missing scopes, one contract failing),
- msig-matching helper (match found, no match, decode failure fallback),
- explorer URL alias redirect mapping.

## Files

- `src/BridgeStatus.jsx` (new page)
- `src/utils/bridgeStatus.js` (fetch/merge/msig-match helpers, unit-testable)
- `src/App.jsx` (routes + explorer alias redirect)
- `src/components/Layout.jsx` (nav item)
