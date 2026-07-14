import { describe, it, expect, vi, beforeEach } from "vitest";
import { getAccountKeys } from "../accountKeys";

const K = "EOS5Pyi6LuTG6GfmV56pcASYqB8QgpUBCjMQjE8cELemJfgm1iBrE";

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      permissions: [
        { perm_name: "owner", required_auth: { threshold: 1, keys: [{ key: K, weight: 1 }], accounts: [], waits: [] } },
        { perm_name: "active", required_auth: { threshold: 1, keys: [{ key: K, weight: 1 }], accounts: [], waits: [] } },
      ],
    }),
  }));
});

describe("getAccountKeys", () => {
  it("returns canonical owner+active keys", async () => {
    const { owner, active } = await getAccountKeys("https://lb.libre.org", "bitcoinlibre");
    expect(owner.startsWith("PUB_K1_")).toBe(true);
    expect(active).toBe(owner);
  });

  it("throws on multisig/complex auth", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ permissions: [
        { perm_name: "owner", required_auth: { threshold: 2, keys: [{ key: K, weight: 1 }], accounts: [], waits: [] } },
        { perm_name: "active", required_auth: { threshold: 1, keys: [{ key: K, weight: 1 }], accounts: [], waits: [] } },
      ] }),
    }));
    await expect(getAccountKeys("https://lb.libre.org", "swap.libre")).rejects.toThrow(/single key/i);
  });
});
