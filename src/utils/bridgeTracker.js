// Lookup helpers for the Bridge Transaction Tracker.
// The ETH bridge contract (t.libre) stores eth_tx_hash on-chain in both
// directions, so ETH lookups are table scans rather than address matching.

const ERC20_TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const ZERO_HASH = /^0+$/;

export const ETH_BRIDGE_CONTRACT = 't.libre';
export const USDT_TOKEN_CONTRACT = 'usdt.libre';

// 'eth' = 0x-prefixed 64 hex chars, 'btcOrLibre' = bare 64 hex chars
export const classifyHash = (input) => {
  const value = (input || '').trim();
  if (/^0x[0-9a-fA-F]{64}$/.test(value)) return 'eth';
  if (/^[0-9a-fA-F]{64}$/.test(value)) return 'btcOrLibre';
  return null;
};

export const isEthAddress = (value) =>
  /^0x[0-9a-fA-F]{40}$/.test((value || '').trim());

export const isZeroHash = (hash) => !hash || ZERO_HASH.test(hash);

const getTableRows = async (libreEndpoint, params) => {
  const response = await fetch(`${libreEndpoint}/v1/chain/get_table_rows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ json: true, limit: 1000, ...params }),
  });
  if (!response.ok) {
    throw new Error(`Failed to query ${params.code}/${params.table}: ${response.statusText}`);
  }
  return response.json();
};

export const getTableScopes = async (libreEndpoint, code, table) => {
  const scopes = [];
  let lower_bound = '';
  while (true) {
    const response = await fetch(`${libreEndpoint}/v1/chain/get_table_by_scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, table, limit: 100, lower_bound, json: true }),
    });
    if (!response.ok) return scopes;
    const data = await response.json();
    scopes.push(...data.rows.filter((r) => r.table === table).map((r) => r.scope));
    if (!data.more) break;
    lower_bound = data.more;
  }
  return scopes;
};

// Paginated scan of one table scope, returns first row matching predicate
const scanTable = async (libreEndpoint, code, table, scope, predicate) => {
  let lower_bound = '';
  while (true) {
    const data = await getTableRows(libreEndpoint, { code, scope, table, lower_bound });
    const match = data.rows.find(predicate);
    if (match) return match;
    if (!data.more || data.rows.length === 0) return null;
    lower_bound = data.next_key;
  }
};

// Scan every scope of a table; returns { scope, row } or null
const scanAllScopes = async (libreEndpoint, code, table, predicate) => {
  const scopes = await getTableScopes(libreEndpoint, code, table);
  for (const scope of scopes) {
    const row = await scanTable(libreEndpoint, code, table, scope, predicate);
    if (row) return { scope, row };
  }
  return null;
};

// Peg-in: ETH -> Libre, recorded in t.libre txhistory (scoped by status)
export const findEthPegIn = (libreEndpoint, ethHash) =>
  scanAllScopes(
    libreEndpoint,
    ETH_BRIDGE_CONTRACT,
    'txhistory',
    (row) => row.eth_tx_hash?.toLowerCase() === ethHash
  );

// Peg-out: Libre -> ETH, recorded in t.libre ptxhistory (scoped by status)
export const findEthPegOut = (libreEndpoint, ethHash) =>
  scanAllScopes(
    libreEndpoint,
    ETH_BRIDGE_CONTRACT,
    'ptxhistory',
    (row) => row.eth_tx_hash?.toLowerCase() === ethHash
  );

// Match a peg-out row from its originating Libre transfer (memo = ETH address)
export const findEthPegOutByAddressAndAmount = (libreEndpoint, ethAddress, quantity) =>
  scanAllScopes(
    libreEndpoint,
    ETH_BRIDGE_CONTRACT,
    'ptxhistory',
    (row) =>
      row.to?.toLowerCase() === ethAddress.toLowerCase() &&
      parseFloat(row.quantity) === parseFloat(quantity)
  );

// The mint transfer memo is "Bridge from ETH tx: 0x..." so the Libre-side
// transaction can be located from the destination account's history
export const findEthMintTransaction = async (libreEndpoint, account, ethHash) => {
  const response = await fetch(
    `${libreEndpoint}/v2/history/get_actions?account=${account}&filter=${USDT_TOKEN_CONTRACT}:transfer&limit=100`
  );
  if (!response.ok) return null;
  const data = await response.json();
  const match = (data.actions || []).find(
    (a) =>
      a.act?.data?.from === USDT_TOKEN_CONTRACT &&
      a.act?.data?.memo?.toLowerCase().includes(ethHash)
  );
  return match ? { trxId: match.trx_id, timestamp: match.timestamp } : null;
};

export const parseEthHashFromMemo = (memo) => {
  const match = /(0x[0-9a-fA-F]{64})/.exec(memo || '');
  return match ? match[1].toLowerCase() : null;
};

export const getEthTransactionReceipt = async (ethRpc, ethHash) => {
  const response = await fetch(ethRpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [ethHash],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.result || null;
};

// Decode ERC-20 Transfer events from a receipt: { token, to, value }
export const decodeErc20Transfers = (receipt) =>
  (receipt.logs || [])
    .filter((log) => log.topics?.[0] === ERC20_TRANSFER_TOPIC && log.topics.length >= 3)
    .map((log) => ({
      token: log.address.toLowerCase(),
      to: `0x${log.topics[2].slice(-40)}`.toLowerCase(),
      value: parseInt(log.data, 16),
    }));

// Reverse lookup: which Libre account owns this ETH deposit address?
export const findAccountByEthAddress = async (libreEndpoint, ethAddress) => {
  const target = ethAddress.toLowerCase();
  const predicate = (row) => row.eth_address?.toLowerCase() === target;
  for (const table of ['accounts', 'maccounts']) {
    const match = await scanTable(
      libreEndpoint, ETH_BRIDGE_CONTRACT, table, ETH_BRIDGE_CONTRACT, predicate
    );
    if (match) return match.account;
  }
  return null;
};
