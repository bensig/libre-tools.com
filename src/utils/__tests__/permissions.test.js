import { describe, it, expect } from "vitest";
import { diffLinks, linkId, normalizeLink, validatePermissionName, RESERVED_PERMISSIONS } from "../permissions";

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
