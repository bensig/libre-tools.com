# `/rekey` — "Change account keys" — Handoff

**Last updated:** 2026-07-13
**Live at:** `https://tools.libre.org/rekey` (hidden — not linked from `Home.jsx` / navbar)
**Repo:** `github.com/bensig/libre-tools.com` · deploys via Netlify on push to `master`
**Related docs:** design spec `docs/superpowers/specs/2026-07-13-rekey-page-design.md`, build plan `docs/superpowers/plans/2026-07-13-rekey-page.md`

## What it is

A self-service page that lets a Libre account holder **rotate `owner`+`active` to a new key**, signing with their existing wallet (Anchor or Bitcoin Libre via WharfKit). Built for the "Ill Bloom" weak-seed incident (Bitcoin Libre Android builds before `prodbuild-11265` / 2024-07-22 generated `Math.random`-backed BIP39 seeds that are brute-forceable). Companion to the mobile-app migration engine in `bitcoin-libre-expo`.

**Anyone can rotate any single-key account they control — there is no "are you weak?" gate** (product decision: re-keying is harmless regardless, and publishing a weak-account list would aid attackers). Multisig/complex-auth accounts are rejected (they need a manual/msig flow).

## Status

| Area | State |
|---|---|
| Path A (generate a new key in-browser → one-tx rotate owner+active) | ✅ **Live & verified on mainnet** (account `recovery`, tx `50c1ef56…`) |
| Owner-auth (`session.transact` honors `@owner` from an `active`-logged-in session) | ✅ **Verified on testnet** — no `permissionLevel:"owner"` fallback needed |
| Key derivation `m/44'/194'/0'/0/0` → K1 | ✅ cross-checked byte-for-byte vs `bitcoin-libre-expo` production derivation |
| Secret handling (phrase + WIF masked, Reveal/Copy) | ✅ |
| Import guidance (Bitcoin Libre = 12-word phrase, Anchor = WIF) | ✅ |
| Result screen self-verifies on-chain (poll + manual re-check) | ✅ |
| Site theme (accounts.libre.org: Poppins + `#1b0aae`) | ✅ live |
| **Path B (paste an Anchor/hardware pubkey → active → challenge → owner)** | ⚠️ **built but NOT live-verified** — the reconnect-and-sign-with-new-key challenge needs a real wallet run |
| Network (mainnet/testnet) visibility badge | ❌ not built — page defaults to **mainnet**; `?network=testnet` switches. A real account WILL rotate if you don't pass the param. |
| `public/rekey-affected-set.json` | placeholder (empty). Only powers an optional non-blocking "known weak key" note; not required for the tool to work. |

## Architecture

**Pure logic (unit-tested with vitest, `src/rekey/__tests__/`):**
- `src/rekey/seedBundle.js` — `canonicalPubKey(k)` → `PUB_K1…`; `deriveLibreKeys(mnemonic)` → `{ privateKey (PVT_K1), wif (legacy 5…, for Anchor), publicKey }`.
- `src/rekey/rekeyActions.js` — `buildRekeyActions(account, newPubKey)` → two `eosio::updateauth` actions (active, owner), each authorized by `account@owner`.
- `src/rekey/accountKeys.js` — `getAccountKeys(apiUrl, account)` → `{owner, active}`; throws on multisig.
- `src/rekey/affectedSet.js` — `hashPubKey`/`isAffected`/`fetchAffectedSet` (optional non-blocking detection).

**Signing (integration; not unit-tested — needs a live chain):**
- `src/utils/session.js` — `createSessionKit({chainId, apiUrl})` (shared with `LibreExplorer.jsx`; Anchor + Bitcoin-Libre plugins).
- `src/rekey/executor.js` — `executeRekeyOneTx` (Path A), `executeRekeyActiveThenChallenge` + `executeRekeyOwner` (Path B). See the verified owner-auth comment at the top.

**UI (React/react-bootstrap):**
- `src/Rekey.jsx` — stepper state machine: `detect → backupOld → choosePath → (generate | paste) → connectSign → success`. Route added in `src/App.jsx` (`<Route path="/rekey" …>`).
- `src/components/rekey/*` — one component per step.
- `src/components/SecretReveal.jsx` — shared masked-secret (Reveal/Copy) widget, also used by `SeedGenerator.jsx`.

## Flow (Path A)

1. Enter account → `getAccountKeys` shows current owner/active (multisig rejected).
2. **Back-up-old gate** — confirm you have your current phrase (until rotation completes, the old key is the only recovery path).
3. Generate: `crypto.getRandomValues(16)` → `bip39.entropyToMnemonic` → `deriveLibreKeys`. **12-word / 128-bit** (Bitcoin Libre only supports 12). Secure-RNG guard throws if `getRandomValues` is missing (non-HTTPS). Shows phrase + WIF masked.
4. Connect wallet (SessionKit) → verify `session.actor === account` → `executeRekeyOneTx` (both perms, one tx).
5. Advance to success screen immediately; it polls `get_account` to confirm (handles load-balancer read lag) with a manual "Check on-chain again" button.
6. Success shows: confirmed key, txids, **"import the new key into your wallet"** (phrase for Bitcoin Libre / WIF for Anchor), and the **native-BTC caveat** (this tool can't move self-custody BTC — use the app).

Path B differs: rotate `active` first, make the user prove control of the new key with a challenge signature, then rotate `owner` (never burn owner to an unproven pasted key).

## Run / test locally

```bash
npm install
npm run dev        # http://localhost:5173/rekey?network=testnet
npm test           # vitest, 9 tests
npm run build      # must pass before deploy
```

To test a real rotation without risking a real account: use `?network=testnet` and a throwaway testnet account whose key is in your Anchor/Bitcoin-Libre wallet. (A headless owner-auth check was done by rotating testnet `helloworld` via `session.transact` with a WalletPluginPrivateKey — that script was not committed.)

## TODO / next

1. **Live-verify Path B** end-to-end with a real wallet on testnet (the challenge reconnect-and-sign step).
2. **Network badge + mainnet confirmation** — the page defaults to mainnet; make the active network obvious and confirm before signing on mainnet, so nobody rotates a real account thinking they're testing.
3. Decide whether to populate `public/rekey-affected-set.json` (only affects the optional info note).
4. When ready for public use, link `/rekey` from `Home.jsx` / navbar (currently hidden).
5. Per-page visual polish of the rest of tools.libre.org (shared theme lifts the chrome; some pages have inline styles).

## Security notes

- Secrets never leave the browser: generation is client-side (`getRandomValues`); Path B never sees a private key; no seed-paste path.
- Phrase + WIF are masked by default (`SecretReveal`); Copy doesn't reveal.
- Authenticity notice on the page tells users the tool is only genuine at `https://tools.libre.org/rekey` with a valid HTTPS cert (anti-phishing).
- Same-key guard: Path B rejects pasting the account's current key.
