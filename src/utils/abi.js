// Cache SUCCESSES only: caching a failure would leave a contract permanently
// un-pickable for the session after one network blip.
const cache = new Map();

export function __clearAbiCache() {
  cache.clear();
}

/**
 * Action names declared by a contract's ABI.
 * @param {string} apiUrl chain API base, e.g. https://api.libre.org
 * @param {string} contract account name
 */
export async function fetchContractActions(apiUrl, contract, { fetchImpl = fetch } = {}) {
  const key = `${apiUrl}|${contract}`;
  if (cache.has(key)) return cache.get(key);

  const res = await fetchImpl(`${apiUrl}/v1/chain/get_abi`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_name: contract }),
  });
  if (!res.ok) throw new Error(`Could not read ${contract}: HTTP ${res.status}`);

  const body = await res.json();
  const actions = body?.abi?.actions;
  if (!actions || !actions.length)
    throw new Error(
      `${contract} has no ABI — it may not be a contract, or may not be deployed yet.`
    );

  const names = actions.map((a) => a.name).sort();
  cache.set(key, names);
  return names;
}
