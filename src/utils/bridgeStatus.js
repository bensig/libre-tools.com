export const API_ENDPOINTS = {
  mainnet: 'https://api.libre.org',
  testnet: 'https://testnet-api.libre.org',
};

export const BRIDGE_CONTRACTS = ['x.libre', 'v.libre', 't.libre'];
export const PEGOUT_TABLE = 'ptxhistory';
export const PEGIN_TABLE = 'txhistory';

export async function post(endpoint, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}`);
  return response.json();
}

async function fetchScopes(endpoint, contract, table) {
  const data = await post(endpoint, '/v1/chain/get_table_by_scope', {
    code: contract,
    table,
    limit: 100,
  });
  return (data.rows || []).filter((r) => r.table === table).map((r) => r.scope);
}

async function fetchScopeRows(endpoint, contract, table, scope) {
  const rows = [];
  let lowerBound = '';
  // row counts are in the hundreds; cap pages defensively
  for (let page = 0; page < 20; page += 1) {
    const data = await post(endpoint, '/v1/chain/get_table_rows', {
      code: contract,
      table,
      scope,
      json: true,
      limit: 500,
      lower_bound: lowerBound,
    });
    rows.push(...(data.rows || []));
    if (!data.more) break;
    lowerBound = data.next_key;
  }
  return rows;
}

export async function fetchBridgeTable(endpoint, table, contracts = BRIDGE_CONTRACTS) {
  const settled = await Promise.allSettled(
    contracts.map(async (contract) => {
      const scopes = await fetchScopes(endpoint, contract, table);
      const perScope = await Promise.all(
        scopes.map(async (scope) => {
          const rows = await fetchScopeRows(endpoint, contract, table, scope);
          return rows.map((row) => ({ ...row, contract, scope }));
        }),
      );
      return perScope.flat();
    }),
  );
  const rows = [];
  const errors = {};
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') rows.push(...result.value);
    else errors[contracts[i]] = result.reason?.message || String(result.reason);
  });
  return { rows, errors };
}
