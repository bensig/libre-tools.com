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
