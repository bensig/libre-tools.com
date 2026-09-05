# Permission Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an account owner create, inspect, edit and revoke named child permissions of `active`, linked to actions on any Libre contract, with templates for the common cases.

**Architecture:** All transaction-building lives in one pure, unit-tested module (`src/utils/permissions.js`); the React page is a thin shell over it. Writes are confined to child permissions of `active` — `owner` and `active` are read-only, which is what makes the tool incapable of locking anyone out. Editing is computed as a diff against the permission's current `linked_actions` read from chain, because `updateauth` does not change links.

**Tech Stack:** React 18 + react-router-dom, react-bootstrap, `@wharfkit/session` (via `src/utils/session.js`), vitest (node environment), vite.

**Spec:** `docs/superpowers/specs/2026-09-05-permission-manager-design.md`

## Global Constraints

- **Never emit an action targeting `owner` or `active`.** No builder may produce `updateauth`/`deleteauth` for those permissions. Asserted by test in Task 2.
- **Parent is always `active`.** Every created permission is a child of `active`, threshold 1, exactly one key.
- **Revoke unlinks first.** `deleteauth` fails on a linked authority (Leap `eosio_contract.cpp:346`). Every revoke emits `unlinkauth` × N then `deleteauth`, in that order, in one transaction.
- **Edit is a diff.** `updateauth` only when the key changed; `linkauth` only for added actions; `unlinkauth` only for removed ones. Never re-link the whole desired set.
- **`linked_action.action` is optional** (`chain_plugin.hpp:80`). A contract-wide link has no action; `unlinkauth` takes `type: ""` for it.
- **Public keys only.** Reject any key not starting with `PUB_` or `EOS`.
- **URL prefill accepts named templates only** — `?template=`, `?account=`, `?network=`. Never a raw action list.
- **Test command:** `npx vitest run`. Tests live in `src/utils/__tests__/*.test.js`, node environment, no DOM.
- **Existing endpoints:** mainnet `https://api.libre.org`, testnet `https://testnet-api.libre.org`.

## File Structure

| File | Responsibility |
|---|---|
| `src/utils/permissions.js` (new) | All transaction building + validation. Pure, no React. Absorbs `botAccount.js`. |
| `src/utils/__tests__/permissions.test.js` (new) | Unit tests for the above. Absorbs `botAccount.test.js`. |
| `src/utils/abi.js` (new) | Fetch + cache a contract's action list from `get_abi`. |
| `src/utils/__tests__/abi.test.js` (new) | Unit tests for the fetch/cache/error paths. |
| `src/components/permissions/ActionPicker.jsx` (new) | Contract input → action checkboxes; manual-entry escape hatch. |
| `src/components/permissions/PermissionList.jsx` (new) | Read-only tree of existing permissions. |
| `src/Permissions.jsx` (new) | The page: inspect / create / edit / revoke states. |
| `src/BotAccount.jsx` (modify) | Becomes a thin wrapper rendering `Permissions` with the `bot` template. |
| `src/App.jsx` (modify) | Add `/permissions` route. |
| `src/utils/botAccount.js` (delete, Task 3) | Contents moved to `permissions.js`. |
| `src/utils/__tests__/botAccount.test.js` (delete, Task 3) | Contents moved to `permissions.test.js`. |

---

### Task 1: `diffLinks` — the core of safe editing

**Files:**
- Create: `src/utils/permissions.js`
- Test: `src/utils/__tests__/permissions.test.js`

**Interfaces:**
- Produces: `normalizeLink({account, action})` → `{account, action}` with `action` defaulting to `""`; `linkId(link)` → `"account::action"`; `diffLinks(current, desired)` → `{add: Link[], remove: Link[]}` where `Link = {account: string, action: string}`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { diffLinks, linkId, normalizeLink } from "../permissions";

const L = (account, action) => ({ account, action });

