import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchContractActions, __clearAbiCache } from "../abi";

const API = "https://api.example";
const okResponse = (abi) => ({ ok: true, json: async () => ({ abi }) });

beforeEach(() => __clearAbiCache());

describe("fetchContractActions", () => {
  it("returns the contract's action names, sorted", async () => {
    const fetchImpl = vi.fn(async () =>
      okResponse({ actions: [{ name: "transfer" }, { name: "create" }] })
    );
    await expect(fetchContractActions(API, "usdt.libre", { fetchImpl })).resolves.toEqual([
      "create",
      "transfer",
    ]);
  });

  it("caches per contract so retyping does not refetch", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ actions: [{ name: "transfer" }] }));
    await fetchContractActions(API, "usdt.libre", { fetchImpl });
    await fetchContractActions(API, "usdt.libre", { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explains when an account has no ABI rather than returning nothing", async () => {
    const fetchImpl = vi.fn(async () => okResponse(null));
    await expect(fetchContractActions(API, "notacontract", { fetchImpl })).rejects.toThrow(
      /no ABI/i
    );
  });

  it("does not cache a failure", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
      .mockResolvedValueOnce(okResponse({ actions: [{ name: "transfer" }] }));
    await expect(fetchContractActions(API, "flaky", { fetchImpl })).rejects.toThrow(/500/);
    await expect(fetchContractActions(API, "flaky", { fetchImpl })).resolves.toEqual(["transfer"]);
  });
});
