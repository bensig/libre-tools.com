# Rekey Owner-Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee the rekey wizard never silently ends at active-only, let a half-rotated account finish its owner rotation, and de-conflate the overloaded `path` value.

**Architecture:** Extract the "did the rotation complete?" decision and the owner-only action builder into pure, unit-tested helpers (`src/rekey/rotationState.js`), matching this repo's pure-logic test style (Vitest, no React Testing Library). The JSX steps (`SuccessStep`, `DetectStep`, `ConnectSignStep`) consume those helpers and gain a resume entry. Transaction strategy becomes an explicit prop instead of piggybacking on the generate/paste `path`.

**Tech Stack:** React 18 + react-bootstrap, WharfKit session (`src/utils/session.js`), Vitest.

## Global Constraints

- Test runner: `npx vitest run` (single run, no watch). Match existing style in `src/rekey/__tests__/` — `import { describe, it, expect } from "vitest"`, pure logic only, no DOM/component rendering.
- Antelope rule (verbatim): `owner` has no parent; only `owner` (or a parent, which owner lacks) can authorize `updateauth` on `owner`. The new active key CANNOT rotate owner. Owner completion must be signed by the OLD owner key.
- Public keys compared as canonical `PUB_K1_...` strings via existing `getAccountKeys` (which already calls `canonicalPubKey`). Never compare raw `EOS...`/`PUB_K1` forms directly.
- Do not add React Testing Library / jsdom. Keep component logic thin; put testable logic in pure modules.
- `executeRekeyOwner(session, account, newPubKey)` already exists in `src/rekey/executor.js` and submits an owner-only `updateauth` (parent `""`). Reuse it; for the resume flow `newPubKey` = the account's current active key.

---

## Task 0: Manual mechanism gate (Bitcoin Libre Wallet) — NO CODE

**Purpose:** Decide whether Bitcoin Libre Wallet strips the `owner` `updateauth` action. This determines the Candidate-2 copy in Tasks 4 and 5. Blocks only those two sub-parts, not the whole plan.

- [ ] **Step 1: Rotate a throwaway testnet account via the live tool**

Open the rekey wizard against testnet (`?network=testnet`), Generate/Path-A flow, sign with **Bitcoin Libre Wallet**, using a disposable testnet account.

- [ ] **Step 2: Inspect the landed transaction's action count**

Run (substitute the txid the success screen shows):

```bash
curl -s "https://testnet.libre.org/v2/history/get_transaction?id=<TXID>" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('actions:',len(d['actions']));[print(' -',a['act']['name'],a['act']['data'].get('permission']) for a in d['actions']]"
```

- [ ] **Step 3: Record the outcome in the plan**

- Two actions (owner+active) → **Candidate 1**: wallet honors owner updateauth. Tasks 4/5 use the neutral copy (option A).
- One action (active only) → **Candidate 2**: wallet strips owner updateauth. Tasks 4/5 use the Anchor-routing copy (option B) and the wallet warning.

Write the result inline in this file under Task 0 before starting Task 4. (No commit needed; it is a note-to-self, but committing the annotated plan is fine.)

---

## Task 1: Pure rotation-state helper

**Files:**
- Create: `src/rekey/rotationState.js`
- Test: `src/rekey/__tests__/rotationState.test.js`

**Interfaces:**
- Produces: `rotationStatus(keys, expectedKey) -> "confirmed" | "owner-missing" | "incomplete"` where `keys = { owner, active }` (canonical strings). `confirmed`: both equal `expectedKey`. `owner-missing`: `active === expectedKey && owner !== expectedKey`. `incomplete`: anything else (active not yet the new key — genuine read lag or nothing applied).

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect } from "vitest";
import { rotationStatus } from "../rotationState";

const NEW = "PUB_K1_5nsU1i4M9wQTs8oDEEnZJRkpR3LBrQSUK5cxnwzAExaLSqSU5c";
const OLD = "PUB_K1_7E8CwRtzRKtDd1aCQuiu4WBsPFC6QxZp4peV4ULmNN6mV8RTrW";