describe("diffLinks", () => {
  it("adds what is desired and missing, removes what is current and unwanted", () => {
    const current = [L("usdt.libre", "transfer"), L("dex.libre", "cancelorder")];
    const desired = [L("usdt.libre", "transfer"), L("loan", "borrowvar")];
    const { add, remove } = diffLinks(current, desired);
    expect(add.map(linkId)).toEqual(["loan::borrowvar"]);
    expect(remove.map(linkId)).toEqual(["dex.libre::cancelorder"]);
  });

  it("returns empty sets when nothing changed", () => {
    const same = [L("usdt.libre", "transfer")];
    expect(diffLinks(same, [...same])).toEqual({ add: [], remove: [] });
  });

  it("treats a contract-wide link (no action) as its own distinct link", () => {
    // chain_plugin.hpp: linked_action.action is optional
    const current = [{ account: "somecontract" }];
    const desired = [L("somecontract", "doit")];
    const { add, remove } = diffLinks(current, desired);
    expect(add.map(linkId)).toEqual(["somecontract::doit"]);
    expect(remove.map(linkId)).toEqual(["somecontract::"]);
  });

  it("normalizes a missing action to an empty string", () => {
    expect(normalizeLink({ account: "c" })).toEqual({ account: "c", action: "" });
  });

  it("ignores duplicates on either side", () => {
    const current = [L("a", "x"), L("a", "x")];
    const desired = [L("a", "x"), L("b", "y"), L("b", "y")];
    const { add, remove } = diffLinks(current, desired);
    expect(add.map(linkId)).toEqual(["b::y"]);
    expect(remove).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/permissions.test.js`
Expected: FAIL — cannot resolve `../permissions`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/permissions.js

/** A link is {account, action}; `action` is optional on chain for a contract-wide link. */
export function normalizeLink(link) {
  return { account: link.account, action: link.action ?? "" };
}

export function linkId(link) {
  const n = normalizeLink(link);
  return `${n.account}::${n.action}`;
}

/** What must be linked and unlinked to move from `current` to `desired`. */
export function diffLinks(current = [], desired = []) {
  const cur = new Map(current.map((l) => [linkId(l), normalizeLink(l)]));
  const des = new Map(desired.map((l) => [linkId(l), normalizeLink(l)]));
  const add = [...des.entries()].filter(([id]) => !cur.has(id)).map(([, l]) => l);
  const remove = [...cur.entries()].filter(([id]) => !des.has(id)).map(([, l]) => l);
  return { add, remove };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/permissions.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/permissions.js src/utils/__tests__/permissions.test.js
git commit -m "feat(permissions): diffLinks, the basis of non-destructive editing"
```

---

### Task 2: Name validation and the owner/active boundary

**Files:**
- Modify: `src/utils/permissions.js`
- Test: `src/utils/__tests__/permissions.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `RESERVED_PERMISSIONS` (a `Set` containing `"owner"` and `"active"`); `validatePermissionName(name)` → throws `Error` or returns the name.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/permissions.test.js`:

```js
import { validatePermissionName, RESERVED_PERMISSIONS } from "../permissions";

describe("validatePermissionName", () => {
  it("accepts a normal Antelope name", () => {
    expect(validatePermissionName("trading")).toBe("trading");
    expect(validatePermissionName("bot.one")).toBe("bot.one");
  });

  it("refuses owner and active — this tool must never write them", () => {
    expect(() => validatePermissionName("owner")).toThrow(/owner.*active|reserved/i);
    expect(() => validatePermissionName("active")).toThrow(/owner.*active|reserved/i);
    expect(RESERVED_PERMISSIONS.has("owner")).toBe(true);
    expect(RESERVED_PERMISSIONS.has("active")).toBe(true);
  });

  it("refuses names that are not valid Antelope names", () => {
    expect(() => validatePermissionName("")).toThrow(/required/i);
    expect(() => validatePermissionName("TooLong")).toThrow(/a-z/);
    expect(() => validatePermissionName("waytoolongname")).toThrow(/12/);
    expect(() => validatePermissionName("has space")).toThrow(/a-z/);
    expect(() => validatePermissionName("digit9")).toThrow(/a-z/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/permissions.test.js`
Expected: FAIL — `validatePermissionName is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/permissions.js`:

```js
/** Writing these is permanently out of scope: a bad updateauth on them is unrecoverable. */
export const RESERVED_PERMISSIONS = new Set(["owner", "active"]);

const NAME_RE = /^[a-z1-5.]+$/;

export function validatePermissionName(name) {
  if (!name) throw new Error("A permission name is required");
  if (RESERVED_PERMISSIONS.has(name))
    throw new Error(
      `"${name}" is reserved — this tool only creates child permissions. Use /rekey to change owner or active keys.`
    );
  if (name.length > 12) throw new Error("A permission name is at most 12 characters");
  if (!NAME_RE.test(name))
    throw new Error("A permission name may contain only a-z, 1-5 and . characters");
  return name;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/permissions.test.js`
Expected: PASS, 8 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/utils/permissions.js src/utils/__tests__/permissions.test.js
git commit -m "feat(permissions): validate names and reserve owner/active"
```

---

### Task 3: Move the bot bundles in as templates

**Files:**
- Modify: `src/utils/permissions.js`
- Modify: `src/utils/__tests__/permissions.test.js`
- Delete: `src/utils/botAccount.js`
- Delete: `src/utils/__tests__/botAccount.test.js`
- Modify: `src/BotAccount.jsx` (imports only, in this task)

**Interfaces:**
- Consumes: nothing.
- Produces: `TEMPLATES` — an object keyed by template id (`bot`, `trade`, `borrow`, `lend`), each `{label, description, permission, links: Link[]}`; `templateLinks(ids)` → deduplicated `Link[]`.

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/permissions.test.js`:

```js
import { TEMPLATES, templateLinks } from "../permissions";

describe("templates", () => {
  // Mirrors WHITELIST in libre-mcp src/compose/validate.ts. If that changes, this fails
  // and the templates need updating.
  const MCP_WHITELIST = [
    "btc.libre::transfer", "usdt.libre::transfer", "tp.libre::transfer",
    "eosio.token::transfer", "dex.libre::cancelorder",
    "loan::createvault", "loan::genaddr", "loan::borrowvar",
    "loan::processqueue", "loan::cancelloan", "loan::withdraw", "loan::cancelredeem",
  ];

  it("the bot template covers the mcp.libre.org whitelist exactly", () => {
    expect(templateLinks(["bot"]).map(linkId).sort()).toEqual([...MCP_WHITELIST].sort());
  });

  it("names a default permission for each template", () => {
    for (const [id, t] of Object.entries(TEMPLATES)) {
      expect(t.permission, `${id} needs a default permission name`).toBeTruthy();
      expect(() => validatePermissionName(t.permission)).not.toThrow();
    }
  });

  it("trade grants no loan power", () => {
    const ids = templateLinks(["trade"]).map(linkId);
    expect(ids.some((i) => i.startsWith("loan::"))).toBe(false);
  });

  it("deduplicates actions shared between templates", () => {
    const ids = templateLinks(["borrow", "lend"]).map(linkId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects an unknown template rather than granting nothing", () => {
    expect(() => templateLinks(["nonsense"])).toThrow(/Unknown template/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/permissions.test.js`
Expected: FAIL — `TEMPLATES is not defined`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/permissions.js`:

```js
const LOAN_CORE = [
  { account: "loan", action: "createvault" },
  { account: "loan", action: "genaddr" },
  { account: "loan", action: "borrowvar" },
  { account: "loan", action: "processqueue" },
  { account: "loan", action: "cancelloan" },
  { account: "loan", action: "withdraw" },
];

const TRADE_LINKS = [
  { account: "usdt.libre", action: "transfer" },
  { account: "btc.libre", action: "transfer" },
  { account: "dex.libre", action: "cancelorder" },
];

/**
 * Presets. `bot` deliberately covers the whole mcp.libre.org whitelist; the narrower
 * templates exist so an account can grant one capability without the others.
 */
export const TEMPLATES = {
  bot: {
    label: "Full agent (mcp.libre.org)",
    description: "Everything an agent using mcp.libre.org can do: trade, borrow, lend, transfer.",
    permission: "agent",
    links: [
      ...TRADE_LINKS,
      ...LOAN_CORE,
      { account: "loan", action: "cancelredeem" },
      { account: "tp.libre", action: "transfer" },
      { account: "eosio.token", action: "transfer" },
    ],
  },
  trade: {
    label: "Trade on the DEX only",
    description:
      "Place and cancel orders on dex.libre. Orders are token transfers with a memo, so this lets the bot send BTC and USDT to dex.libre.",
    permission: "trading",
    links: TRADE_LINKS,
  },
  borrow: {
    label: "Borrow against BTC only",
    description: "Create and fund a vault, borrow USDT, repay, withdraw collateral.",
    permission: "borrowing",
    links: [...LOAN_CORE, { account: "usdt.libre", action: "transfer" }],
  },
  lend: {
    label: "Lend USDT only",
    description: "Deposit USDT, redeem TPF shares, manage the redemption queue.",
    permission: "lending",
    links: [
      { account: "usdt.libre", action: "transfer" },
      { account: "tp.libre", action: "transfer" },
      { account: "loan", action: "cancelredeem" },
      { account: "loan", action: "processqueue" },
    ],
  },
};

/** Deduplicated links for the given template ids, in a stable order. */
export function templateLinks(ids = []) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const t = TEMPLATES[id];
    if (!t) throw new Error(`Unknown template: ${id}`);
    for (const link of t.links) {
      const key = linkId(link);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(normalizeLink(link));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/permissions.test.js`
Expected: PASS, 13 tests total.

- [ ] **Step 5: Delete the superseded module and repoint its consumer**

```bash
git rm src/utils/botAccount.js src/utils/__tests__/botAccount.test.js
```

In `src/BotAccount.jsx`, change the import block from `./utils/botAccount` to `./utils/permissions`. Task 7 replaces this file wholesale; this step only keeps the build green in between. Replace the import with:

```js
import { TEMPLATES, templateLinks, buildCreateActions, buildRevokeActions } from "./utils/permissions";
```

and replace uses of `BUNDLES` with `TEMPLATES`, `linkedActions(selected)` with `templateLinks(selected)`, `AGENT_PERMISSION` with the literal `"agent"`, and `buildAgentPermissionActions({account, agentKey, bundles})` with
`buildCreateActions({ account, permission: "agent", key: agentKey, links: templateLinks(selected) })`.

> `buildCreateActions` lands in Task 4. If executing tasks strictly in order, run
> `npx vitest run` after Task 4 rather than here; the build is green again at the end of Task 4.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(permissions): fold bot bundles into templates"
```

---

### Task 4: Create, edit and revoke builders

**Files:**
- Modify: `src/utils/permissions.js`
- Test: `src/utils/__tests__/permissions.test.js`

**Interfaces:**
- Consumes: `diffLinks`, `linkId`, `normalizeLink`, `validatePermissionName`, `RESERVED_PERMISSIONS`.
- Produces:
  - `buildCreateActions({account, permission, key, links})` → action array
  - `buildEditActions({account, permission, key, currentKey, current, desired})` → action array
  - `buildRevokeActions({account, permission, linkedActions})` → action array

- [ ] **Step 1: Write the failing test**

Append to `src/utils/__tests__/permissions.test.js`:

```js
import { buildCreateActions, buildEditActions, buildRevokeActions } from "../permissions";

const KEY = "PUB_K1_57cc8Hs2ScTLjFNJQ2Zh8wTHmkkwKwvtMUfJdfNhjH5tLgg2gT";
const KEY2 = "PUB_K1_6RWZ1CmDL4B6LdixuertnzxcRuUDac3NQspJEvMpBMv1hFAJUu";

describe("buildCreateActions", () => {
  const links = [{ account: "usdt.libre", action: "transfer" }];

  it("creates the permission as a child of active, threshold 1, one key", () => {
    const [updateauth] = buildCreateActions({ account: "me", permission: "trading", key: KEY, links });
    expect(updateauth).toEqual({
      account: "eosio",
      name: "updateauth",
      authorization: [{ actor: "me", permission: "active" }],
      data: {
        account: "me",
        permission: "trading",
        parent: "active",
        auth: { threshold: 1, keys: [{ key: KEY, weight: 1 }], accounts: [], waits: [] },
      },
    });
  });

  it("emits one linkauth per link and nothing else", () => {
    const actions = buildCreateActions({
      account: "me", permission: "trading", key: KEY,
      links: [{ account: "usdt.libre", action: "transfer" }, { account: "dex.libre", action: "cancelorder" }],
    });
    expect(actions.map((a) => a.name)).toEqual(["updateauth", "linkauth", "linkauth"]);
    expect(actions[1].data).toEqual({
      account: "me", code: "usdt.libre", type: "transfer", requirement: "trading",
    });
  });

  it("refuses a private key", () => {
    expect(() =>
      buildCreateActions({ account: "me", permission: "trading", key: "PVT_K1_abc", links })
    ).toThrow(/public key/i);
  });

  it("refuses to write owner or active", () => {
    for (const permission of ["owner", "active"]) {
      expect(() => buildCreateActions({ account: "me", permission, key: KEY, links })).toThrow(/reserved/i);
    }
  });

  it("requires at least one link", () => {
    expect(() => buildCreateActions({ account: "me", permission: "trading", key: KEY, links: [] }))
      .toThrow(/at least one action/i);
  });
});

describe("buildEditActions", () => {
  const base = {
    account: "me", permission: "trading", key: KEY, currentKey: KEY,
    current: [{ account: "usdt.libre", action: "transfer" }],
  };

  it("emits nothing when nothing changed", () => {
    expect(buildEditActions({ ...base, desired: [...base.current] })).toEqual([]);
  });

  it("does not touch updateauth when only links changed", () => {
    const actions = buildEditActions({
      ...base,
      desired: [{ account: "usdt.libre", action: "transfer" }, { account: "loan", action: "borrowvar" }],
    });
    expect(actions.map((a) => a.name)).toEqual(["linkauth"]);
    expect(actions[0].data.code).toBe("loan");
  });

  it("unlinks removed actions rather than leaving them linked", () => {
    const actions = buildEditActions({ ...base, desired: [{ account: "loan", action: "borrowvar" }] });
    expect(actions.map((a) => a.name).sort()).toEqual(["linkauth", "unlinkauth"]);
    const unlink = actions.find((a) => a.name === "unlinkauth");
    expect(unlink.data).toEqual({ account: "me", code: "usdt.libre", type: "transfer" });
  });

  it("emits updateauth only when the key changed", () => {
    const actions = buildEditActions({ ...base, key: KEY2, desired: [...base.current] });
    expect(actions.map((a) => a.name)).toEqual(["updateauth"]);
    expect(actions[0].data.auth.keys).toEqual([{ key: KEY2, weight: 1 }]);
  });

  it("refuses to edit owner or active", () => {
    expect(() => buildEditActions({ ...base, permission: "owner", desired: [] })).toThrow(/reserved/i);
  });
});

describe("buildRevokeActions", () => {
  it("unlinks every action before deleting — deleteauth refuses a linked authority", () => {
    const actions = buildRevokeActions({
      account: "me", permission: "trading",
      linkedActions: [{ account: "usdt.libre", action: "transfer" }, { account: "dex.libre", action: "cancelorder" }],
    });
    expect(actions.map((a) => a.name)).toEqual(["unlinkauth", "unlinkauth", "deleteauth"]);
    expect(actions.at(-1).data).toEqual({ account: "me", permission: "trading" });
  });

  it("unlinks a contract-wide link with an empty type", () => {
    const [unlink] = buildRevokeActions({
      account: "me", permission: "trading", linkedActions: [{ account: "somecontract" }],
    });
    expect(unlink.data).toEqual({ account: "me", code: "somecontract", type: "" });
  });

  it("refuses to delete owner or active", () => {
    expect(() => buildRevokeActions({ account: "me", permission: "active", linkedActions: [] }))
      .toThrow(/reserved/i);
  });
});

describe("safety boundary", () => {
  it("no builder ever emits an action targeting owner or active", () => {
    const links = [{ account: "usdt.libre", action: "transfer" }];
    const all = [
      ...buildCreateActions({ account: "me", permission: "trading", key: KEY, links }),
      ...buildEditActions({
        account: "me", permission: "trading", key: KEY2, currentKey: KEY, current: links, desired: [],
      }),
      ...buildRevokeActions({ account: "me", permission: "trading", linkedActions: links }),
    ];
    for (const a of all) {
      if (["updateauth", "deleteauth"].includes(a.name)) {
        expect(RESERVED_PERMISSIONS.has(a.data.permission)).toBe(false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/permissions.test.js`
Expected: FAIL — `buildCreateActions is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/utils/permissions.js`:

```js
const ACTIVE = "active";
const auth = (account) => [{ actor: account, permission: ACTIVE }];

function assertPublicKey(key) {
  if (!key) throw new Error("A public key is required");
  if (!key.startsWith("PUB_") && !key.startsWith("EOS"))
    throw new Error("That must be a public key (PUB_K1_… or EOS…), never a private key");
  return key;
}

function updateauthAction({ account, permission, key }) {
  return {
    account: "eosio",
    name: "updateauth",
    authorization: auth(account),
    data: {
      account,
      permission,
      parent: ACTIVE,
      auth: { threshold: 1, keys: [{ key, weight: 1 }], accounts: [], waits: [] },
    },
  };
}

function linkauthAction({ account, permission, link }) {
  const l = normalizeLink(link);
  return {
    account: "eosio",
    name: "linkauth",
    authorization: auth(account),
    data: { account, code: l.account, type: l.action, requirement: permission },
  };
}

function unlinkauthAction({ account, link }) {
  const l = normalizeLink(link);
  return {
    account: "eosio",
    name: "unlinkauth",
    authorization: auth(account),
    data: { account, code: l.account, type: l.action },
  };
}

export function buildCreateActions({ account, permission, key, links = [] }) {
  if (!account) throw new Error("An account is required");
  validatePermissionName(permission);
  assertPublicKey(key);
  if (!links.length) throw new Error("Select at least one action to link");
  return [
    updateauthAction({ account, permission, key }),
    ...links.map((link) => linkauthAction({ account, permission, link })),
  ];
}

/** Only what changed: updateauth if the key moved, plus the link diff. */
export function buildEditActions({ account, permission, key, currentKey, current = [], desired = [] }) {
  if (!account) throw new Error("An account is required");
  validatePermissionName(permission);
  assertPublicKey(key);
  const { add, remove } = diffLinks(current, desired);
  const actions = [];
  if (key !== currentKey) actions.push(updateauthAction({ account, permission, key }));
  for (const link of add) actions.push(linkauthAction({ account, permission, link }));
  for (const link of remove) actions.push(unlinkauthAction({ account, link }));
  return actions;
}

export function buildRevokeActions({ account, permission, linkedActions = [] }) {
  if (!account) throw new Error("An account is required");
  validatePermissionName(permission);
  return [
    ...linkedActions.map((link) => unlinkauthAction({ account, link })),
    {
      account: "eosio",
      name: "deleteauth",
      authorization: auth(account),
      data: { account, permission },
    },
  ];
}
```

- [ ] **Step 4: Run the whole suite**

Run: `npx vitest run`
Expected: PASS. `BotAccount.jsx` now resolves its imports again.

- [ ] **Step 5: Verify the app still builds**

Run: `npx vite build`
Expected: `✓ built in …`, no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(permissions): create, edit and revoke builders"
```

---

### Task 5: ABI action fetching

**Files:**
- Create: `src/utils/abi.js`
- Test: `src/utils/__tests__/abi.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `fetchContractActions(apiUrl, contract, {fetchImpl})` → `Promise<string[]>` of action names, sorted; throws `Error` with a readable message when the contract has no ABI or the request fails. `__clearAbiCache()` for tests.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchContractActions, __clearAbiCache } from "../abi";

const API = "https://api.example";
const okResponse = (abi) => ({ ok: true, json: async () => ({ abi }) });

beforeEach(() => __clearAbiCache());

describe("fetchContractActions", () => {
  it("returns the contract's action names, sorted", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({ actions: [{ name: "transfer" }, { name: "create" }] })
    );
    await expect(fetchContractActions(API, "usdt.libre", { fetchImpl })).resolves.toEqual([
      "create",
      "transfer",
    ]);
  });

  it("caches per contract so retyping does not refetch", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ actions: [{ name: "transfer" }] }));
    await fetchContractActions(API, "usdt.libre", { fetchImpl });
    await fetchContractActions(API, "usdt.libre", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explains when an account has no ABI rather than returning nothing", async () => {
    const fetchImpl = vi.fn(async () => okResponse(null));
    await expect(fetchContractActions(API, "notacontract", { fetchImpl })).rejects.toThrow(
      /no ABI/i
    );
  });

  it("does not cache a failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(okResponse({ actions: [{ name: "transfer" }] }));
    await expect(fetchContractActions(API, "flaky", { fetchImpl })).rejects.toThrow(/500/);
    await expect(fetchContractActions(API, "flaky", { fetchImpl })).resolves.toEqual(["transfer"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/abi.test.js`
Expected: FAIL — cannot resolve `../abi`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/utils/abi.js

// Cache SUCCESSES only: caching a failure would leave a contract permanently
// un-pickable for the session after one network blip.
const cache = new Map();

export function __clearAbiCache() {
  cache.clear();
}

/**
 * Action names declared by a contract's ABI.
 * @param {string} apiUrl chain API base, e.g. https://api.libre.org
 * @param {string} contract account name
 */
export async function fetchContractActions(apiUrl, contract, { fetchImpl = fetch } = {}) {
  const key = `${apiUrl}|${contract}`;
  if (cache.has(key)) return cache.get(key);

  const res = await fetchImpl(`${apiUrl}/v1/chain/get_abi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_name: contract }),
  });
  if (!res.ok) throw new Error(`Could not read ${contract}: HTTP ${res.status}`);

  const body = await res.json();
  const actions = body?.abi?.actions;
  if (!actions || !actions.length)
    throw new Error(
      `${contract} has no ABI — it may not be a contract, or may not be deployed yet.`
    );

  const names = actions.map((a) => a.name).sort();
  cache.set(key, names);
  return names;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/abi.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/abi.js src/utils/__tests__/abi.test.js
