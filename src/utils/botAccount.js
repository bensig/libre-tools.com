// Builds the transaction that gives a bot a restricted `agent` permission.
//
// The security model of the whole agent platform rests on this shape: the bot holds a key
// on a CHILD permission of `active`, linked only to named actions. It cannot change keys,
// cannot vote, cannot touch owner/active, and is revoked with a single deleteauth. Getting
// the parent or the linkauth set wrong silently hands a bot more power than intended, which
// is why this lives in a tested pure function rather than inline in the component.

export const AGENT_PERMISSION = "agent";

/**
 * Capability bundles, mapped onto the action whitelist enforced by mcp.libre.org
 * (see libre-mcp src/compose/validate.ts — these must stay in step).
 *
 * DEX orders are placed by transferring tokens to dex.libre with a structured memo, which
 * is why "trade" needs transfer rights on the traded tokens and not a dex-specific action.
 */
export const BUNDLES = {
  trade: {
    label: "Trade on the DEX",
    description:
      "Place and cancel orders on dex.libre. Orders are token transfers with a memo, so this lets the bot send your BTC and USDT to dex.libre.",
    actions: [
      { account: "usdt.libre", action: "transfer" },
      { account: "btc.libre", action: "transfer" },
      { account: "dex.libre", action: "cancelorder" },
    ],
  },
  borrow: {
    label: "Borrow against BTC",
    description:
      "Create and fund a collateral vault, borrow USDT against it, repay, and withdraw collateral.",
    actions: [
      { account: "loan", action: "createvault" },
      { account: "loan", action: "genaddr" },
      { account: "loan", action: "borrowvar" },
      { account: "loan", action: "processqueue" },
      { account: "loan", action: "cancelloan" },
      { account: "loan", action: "withdraw" },
      { account: "usdt.libre", action: "transfer" },
    ],
  },
  lend: {
    label: "Lend USDT",
    description:
      "Deposit USDT into the lending pool, redeem TPF shares, and manage the redemption queue.",
    actions: [
      { account: "usdt.libre", action: "transfer" },
      { account: "tp.libre", action: "transfer" },
      { account: "loan", action: "cancelredeem" },
      { account: "loan", action: "processqueue" },
    ],
  },
  sendLibre: {
    label: "Send LIBRE",
    description:
      "Transfer LIBRE out of the account. No tool on mcp.libre.org needs this — grant it only if your bot does something else with LIBRE.",
    actions: [{ account: "eosio.token", action: "transfer" }],
  },
};

/** Deduplicated {account, action} pairs for the selected bundles, in a stable order. */
export function linkedActions(bundleKeys) {
  const seen = new Set();
  const out = [];
  for (const key of bundleKeys) {
    const bundle = BUNDLES[key];
    if (!bundle) throw new Error(`Unknown capability bundle: ${key}`);
    for (const a of bundle.actions) {
      const id = `${a.account}::${a.action}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(a);
    }
  }
  return out;
}

/**
 * The full transaction: one updateauth creating `agent` under `active`, then one linkauth
 * per granted action.
 *
 * @param {object} opts
 * @param {string} opts.account   the account granting the permission
 * @param {string} opts.agentKey  the bot's PUBLIC key
 * @param {string[]} opts.bundles selected capability bundle keys
 */
export function buildAgentPermissionActions({ account, agentKey, bundles }) {
  if (!account) throw new Error("account is required");
  if (!agentKey) throw new Error("agentKey is required");
  if (!agentKey.startsWith("PUB_") && !agentKey.startsWith("EOS"))
    throw new Error("agentKey must be a public key (PUB_K1_… or EOS…), never a private key");
  if (!bundles?.length) throw new Error("select at least one capability");

  const links = linkedActions(bundles);

  const updateauth = {
    account: "eosio",
    name: "updateauth",
    authorization: [{ actor: account, permission: "active" }],
    data: {
      account,
      permission: AGENT_PERMISSION,
      // Parent is `active`, never `owner`: the agent permission is strictly weaker than
      // the keys the human holds, and remains revocable by them.
      parent: "active",
      auth: {
        threshold: 1,
        keys: [{ key: agentKey, weight: 1 }],
        accounts: [],
        waits: [],
      },
    },
  };

  const linkauths = links.map(({ account: code, action }) => ({
    account: "eosio",
    name: "linkauth",
    authorization: [{ actor: account, permission: "active" }],
    data: {
      account,
      code,
      type: action,
      requirement: AGENT_PERMISSION,
    },
  }));

  return [updateauth, ...linkauths];
}

/** The transaction that revokes it again. */
export function buildRevokeActions({ account }) {
  if (!account) throw new Error("account is required");
  return [
    {
      account: "eosio",
      name: "deleteauth",
      authorization: [{ actor: account, permission: "active" }],
      data: { account, permission: AGENT_PERMISSION },
    },
  ];
}
