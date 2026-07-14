# Rekey page (tools.libre.org) — Design Spec

**Date:** 2026-07-13
**Status:** Design approved, pending spec review
**Where:** `tools.libre.org` — a **hidden** page at route `/rekey` (added to `App.jsx` routes, NOT surfaced on `Home.jsx`; reachable by direct URL / campaign link only, for now).
**Related:** `bitcoin-libre-expo/docs/superpowers/plans/2026-07-13-weak-seed-migration-engine.md` (mobile engine — shares detection/derivation/action logic).

## Goal

A hidden `/rekey` page that lets a user whose Libre account is on an Ill-Bloom-weak key **rotate `owner`+`active` to a new secure key**, signing with their existing wallet (Anchor or Bitcoin Libre). Companion to the mobile migration engine, for users who won't use the app + recipients of the notification-campaign link.

## Why tools.libre.org

It already has the hard, sensitive part built and working: `SessionKit` + `WalletPluginAnchor` + `WalletPluginBitcoinLibre` with real `walletSession.transact()` (`src/LibreExplorer.jsx`), plus a secure `getRandomValues`-based `SeedGenerator` and `bip39`. accounts.libre.org would require building the whole signing layer from scratch. We reuse what exists.

## Scope

**In:** detect weak key → obtain a new secure key → build the two `updateauth` actions → sign via the existing SessionKit session → verify on-chain. Vite/React SPA route.

**Out (non-goals):**
- **No native BTC sweep.** Web has no seed; cannot reach self-custody BTC. Say so plainly, link to the mobile app. (Mirrors mobile v1.)
- **No default seed-paste.** Signing is wallet-connect. Raw-mnemonic entry is at most a heavily-warned, client-side-only fallback.
- **Not** the full tools.libre.org restyle — see "Design consistency" for what IS in scope here.

## Reused building blocks (tools.libre.org)

- **Signing executor:** the `SessionKit` login flow in `LibreExplorer.jsx` (`handleSessionKitLogin`, `sessionKitArgs.chains`, `sessionKit.login`, `walletSession.transact`). Extract it into `src/utils/session.js` so `/rekey` and the explorer share one implementation. Login yields `session` at `actor@active`; the rekey actions declare `actor@owner` authorization (for Ill-Bloom accounts owner==active==same key, so the logged-in key satisfies owner). Confirm WharfKit lets us set per-action `authorization` to owner (the mobile plan hit the same "session forces its own permissionLevel" wrinkle — resolve the same way).
- **Generator (Path A):** `SeedGenerator.jsx`'s `generateSeed()` (SHA-256 of `getRandomValues` + touch entropy) — extract its pure derivation into a reusable helper.
- **`bip39`** for mnemonic ↔ entropy.

## Shared core (port from the expo plan, pure JS/TS, browser-safe)

- `deriveLibrePubKey` / `canonicalPubKey` (`@wharfkit/antelope` `PublicKey`).
- `hashPubKey` / `isAffected` / `fetchAffectedSet` — detection against the **same** server-published hashed affected-set the app uses (identical "affected?" answer on both surfaces).
- `buildRekeyActions(accountName, newPubKey)` → two `eosio::updateauth` actions (active, owner), authorized by owner.

## The two generation paths (different safety flows — lockout risk)

| Path | New key source | Private key in-browser? | Flow |
|---|---|---|---|
| **A (default)** | Generate in-page (`getRandomValues` path) | Yes (just generated) | Back up phrase (mandatory step) → one tx: `updateauth` active+owner → new key. Safe: key is known-valid. |
| **B (advanced)** | Paste a pubkey from Anchor/Bitcoin-Libre | No — pubkey string only | **Prove control before burning owner:** tx1 active→new; user signs a no-op challenge with the new key via their wallet; tx2 owner→new. A typo'd pubkey rotated into owner = permanent lockout, so the challenge gate is REQUIRED. |

## Data flow

1. User opens `/rekey` (optionally `?account=`).
2. Read `get_account` (reuse the explorer's chain client) → current owner/active pubkey → `isAffected`. Not affected → say so, stop.
3. **Back up current phrase gate (required):** before anything is rotated, the user must confirm they have their **current/old recovery phrase written down**. Until the rotation fully completes and verifies, the old key is the only recovery path if a step fails (especially Path B, where active is rotated before owner). The web tool has no seed access, so this is a confirmation checkpoint — it cannot display or store the old phrase; it tells the user where to find it (Bitcoin Libre app / Anchor) and requires an explicit "I have it backed up" before continuing.
4. Choose Path A (generate + back up new phrase) or B (paste pubkey).
5. Connect wallet via existing SessionKit login (Anchor or Bitcoin Libre).
6. Execute (A: one tx; B: active → challenge → owner). Re-read `get_account`; confirm both perms == new key.
7. Success screen + **explicit BTC notice with app link**: "Your Libre account is secured. If you held Bitcoin from this wallet, you must also move it in the Bitcoin Libre app — this tool cannot."

**Old-seed recovery net:** the old-phrase backup gate (step 3) is the safety net for a mid-flow failure. Note the contrast with the mobile app: the app *holds* the old seed and archives it automatically (`archivedMnemonic` in the mobile plan); the web tool can only require the user to confirm they have it, since it never sees it.

## Error handling / safety

- Never rotate owner to an unproven key (Path B challenge gate). Challenge fail → stop with active rotated, owner intact (recoverable).
- Verify connected wallet actor == target account before signing.
- Detection advisory: affected-set fetch fails → let user proceed manually but don't claim "you're safe."
- Idempotent verify before showing success.
- No secrets leave the browser; Path A phrase client-side only; Path B never sees a private key.

## Design consistency (in scope for /rekey; full-site restyle is follow-on)

The `/rekey` page MUST look like an official Libre property — on a security page, an off-brand look actively undermines the "this is the real site" message we need against phishing copycats. So:
- Adopt the shared visual language of **accounts.libre.org** (see its `uikit/` + `styles/`) and **libre-lending** — same palette, typography, header/footer, button styles.
- Prefer extracting shared tokens/components over re-inventing; if a shared UI kit exists, use it; otherwise mirror accounts.libre.org's uikit locally.
- **Out of scope here:** restyling the rest of tools.libre.org (Home, explorer, other tools). Track that as a separate follow-on plan; `/rekey` can seed the shared components it will use.

## Testing

- Unit (mirror expo vectors): `seed-bundle`, `affected-set`, `actions`.
- Integration: run the executor against **testnet.libre.org** with a throwaway account — Path A (one tx) and Path B (active→challenge→owner); assert `get_account` shows new key on both perms.
- Manual: full wizard on testnet via a real Anchor + Bitcoin-Libre login.

## Open items (verify before promising in UI)

- WharfKit owner-authorization from a session logged in at active (same wrinkle as the mobile plan).
- Bitcoin-Libre wallet plugin can sign `updateauth` (not just transfers).
- Anchor ↔ Libre mainnet chain config in the existing `sessionKitArgs`.