git commit -m "feat(permissions): fetch contract actions from ABI"
```

---

### Task 6: ActionPicker and PermissionList components

**Files:**
- Create: `src/components/permissions/ActionPicker.jsx`
- Create: `src/components/permissions/PermissionList.jsx`

**Interfaces:**
- Consumes: `fetchContractActions` (Task 5), `linkId`/`normalizeLink` (Task 1), `RESERVED_PERMISSIONS` (Task 2).
- Produces:
  - `<ActionPicker apiUrl selected onChange />` — `selected` is `Link[]`, `onChange(nextLinks)`.
  - `<PermissionList permissions activeName onEdit onRevoke />` — `permissions` is the array from `get_account`.

There are no component tests (the repo has no DOM test setup — see spec, Testing). Verification is Task 8's manual pass.

- [ ] **Step 1: Write ActionPicker**

```jsx
import { useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { fetchContractActions } from "../../utils/abi";
import { linkId, normalizeLink } from "../../utils/permissions";

export default function ActionPicker({ apiUrl, selected = [], onChange }) {
  const [contract, setContract] = useState("");
  const [actions, setActions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualAction, setManualAction] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    setActions(null);
    setManual(false);
    try {
      setActions(await fetchContractActions(apiUrl, contract.trim()));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const has = (link) => selected.some((s) => linkId(s) === linkId(link));
  const toggle = (link) => {
    const l = normalizeLink(link);
    onChange(has(l) ? selected.filter((s) => linkId(s) !== linkId(l)) : [...selected, l]);
  };

  return (
    <div>
      <Form.Label>Add actions from a contract</Form.Label>
      <div className="d-flex gap-2 mb-2">
        <Form.Control
          value={contract}
          onChange={(e) => setContract(e.target.value.trim().toLowerCase())}
          placeholder="dex.libre, loan, or your own contract"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), load())}
        />
        <Button variant="outline-primary" onClick={load} disabled={!contract || loading}>
          {loading ? <Spinner size="sm" animation="border" /> : "Load"}
        </Button>
      </div>

      {error && (
        <Alert variant="warning" className="py-2">
          <div className="small">{error}</div>
          {!manual && (
            <Button size="sm" variant="link" className="p-0" onClick={() => setManual(true)}>
              Enter an action name manually
            </Button>
          )}
        </Alert>
      )}

      {manual && (
        <div className="d-flex gap-2 mb-2">
          <Form.Control
            value={manualAction}
            onChange={(e) => setManualAction(e.target.value.trim().toLowerCase())}
            placeholder="action name"
          />
          <Button
            variant="outline-secondary"
            disabled={!manualAction}
            onClick={() => {
              toggle({ account: contract, action: manualAction });
              setManualAction("");
            }}
          >
            Add unverified
          </Button>
        </div>
      )}

      {actions && (
        <div className="border rounded p-2" style={{ maxHeight: "14rem", overflowY: "auto" }}>
          {actions.map((action) => {
            const link = { account: contract, action };
            return (
              <Form.Check
                key={action}
                type="checkbox"
                id={`act-${contract}-${action}`}
                label={<code>{`${contract}::${action}`}</code>}
                checked={has(link)}
                onChange={() => toggle(link)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write PermissionList**

```jsx
import { Badge, Button, Card, Table } from "react-bootstrap";
import { RESERVED_PERMISSIONS } from "../../utils/permissions";

export default function PermissionList({ permissions = [], onEdit, onRevoke, canSign }) {
  const children = permissions.filter((p) => p.parent === "active");
  const reserved = permissions.filter((p) => RESERVED_PERMISSIONS.has(p.perm_name));

  return (
    <Card className="mb-3">
      <Card.Body>
        <Card.Title className="h6">Permissions on this account</Card.Title>

        {reserved.map((p) => (
          <div key={p.perm_name} className="border rounded p-2 mb-2 bg-light">
            <Badge bg="secondary" className="me-2">{p.perm_name}</Badge>
            <span className="text-muted small">
              Read-only here — use <a href="/rekey">/rekey</a> to change these keys.
            </span>
          </div>
        ))}

        {children.length === 0 && (
          <p className="text-muted small mb-0">No child permissions yet.</p>
        )}

        {children.map((p) => (
          <div key={p.perm_name} className="border rounded p-3 mb-2">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div>
                <Badge bg="primary" className="me-2">{p.perm_name}</Badge>
                <span className="text-muted small">
                  threshold {p.required_auth?.threshold} ·{" "}
                  {p.required_auth?.keys?.length ?? 0} key(s)
                </span>
              </div>
              {canSign && (
                <div className="d-flex gap-2">
                  <Button size="sm" variant="outline-primary" onClick={() => onEdit(p)}>Edit</Button>
                  <Button size="sm" variant="outline-danger" onClick={() => onRevoke(p)}>Revoke</Button>
                </div>
              )}
            </div>
            {p.linked_actions?.length ? (
              <Table size="sm" className="mb-0">
                <tbody>
                  {p.linked_actions.map((l) => (
                    <tr key={`${l.account}::${l.action ?? ""}`}>
                      <td><code>{l.account}</code></td>
                      <td><code>{l.action ?? "(whole contract)"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <span className="text-muted small">No linked actions — this key can do nothing.</span>
            )}
          </div>
        ))}
      </Card.Body>
    </Card>
  );
}
```

- [ ] **Step 3: Verify the build compiles**

Run: `npx vite build`
Expected: `✓ built in …`, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/permissions
git commit -m "feat(permissions): action picker and permission list components"
```

---

### Task 7: The `/permissions` page, and `/bot-account` as a template of it

**Files:**
- Create: `src/Permissions.jsx`
- Modify: `src/BotAccount.jsx` (replace wholesale)
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: everything from Tasks 1–6, plus `createSessionKit` from `src/utils/session.js`.
- Produces: the `/permissions` route; `/bot-account` continues to resolve.

- [ ] **Step 1: Write the page**

```jsx
import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Form, Spinner } from "react-bootstrap";
import { createSessionKit } from "./utils/session";
import ActionPicker from "./components/permissions/ActionPicker";
import PermissionList from "./components/permissions/PermissionList";
import {
  TEMPLATES,
  templateLinks,
  linkId,
  normalizeLink,
  validatePermissionName,
  buildCreateActions,
  buildEditActions,
  buildRevokeActions,
} from "./utils/permissions";

const NETWORK_ENDPOINTS = {
  mainnet: "https://api.libre.org",
  testnet: "https://testnet-api.libre.org",
};
const EXPLORER = {
  mainnet: "https://www.libreblocks.io/tx/",
  testnet: "https://testnet.libreblocks.io/tx/",
};

export default function Permissions({ lockedTemplate = null, title, intro }) {
  const [searchParams] = useSearchParams();
  const network = (searchParams.get("network") || "mainnet").trim().toLowerCase();
  const apiUrl = NETWORK_ENDPOINTS[network] || NETWORK_ENDPOINTS.mainnet;
  const templateId = lockedTemplate ?? searchParams.get("template");

  const [account, setAccount] = useState((searchParams.get("account") || "").trim().toLowerCase());
  const [permissions, setPermissions] = useState(null);
  const [editing, setEditing] = useState(null); // the perm_name being edited, or null for create
  const [name, setName] = useState(TEMPLATES[templateId]?.permission ?? "");
  const [key, setKey] = useState("");
  const [currentKey, setCurrentKey] = useState(null);
  const [links, setLinks] = useState(templateId ? templateLinks([templateId]) : []);
  const [chainId, setChainId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [txid, setTxid] = useState(null);
  const [signedAs, setSignedAs] = useState(null);

  useEffect(() => {
    fetch(`${apiUrl}/v1/chain/get_info`)
      .then((r) => r.json())
      .then((d) => setChainId(d.chain_id))
      .catch((e) => setError(e.message));
  }, [apiUrl]);

  const loadAccount = useCallback(async () => {
    if (!account) return setPermissions(null);
    try {
      const res = await fetch(`${apiUrl}/v1/chain/get_account`, {
        method: "POST",
        body: JSON.stringify({ account_name: account }),
      });
      const data = await res.json();
      setPermissions(data?.permissions ?? null);
    } catch {
      setPermissions(null);
    }
  }, [account, apiUrl]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const startEdit = (perm) => {
    setEditing(perm.perm_name);
    setName(perm.perm_name);
    const k = perm.required_auth?.keys?.[0]?.key ?? "";
    setKey(k);
    setCurrentKey(k);
    setLinks((perm.linked_actions ?? []).map(normalizeLink));
    setError(null);
    setTxid(null);
  };

  const startCreate = () => {
    setEditing(null);
    setName(TEMPLATES[templateId]?.permission ?? "");
    setKey("");
    setCurrentKey(null);
    setLinks(templateId ? templateLinks([templateId]) : []);
    setError(null);
    setTxid(null);
  };

  const sign = async (build) => {
    setBusy(true);
    setError(null);
    setTxid(null);
    try {
      // Re-read immediately before building, so a stale view can't cause an unintended unlink.
      await loadAccount();
      const kit = createSessionKit({ chainId, apiUrl });
      const { session } = await kit.login();
      setSignedAs(String(session.actor));
      const actions = build();
      if (!actions.length) throw new Error("No changes to apply");
      const result = await session.transact({ actions });
      setTxid(result.resolved?.transaction?.id ?? result.response?.transaction_id ?? null);
      await loadAccount();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = (perm) =>
    sign(() =>
      buildRevokeActions({
        account,
        permission: perm.perm_name,
        linkedActions: perm.linked_actions ?? [],
      })
    );

  const submit = () =>
    sign(() =>
      editing
        ? buildEditActions({
            account,
            permission: name,
            key,
            currentKey,
            current: (permissions?.find((p) => p.perm_name === editing)?.linked_actions ?? []).map(
              normalizeLink
            ),
            desired: links,
          })
        : buildCreateActions({ account, permission: name, key, links })
    );

  let nameError = null;
  try {
    if (name) validatePermissionName(name);
  } catch (e) {
    nameError = e.message;
  }

  const canSubmit = account && name && !nameError && key && links.length && chainId && !busy;

  return (
    <div className="container py-4" style={{ maxWidth: "52rem" }}>
      <h1 className="h3">{title ?? "Account permissions"}</h1>
      <p className="text-muted">
        {intro ??
          "Create a named permission on your account holding one key, linked only to the actions you choose. Permissions created here are children of active: strictly weaker than your own keys, and revocable at any time."}
      </p>

      <Alert variant="secondary" className="small">
        <strong>No account yet?</strong> Libre accounts are free at{" "}
        <a href="https://accounts.libre.org" target="_blank" rel="noreferrer">accounts.libre.org</a>.
        Your <code>owner</code> and <code>active</code> keys are never changed here — use{" "}
        <a href="/rekey">/rekey</a> for that.
      </Alert>

      <Card className="mb-3">
        <Card.Body>
          <Form.Label>Account</Form.Label>
          <Form.Control
            value={account}
            onChange={(e) => setAccount(e.target.value.trim().toLowerCase())}
            placeholder="myaccount"
            autoComplete="off"
          />
          <Form.Text>
            Network: <strong>{network}</strong>. Anyone can inspect; only the account owner can sign.
          </Form.Text>
        </Card.Body>
      </Card>

      {permissions && (
        <PermissionList
          permissions={permissions}
          onEdit={startEdit}
          onRevoke={onRevoke}
          canSign
        />
      )}

      <Card className="mb-3">
        <Card.Body>
          <Card.Title className="h6">
            {editing ? `Edit ${editing}` : "Create a permission"}
            {editing && (
              <Button size="sm" variant="link" onClick={startCreate}>
                cancel
              </Button>
            )}
          </Card.Title>

          <Form.Group className="mb-3">
            <Form.Label>Permission name</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value.trim().toLowerCase())}
              disabled={!!editing || !!lockedTemplate}
              isInvalid={!!nameError}
              placeholder="trading"
            />
            <Form.Control.Feedback type="invalid">{nameError}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Public key for this permission</Form.Label>
            <Form.Control
              value={key}
              onChange={(e) => setKey(e.target.value.trim())}
              placeholder="PUB_K1_…"
              autoComplete="off"
            />
            <Form.Text>
              The <strong>public</strong> key of the keypair the bot holds — never a private key.{" "}
              <a href="/seed-generator">Generate a keypair</a>.
            </Form.Text>
          </Form.Group>

          {!lockedTemplate && (
            <Form.Group className="mb-3">
              <Form.Label>Start from a template</Form.Label>
              <div className="d-flex gap-2 flex-wrap">
                {Object.entries(TEMPLATES).map(([id, t]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => {
                      setLinks(templateLinks([id]));
                      if (!editing) setName(t.permission);
                    }}
                    title={t.description}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </Form.Group>
          )}

          <ActionPicker apiUrl={apiUrl} selected={links} onChange={setLinks} />

          {links.length > 0 && (
            <div className="mt-3">
              <div className="small text-muted mb-1">This permission will be able to:</div>
              <ul className="small mb-0">
                {links.map((l) => (
                  <li key={linkId(l)}>
                    <code>{l.account}</code>::<code>{l.action || "(whole contract)"}</code>{" "}
                    <Button
                      size="sm"
                      variant="link"
                      className="p-0"
                      onClick={() => setLinks(links.filter((x) => linkId(x) !== linkId(l)))}
                    >
                      remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card.Body>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}
      {txid && (
        <Alert variant="success">
          Done{signedAs ? ` (signed as ${signedAs})` : ""}.{" "}
          <a href={`${EXPLORER[network] ?? EXPLORER.mainnet}${txid}`} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </Alert>
      )}

      <Button disabled={!canSubmit} onClick={submit}>
        {busy ? <Spinner size="sm" animation="border" /> : editing ? "Apply changes" : "Connect wallet & create"}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Replace BotAccount.jsx with a wrapper**

```jsx
import Permissions from "./Permissions";

// /bot-account predates /permissions and is published by mcp.libre.org and docs.libre.org,
// so it must keep working. It is the `bot` template with the permission name fixed.
export default function BotAccount() {
  return (
    <Permissions
      lockedTemplate="bot"
      title="Give a bot its own permission"
      intro="Create a restricted agent permission holding only your bot's key, linked only to what an agent using mcp.libre.org needs. Your bot signs with that key; it can never change your keys, vote, or spend outside what you grant here."
    />
  );
}
```

- [ ] **Step 3: Add the route**

In `src/App.jsx`, beside the existing `/bot-account` route:

```jsx
<Route path="/permissions" element={<Permissions />} />
```

with `import Permissions from './Permissions';` alongside the other page imports.

- [ ] **Step 4: Run the suite and build**

Run: `npx vitest run && npx vite build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(permissions): /permissions page; /bot-account becomes its bot template"
```

---

### Task 8: Manual verification against testnet

**Files:** none — this task changes no code. It exists because the builders are unit-tested but the wallet round-trip is not, and the failure this catches (a rejected transaction) only appears on chain.

**Interfaces:** none.

- [ ] **Step 1: Serve the built app**

```bash
npx vite build && npx vite preview --port 4177
```

Open `http://localhost:4177/permissions?network=testnet` — note **`localhost`, not `127.0.0.1`**: vite binds IPv6 and `127.0.0.1` refuses the connection.

- [ ] **Step 2: Inspect an account you do not control**

Enter `bentester`. Expect the permission list to render, `owner`/`active` shown greyed with the `/rekey` pointer, and any child permissions listed with their linked actions.

- [ ] **Step 3: Create a permission on a testnet account you control**

Use the `trade` template, paste any valid public key, sign in Anchor. Expect one `updateauth` and three `linkauth` actions in the wallet preview. Confirm the new permission appears in the list afterwards with exactly those three links.

- [ ] **Step 4: Edit it — the diff case**

Click Edit, remove `dex.libre::cancelorder`, add `loan::borrowvar` via the ActionPicker (type `loan`, press Load). Expect the wallet to show **exactly one `linkauth` and one `unlinkauth`, and no `updateauth`** — the key did not change. This is the behaviour the whole design exists to get right; if an `updateauth` appears, or the removed action is not unlinked, stop and fix `buildEditActions`.

- [ ] **Step 5: Revoke it**

Click Revoke. Expect `unlinkauth` for every remaining link **followed by** `deleteauth`. If the chain returns *"Cannot delete a linked authority"*, the ordering is wrong.

- [ ] **Step 6: Confirm /bot-account still works**

Open `http://localhost:4177/bot-account`. Expect the bot-specific title and intro, the name field fixed to `agent` and disabled, and no template buttons.

- [ ] **Step 7: Record the result**

Append the testnet transaction ids to the plan under this task, then commit:

```bash
git add docs/superpowers/plans/2026-09-05-permission-manager.md
git commit -m "docs: record testnet verification of the permission manager"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| `permissions.js` builders | 1, 2, 4 |
| `diffLinks` | 1 |
| `validatePermissionName` | 2 |
| `TEMPLATES` | 3 |
| ABI picker | 5, 6 |
| Inspect / create / edit / revoke states | 7 |
| `owner`/`active` read-only boundary | 2 (validation), 4 (boundary test), 6 (PermissionList display) |
| Revoke unlinks first | 4 |
| Edit as diff | 1, 4, verified in 8 |
| Optional `linked_action.action` | 1, 4, 5 |
| URL prefill: templates only | 7 — reads `template`, `account`, `network`; never actions |
| Unfetchable ABI → manual entry behind opt-in | 6 |
| `/bot-account` migration | 3 (imports), 7 (wrapper) |
| Re-read before diffing | 7 (`loadAccount()` inside `sign`) |
| No component tests | stated in Task 6; covered by Task 8 instead |

**Placeholder scan:** none — every step carries its code or its exact command.

**Type consistency:** `Link = {account, action}` throughout; `normalizeLink` defaults `action` to `""`; `linkId` is `account::action`. `buildCreateActions`/`buildEditActions`/`buildRevokeActions` take `permission` (not `permissionName`) in every task and in the page. `templateLinks` (not `linkedActions`, the old `botAccount.js` name) is used from Task 3 onward, including in the Task 3 migration of `BotAccount.jsx`.

**Known ordering wrinkle:** Task 3 Step 5 repoints `BotAccount.jsx` at `buildCreateActions`, which Task 4 introduces. Flagged inline in Task 3; the tree builds again at Task 4 Step 5. Executors running tasks strictly in sequence should expect one intermediate red build.
