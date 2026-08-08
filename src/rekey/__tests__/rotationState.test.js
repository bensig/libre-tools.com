import { describe, it, expect } from "vitest";
import { rotationStatus, ownerCompletionAction } from "../rotationState";

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
