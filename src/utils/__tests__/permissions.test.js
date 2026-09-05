import { describe, it, expect } from "vitest";
import { diffLinks, linkId, normalizeLink, validatePermissionName, RESERVED_PERMISSIONS, TEMPLATES, templateLinks } from "../permissions";

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
