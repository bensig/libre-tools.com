// src/utils/permissions.js
import { PublicKey } from "@wharfkit/antelope";

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

const ACTIVE = "active";
const auth = (account) => [{ actor: account, permission: ACTIVE }];

function assertPublicKey(key) {
  if (!key) throw new Error("A public key is required");
  if (!key.startsWith("PUB_") && !key.startsWith("EOS"))
    throw new Error("That must be a public key (PUB_K1_… or EOS…), never a private key");
  try {
    PublicKey.from(key);
  } catch {
    throw new Error("That doesn't look like a valid public key — check it was copied in full");
  }
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

/**
 * Sort an account's permissions into what this tool may manage and what it may only show.
 *
 * - `reserved`  — owner and active. Displayed, never written. owner first, then active.
 * - `manageable` — direct children of active. These are ours to create, edit and revoke.
 * - `nested`    — anything deeper (a child of a child). Real, and previously invisible here
 *   because the list only looked at children of active. Shown read-only with its parent
 *   named, so an account audit is not silently incomplete.
 *
 * @param {{perm_name: string, parent: string}[]} permissions from /v1/chain/get_account
 */
export function groupPermissions(permissions = []) {
  const byName = (a, b) => a.perm_name.localeCompare(b.perm_name);
  const reserved = [];
  const manageable = [];
  const nested = [];
  for (const p of permissions) {
    if (RESERVED_PERMISSIONS.has(p.perm_name)) reserved.push(p);
    else if (p.parent === ACTIVE) manageable.push(p);
    else nested.push(p);
  }
  // owner is the root of the authority tree, so it reads first.
  reserved.sort((a, b) => (a.perm_name === "owner" ? -1 : b.perm_name === "owner" ? 1 : 0));
  return { reserved, manageable: manageable.sort(byName), nested: nested.sort(byName) };
}

/** Keys, threshold, delegated accounts and waits, for the expanded detail view. */
export function permissionDetail(permission) {
  const auth = permission?.required_auth ?? {};
  return {
    threshold: auth.threshold ?? null,
    keys: (auth.keys ?? []).map((k) => ({ key: k.key, weight: k.weight })),
    accounts: (auth.accounts ?? []).map((a) => ({
      actor: a.permission?.actor,
      permission: a.permission?.permission,
      weight: a.weight,
    })),
    waits: (auth.waits ?? []).map((w) => ({ wait_sec: w.wait_sec, weight: w.weight })),
  };
}