describe("rotationStatus", () => {
  it("confirmed when both perms are the new key", () => {
    expect(rotationStatus({ owner: NEW, active: NEW }, NEW)).toBe("confirmed");
  });
  it("owner-missing when active rotated but owner is still old", () => {
    expect(rotationStatus({ owner: OLD, active: NEW }, NEW)).toBe("owner-missing");
  });
  it("incomplete when active is not yet the new key", () => {
    expect(rotationStatus({ owner: OLD, active: OLD }, NEW)).toBe("incomplete");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rekey/__tests__/rotationState.test.js`
Expected: FAIL — cannot resolve `../rotationState`.

- [ ] **Step 3: Write minimal implementation**

```javascript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rekey/__tests__/rotationState.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/rekey/rotationState.js src/rekey/__tests__/rotationState.test.js
git commit -m "feat(rekey): pure rotationStatus helper (confirmed/owner-missing/incomplete)"
```

---

## Task 2: Owner-completion action builder

**Files:**
- Modify: `src/rekey/rotationState.js`
- Test: `src/rekey/__tests__/rotationState.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ownerCompletionAction(account, activeKey) -> updateauth action object` — owner-only, parent `""`, auth = `activeKey`, authorization `[{ actor: account, permission: "owner" }]`. This mirrors `updateauthAction(account, "owner", "", activeKey)` from `rekeyActions.js`; it exists here as the named, tested entry point for the resume flow so the intent ("set owner to the existing active key") is explicit.

- [ ] **Step 1: Write the failing test (append to the same file)**

```javascript
import { ownerCompletionAction } from "../rotationState";

describe("ownerCompletionAction", () => {
  it("builds an owner-only updateauth to the current active key", () => {
    const a = ownerCompletionAction("cboylibre", NEW);
    expect(a.account).toBe("eosio");
    expect(a.name).toBe("updateauth");
    expect(a.authorization).toEqual([{ actor: "cboylibre", permission: "owner" }]);
    expect(a.data).toEqual({
      account: "cboylibre",
      permission: "owner",
      parent: "",
      auth: { threshold: 1, keys: [{ key: NEW, weight: 1 }], accounts: [], waits: [] },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/rekey/__tests__/rotationState.test.js`
Expected: FAIL — `ownerCompletionAction` is not exported.

- [ ] **Step 3: Write minimal implementation (add to `rotationState.js`)**

```javascript
import { updateauthAction } from "./rekeyActions";

// Resume flow: rotate ONLY owner, pointing it at the account's current active key.
// Must be signed by the OLD owner key (owner has no parent).
export function ownerCompletionAction(account, activeKey) {
  return updateauthAction(account, "owner", "", activeKey);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/rekey/__tests__/rotationState.test.js`
Expected: PASS (4 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/rekey/rotationState.js src/rekey/__tests__/rotationState.test.js
git commit -m "feat(rekey): ownerCompletionAction builder for resume flow"
```

---

## Task 3: De-conflate `path` — explicit `txStrategy`

**Files:**
- Modify: `src/Rekey.jsx` (state + props threading), `src/components/rekey/ConnectSignStep.jsx:44` (prop signature + branch)
- Test: none (pure threading/rename; covered by the smoke test + Task 6 manual)

**Interfaces:**
- Produces: `ConnectSignStep` accepts `txStrategy: "oneTx" | "staged" | "ownerOnly"` (replacing its use of `path` to pick a flow). `Rekey.jsx` derives `txStrategy` from the key-source choice: generate → `"oneTx"`, paste → `"staged"`. `ownerOnly` is set by the resume entry (Task 5).

- [ ] **Step 1: Add `txStrategy` state and derivation in `Rekey.jsx`**

In `Rekey.jsx`, add state next to `path`:

```javascript
const [txStrategy, setTxStrategy] = useState(null); // "oneTx" | "staged" | "ownerOnly"
```

In `handleChoosePath`, set it alongside `path`:

```javascript
const handleChoosePath = (chosenPath) => {
  setPath(chosenPath);
  setTxStrategy(chosenPath === "A" ? "oneTx" : "staged");
  setStep(chosenPath === "A" ? "generate" : "paste");
};
```

Pass it to `ConnectSignStep` (replace the `path={path}` line):

```javascript
<ConnectSignStep
  apiUrl={apiUrl}
  chainId={chainId}
  account={account}
  txStrategy={txStrategy}
  network={network}
  newPubKey={newPubKey}
  onSuccess={handleRekeySuccess}
/>
```

- [ ] **Step 2: Switch `ConnectSignStep` to `txStrategy`**

In `ConnectSignStep.jsx`, change the signature `path` → `txStrategy`, and the connected-phase button branch (currently `path === "A" ? ...`):

```javascript
{txStrategy === "oneTx" ? (
  <Button variant="primary" onClick={runPathA} disabled={signBlocked}>
    Sign: rotate owner + active
  </Button>
) : txStrategy === "staged" ? (
  <Button variant="primary" onClick={runPathBStep1} disabled={signBlocked}>
    Sign: rotate active permission
  </Button>
) : (
  <Button variant="primary" onClick={runOwnerOnly} disabled={signBlocked}>
    Sign: rotate owner permission
  </Button>
)}
```

(`runOwnerOnly` is added in Task 5. If executing strictly in order, temporarily stub it as `const runOwnerOnly = async () => {};` and remove the stub in Task 5.)

- [ ] **Step 3: Run existing suite to confirm nothing broke**

Run: `npx vitest run`
Expected: PASS (all existing tests unaffected).

- [ ] **Step 4: Commit**

```bash
git add src/Rekey.jsx src/components/rekey/ConnectSignStep.jsx
git commit -m "refactor(rekey): explicit txStrategy prop, de-conflate generate/paste path"
```

---

## Task 4: SuccessStep — verify-before-success + half-rotated warning

**Files:**
- Modify: `src/components/rekey/SuccessStep.jsx`
- Test: none automated (JSX; logic already covered by Task 1). Manual render check in Task 6.

**Interfaces:**
- Consumes: `rotationStatus` (Task 1). New prop `onFinishOwner: () => void` (wired in Task 5) invoked by the "Finish owner rotation" button.

- [ ] **Step 1: Replace the boolean status with `rotationStatus`**

In `SuccessStep.jsx`: import `rotationStatus`; change `status` states to `"checking" | "confirmed" | "owner-missing" | "incomplete"`. Replace `verifyOnce` to return the classification:

```javascript
import { rotationStatus } from "../../rekey/rotationState";

const classify = async () => {
  try {
    const keys = await getAccountKeys(apiUrl, account);
    return rotationStatus(keys, newPubKey);
  } catch {
    return "incomplete";
  }
};
```

Update the auto-poll effect and `manualCheck` to set `status` from `classify()`; treat `"confirmed"` as the terminal success (stop polling), `"owner-missing"` as terminal too (stop polling — it will not self-resolve), and keep polling only while `"incomplete"`.

- [ ] **Step 2: Neutral title until confirmed**

Change `Card.Title` so it does NOT assert completion before verification. Use:

```javascript
<Card.Title>
  {status === "confirmed" ? "Your account keys have been changed" : "Finishing your key rotation"}
</Card.Title>
```

- [ ] **Step 3: Add the `owner-missing` danger branch**

Add, alongside the existing `confirmed` / `checking` / `incomplete` (formerly `pending`) alerts:

```javascript
{status === "owner-missing" && (
  <Alert variant="danger">
    <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>{" "}
    <strong>Owner NOT rotated — your account is only half-secured.</strong> Your{" "}
    <strong>active</strong> key was changed, but <strong>owner</strong> still holds the
    OLD key. Anyone who has the old owner key can reset your account. You must finish
    rotating owner.
    <div className="mt-2">
      <Button variant="danger" size="sm" onClick={onFinishOwner}>
        Finish owner rotation
      </Button>
    </div>
    {/* Task 0 = Candidate 2 ONLY — append: */}
    {/* <div className="small mt-2">Bitcoin Libre Wallet cannot sign an owner change.
        Finish this step in <strong>Anchor</strong> using your OLD private key (WIF).</div> */}
  </Alert>
)}
```

Rename the old `pending` branch to render on `status === "incomplete"` (keep its load-balancer-lag copy — that case really is read lag).

- [ ] **Step 4: Task 0 conditional copy**

If Task 0 recorded **Candidate 2**, uncomment the Bitcoin-Libre/Anchor note in the `owner-missing` alert (Step 3). If **Candidate 1**, leave it out.

- [ ] **Step 5: Build to confirm no syntax/JSX errors**

Run: `npx vitest run` (sanity) and `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/rekey/SuccessStep.jsx
git commit -m "feat(rekey): SuccessStep verifies before claiming success; explicit half-rotated warning"
```

---

## Task 5: Resume flow — detect half-rotated + owner-only signing

**Files:**
- Modify: `src/components/rekey/DetectStep.jsx` (offer Finish-owner when `owner !== active`), `src/Rekey.jsx` (resume routing + `onFinishOwner`), `src/components/rekey/ConnectSignStep.jsx` (`runOwnerOnly`)
- Test: none automated beyond Task 1/2 (signing is manual, Task 6).

**Interfaces:**
- Consumes: `ownerCompletionAction` (Task 2), `executeRekeyOwner` (existing), `rotationStatus` (Task 1).
- Produces: a resume path that lands on `ConnectSignStep` with `txStrategy="ownerOnly"` and `newPubKey` = the account's current active key.

- [ ] **Step 1: DetectStep offers Finish-owner when perms differ**

In `DetectStep.jsx`, add a new prop `onFinishOwner(account, currentKeys)`. In the `result` block, when `result.currentKeys.owner !== result.currentKeys.active`, render an offer BELOW the normal Continue button:

```javascript
{result.currentKeys.owner !== result.currentKeys.active && (
  <Alert variant="warning" className="mt-3">
    <strong>Owner and active keys differ.</strong> If you meant to rotate both and only
    active went through, finish rotating owner now. This requires signing with your{" "}
    <strong>old owner key</strong> — the new active key cannot change owner.
    <div className="mt-2">
      <Button variant="warning" size="sm"
        onClick={() => onFinishOwner(account, result.currentKeys)}>
        Finish owner rotation
      </Button>
    </div>
  </Alert>
)}
```

- [ ] **Step 2: Rekey.jsx resume routing**

Add a handler that jumps straight to `connectSign` in `ownerOnly` mode, targeting owner → current active key:

```javascript
const handleFinishOwner = (acct, keys) => {
  setAccount(acct);
  setCurrentKeys(keys);
  setNewPubKey(keys.active);   // owner will be set to the existing active key
  setTxStrategy("ownerOnly");
  setStep("connectSign");
};
```

Wire `onFinishOwner={handleFinishOwner}` into `DetectStep`. Also pass `onFinishOwner` into `SuccessStep` so its Task 4 button works:

```javascript
onFinishOwner={() => handleFinishOwner(account, currentKeys)}
```

Note: when reaching `connectSign` via resume, `currentKeys` must be set. `handleFinishOwner` sets it; the SuccessStep→finish path reuses the `currentKeys` already in state from detection.

- [ ] **Step 3: ConnectSignStep `runOwnerOnly`**

Replace the Task 3 stub with the real implementation. It signs a single owner `updateauth` with the connected (old-owner-key) session, then verifies `owner === newPubKey`:

```javascript
import { executeRekeyOwner } from "../../rekey/executor";
// (executeRekeyOwner already imported in this file)

const runOwnerOnly = async () => {
  setPhase("signing");
  setError(null);
  try {
    const { txid } = await executeRekeyOwner(session, account, newPubKey);
    addTxid(txid);
    onSuccess({ session, txids: txidsRef.current });
  } catch (err) {
    setError(err.message);
    setPhase("connected");
  }
};
```

- [ ] **Step 4: Owner-key requirement banner in `ownerOnly` mode**

In `ConnectSignStep.jsx`, in the `phase === "idle"` block, when `txStrategy === "ownerOnly"` show a warning before the Connect button:

```javascript
{txStrategy === "ownerOnly" && (
  <Alert variant="warning">
    Connect the wallet holding the <strong>OLD owner key</strong> for {account}. Owner
    can only be changed by owner itself — your new active key will be rejected. If you no
    longer have the old key, owner cannot be changed.
    {/* Task 0 = Candidate 2 ONLY: add "Bitcoin Libre Wallet cannot sign this; use Anchor + old WIF." */}
  </Alert>
)}
```

- [ ] **Step 5: Build + full suite**

Run: `npx vitest run && npm run build`
Expected: tests PASS, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/rekey/DetectStep.jsx src/Rekey.jsx src/components/rekey/ConnectSignStep.jsx
git commit -m "feat(rekey): resume flow to finish owner on half-rotated accounts"
```

---

## Task 6: Manual end-to-end verification (testnet)

**Purpose:** The signing paths have no automated coverage (wallet-driven). Verify on testnet before merge.

- [ ] **Step 1: Half-rotate a fresh testnet account**

Use the staged/paste path (or Bitcoin Libre Wallet per Task 0 finding) to reach an active-new/owner-old state on a disposable testnet account. Confirm via:

```bash
curl -s https://testnet.libre.org/v1/chain/get_account -X POST -d '{"account_name":"<acct>"}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print({p['perm_name']:[k['key'] for k in p['required_auth']['keys']] for p in d['permissions']})"
```

Expect owner != active.

- [ ] **Step 2: Run DetectStep resume**

Enter the account. Confirm the "Owner and active keys differ / Finish owner rotation" offer appears. Click it.

- [ ] **Step 3: Sign owner-only with the OLD key**

Connect the wallet holding the old owner key, sign. Confirm SuccessStep resolves to `confirmed`.

- [ ] **Step 4: Verify on-chain owner == active**

Re-run the Step 1 curl. Expect owner == active == new key. Confirm Hyperion shows a new single-action owner `updateauth`:

```bash
curl -s "https://testnet.libre.org/v2/history/get_actions?account=<acct>&filter=eosio:updateauth&limit=5&sort=desc" \
  | python3 -c "import sys,json;[print(a['act']['data']['permission']) for a in json.load(sys.stdin)['actions']]"
```

- [ ] **Step 5: Verify the SuccessStep half-rotated branch**

Manually confirm: rotating active-only (staged step 1) then landing on SuccessStep shows the red "Owner NOT rotated" warning with a working "Finish owner rotation" button (not the benign lag message).

---

## Self-Review

- **Spec coverage:** Part 1 → Task 0. Part 2 (verify-before-success) → Tasks 1, 4. Part 3 (resume) → Tasks 2, 5. Part 4 (de-conflate path) → Task 3. Testing → Tasks 1, 2 (unit) + Task 6 (manual). All spec sections mapped.
- **Placeholder scan:** No TBD/TODO; conditional copy (Task 0 outcome) is explicit with both branches spelled out.
- **Type consistency:** `rotationStatus(keys, expectedKey)` and `ownerCompletionAction(account, activeKey)` used consistently across Tasks 1, 2, 4, 5. `txStrategy` values `"oneTx"|"staged"|"ownerOnly"` consistent across Tasks 3, 5. `executeRekeyOwner(session, account, newPubKey)` matches the existing export.

## Operational note (not a code task)

`cboylibre` (mainnet) can be finished immediately, independent of this work: one owner
`updateauth` setting owner → `PUB_K1_5nsU1i…LSqSU5c` (current active), signed with the
OLD owner key. If Bitcoin Libre Wallet refuses, use Anchor + old WIF (and that refusal
confirms Task 0 = Candidate 2).
