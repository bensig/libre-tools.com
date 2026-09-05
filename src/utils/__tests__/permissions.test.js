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
