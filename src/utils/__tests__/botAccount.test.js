import { describe, it, expect } from "vitest";
import {
  BUNDLES,
  AGENT_PERMISSION,
  linkedActions,
  buildAgentPermissionActions,
  buildRevokeActions,
} from "../botAccount";

const KEY = "PUB_K1_57cc8Hs2ScTLjFNJQ2Zh8wTHmkkwKwvtMUfJdfNhjH5tLgg2gT";
const build = (bundles, over = {}) =>
  buildAgentPermissionActions({ account: "mybot", agentKey: KEY, bundles, ...over });

describe("bundles", () => {
  it("deduplicates actions shared between bundles", () => {
    // borrow and lend both need usdt.libre::transfer; it must be linked once.
    const links = linkedActions(["borrow", "lend"]);
    const ids = links.map((l) => `${l.account}::${l.action}`);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((i) => i === "usdt.libre::transfer")).toHaveLength(1);
  });

  it("rejects an unknown bundle rather than silently granting nothing", () => {
    expect(() => linkedActions(["trade", "nonsense"])).toThrow(/Unknown capability bundle/);
  });

  it("grants only what the selected bundle covers", () => {
    const ids = linkedActions(["trade"]).map((l) => `${l.account}::${l.action}`);
    expect(ids.sort()).toEqual(
      ["btc.libre::transfer", "dex.libre::cancelorder", "usdt.libre::transfer"].sort()
    );
    // trading must not confer any loan power
    expect(ids.some((i) => i.startsWith("loan::"))).toBe(false);
  });

  it("keeps LIBRE transfer out of every other bundle", () => {
    for (const key of Object.keys(BUNDLES)) {
      if (key === "sendLibre") continue;
      const ids = linkedActions([key]).map((l) => `${l.account}::${l.action}`);
      expect(ids, `${key} should not grant LIBRE transfer`).not.toContain("eosio.token::transfer");
    }
  });
});

describe("parity with the mcp.libre.org whitelist", () => {
  // Mirrors WHITELIST in libre-mcp src/compose/validate.ts. If that changes, this fails and
  // the bundles above need updating — a bot granted less than the whitelist cannot use every
  // tool, and granting more than it hands out power no tool needs.
  const MCP_WHITELIST = [
    "btc.libre::transfer",
    "usdt.libre::transfer",
    "tp.libre::transfer",
    "eosio.token::transfer",
    "dex.libre::cancelorder",
    "loan::createvault",
    "loan::genaddr",
    "loan::borrowvar",
    "loan::processqueue",
    "loan::cancelloan",
    "loan::withdraw",
    "loan::cancelredeem",
  ];

  it("covers the whitelist exactly across all bundles — no gaps, no extras", () => {
    const granted = linkedActions(Object.keys(BUNDLES)).map((l) => `${l.account}::${l.action}`);
    expect(granted.sort()).toEqual([...MCP_WHITELIST].sort());
  });
});

describe("buildAgentPermissionActions", () => {
  it("creates the agent permission as a child of active, never owner", () => {
    const [updateauth] = build(["trade"]);
    expect(updateauth.account).toBe("eosio");
    expect(updateauth.name).toBe("updateauth");
    expect(updateauth.data.permission).toBe(AGENT_PERMISSION);
    expect(updateauth.data.parent).toBe("active");
    expect(updateauth.data.parent).not.toBe("owner");
  });

  it("puts exactly the bot key in the permission, weight 1, threshold 1", () => {
    const [updateauth] = build(["trade"]);
    expect(updateauth.data.auth).toEqual({
      threshold: 1,
      keys: [{ key: KEY, weight: 1 }],
      accounts: [],
      waits: [],
    });
  });

  it("signs everything with the account's active permission", () => {
    for (const a of build(["trade", "borrow"])) {
      expect(a.authorization).toEqual([{ actor: "mybot", permission: "active" }]);
    }
  });

  it("emits one linkauth per granted action and nothing more", () => {
    const actions = build(["trade"]);
    const links = actions.filter((a) => a.name === "linkauth");
    expect(actions).toHaveLength(1 + links.length);
    expect(links).toHaveLength(3);
    for (const l of links) {
      expect(l.data.requirement).toBe(AGENT_PERMISSION);
      expect(l.data.account).toBe("mybot");
    }
    expect(links.map((l) => `${l.data.code}::${l.data.type}`).sort()).toEqual(
      ["btc.libre::transfer", "dex.libre::cancelorder", "usdt.libre::transfer"].sort()
    );
  });

  it("refuses a private key in the agent key field", () => {
    expect(() => build(["trade"], { agentKey: "PVT_K1_2bfGi9rYsXQSXXTvJbDAPhHLQUojjaNLChzuBvHgUCFbdgQjNb" }))
      .toThrow(/must be a public key/);
  });

  it("requires an account, a key and at least one capability", () => {
    expect(() => build(["trade"], { account: "" })).toThrow(/account is required/);
    expect(() => build(["trade"], { agentKey: "" })).toThrow(/agentKey is required/);
    expect(() => build([])).toThrow(/at least one capability/);
  });
});

describe("buildRevokeActions", () => {
  it("unlinks every action before deleting — deleteauth refuses a linked authority", () => {
    // Leap eosio_contract.cpp: "Cannot delete a linked authority. Unlink the authority
    // first." Every permission this tool creates is linked, so deleteauth alone always fails.
    const actions = buildRevokeActions({
      account: "mybot",
      linkedActions: [
        { account: "usdt.libre", action: "transfer" },
        { account: "dex.libre", action: "cancelorder" },
      ],
    });
    expect(actions.map((a) => a.name)).toEqual(["unlinkauth", "unlinkauth", "deleteauth"]);
    expect(actions[0].data).toEqual({ account: "mybot", code: "usdt.libre", type: "transfer" });
    expect(actions.at(-1).data).toEqual({ account: "mybot", permission: AGENT_PERMISSION });
  });

  it("handles a contract-wide link, where action is absent on chain", () => {
    const [unlink] = buildRevokeActions({
      account: "mybot",
      linkedActions: [{ account: "somecontract" }],
    });
    expect(unlink.data).toEqual({ account: "mybot", code: "somecontract", type: "" });
  });

  it("deletes directly when nothing is linked", () => {
    const actions = buildRevokeActions({ account: "mybot" });
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe("deleteauth");
  });
});
