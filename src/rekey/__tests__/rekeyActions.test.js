import { describe, it, expect } from "vitest";
import { buildRekeyActions, updateauthAction } from "../rekeyActions";

const NEW = "PUB_K1_6jCUrofxPN5rd6jN2yLEwoBSbJWeimgPYBgMaBh7fCFwAoZUzb";

describe("rekeyActions", () => {
  it("builds active then owner, both owner-authorized", () => {
    const acts = buildRekeyActions("evanr", NEW);
    expect(acts).toHaveLength(2);
    for (const a of acts) {
      expect(a.account).toBe("eosio");
      expect(a.name).toBe("updateauth");
      expect(a.authorization).toEqual([{ actor: "evanr", permission: "owner" }]);
      expect(a.data.auth).toEqual({ threshold: 1, keys: [{ key: NEW, weight: 1 }], accounts: [], waits: [] });
    }
    expect(acts[0].data.permission).toBe("active");
    expect(acts[0].data.parent).toBe("owner");
    expect(acts[1].data.permission).toBe("owner");
    expect(acts[1].data.parent).toBe("");
  });

  it("updateauthAction sets one perm", () => {
    const a = updateauthAction("evanr", "active", "owner", NEW);
    expect(a.data.permission).toBe("active");
    expect(a.data.parent).toBe("owner");
  });
});
