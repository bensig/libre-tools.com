# Bridge Status Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deep-linkable `/bridge-status` page showing peg-out review/completed/canceled rows and peg-in rows across `x.libre`, `v.libre`, `t.libre`, with per-review-row multisig proposal status; plus a redirect so the intuitive explorer URL (`/explorer/:network/:contract/ptxhistory/:scope`) works.

**Architecture:** Pure fetch/merge/match helpers live in `src/utils/` (unit-tested with mocked `fetch`, vitest node environment). A single page component `src/BridgeStatus.jsx` orchestrates fetches and renders three tabs. Routes added in `src/App.jsx`, nav item in `src/components/Layout.jsx`, legacy-URL redirect wired into `src/LibreExplorer.jsx`.

**Tech Stack:** React 18, react-router-dom 7, react-bootstrap, `@wharfkit/antelope` (already a dependency — used to decode msig packed transactions), vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-10-bridge-status-design.md`

## Global Constraints

- No new npm dependencies.
- Tests live in `src/**/__tests__/*.test.js` (vitest config: node environment, that glob only). Run with `npx vitest run`.
- ESM only (`"type": "module"`).
- API endpoints: mainnet `https://lb.libre.org`, testnet `https://testnet.libre.org` (same as `LoanTracker.jsx`).
- Bridge contracts: `x.libre`, `v.libre`, `t.libre`. Peg-out table `ptxhistory` (scopes seen on chain: `review`, `completed`, `canceled`); peg-in table `txhistory` (scope `confirmed`). Never hardcode the scope list — discover via `get_table_by_scope`; a missing scope means zero rows, not an error.
- Bootstrap/react-bootstrap styling consistent with existing pages; each commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Verify lint (`npm run lint`) and build (`npm run build`) pass before the final commit.

---

### Task 1: Bridge table fetch/merge helpers

**Files:**
- Create: `src/utils/bridgeStatus.js`
- Test: `src/utils/__tests__/bridgeStatus.test.js`

**Interfaces:**
- Consumes: global `fetch`.
- Produces (used by Tasks 2 and 4):
  - `API_ENDPOINTS: {mainnet: string, testnet: string}`
  - `BRIDGE_CONTRACTS: string[]`
  - `PEGOUT_TABLE = 'ptxhistory'`, `PEGIN_TABLE = 'txhistory'`
  - `post(endpoint, path, body) → Promise<object>` (throws on non-ok HTTP)
  - `fetchBridgeTable(endpoint, table, contracts?) → Promise<{rows: Array<row & {contract, scope}>, errors: Record<contract, string>}>`

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/bridgeStatus.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchBridgeTable, PEGOUT_TABLE } from '../bridgeStatus';

const jsonResponse = (body) => ({ ok: true, json: async () => body });

// Builds a fetch mock keyed by contract: get_table_by_scope returns that
// contract's scopes; get_table_rows returns its rows for the requested scope.
function mockChain({ scopesByContract, rowsByContractScope, failContracts = [] }) {
  return vi.fn(async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (failContracts.includes(body.code)) return { ok: false, status: 500 };
    if (url.endsWith('/v1/chain/get_table_by_scope')) {
      const scopes = scopesByContract[body.code] || [];
      return jsonResponse({
        rows: scopes.map((scope) => ({ code: body.code, scope, table: body.table })),
        more: '',
      });
    }
    if (url.endsWith('/v1/chain/get_table_rows')) {
      const rows = rowsByContractScope[`${body.code}:${body.scope}`] || [];
      return jsonResponse({ rows, more: false, next_key: '' });
    }
    throw new Error(`unexpected url ${url}`);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchBridgeTable', () => {
  it('merges rows from all contracts, tagging contract and scope', async () => {
    vi.stubGlobal('fetch', mockChain({
      scopesByContract: {
        'x.libre': ['review', 'completed'],
        'v.libre': ['review'],
        't.libre': [], // empty scope list = zero rows, not an error
      },
      rowsByContractScope: {
        'x.libre:review': [{ id: 1, to: 'bc1qaaa', quantity: '0.1 BTC' }],
        'x.libre:completed': [{ id: 2, to: 'bc1qbbb', quantity: '0.2 BTC' }],
        'v.libre:review': [{ id: 7, to: 'bc1qccc', quantity: '0.3 CBTC' }],
      },
    }));
    const { rows, errors } = await fetchBridgeTable('https://api.test', PEGOUT_TABLE);
    expect(errors).toEqual({});
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === 7)).toMatchObject({ contract: 'v.libre', scope: 'review' });
    expect(rows.filter((r) => r.contract === 'x.libre')).toHaveLength(2);
  });

  it('reports per-contract errors without dropping other contracts', async () => {
    vi.stubGlobal('fetch', mockChain({
      scopesByContract: { 'x.libre': ['review'] },
      rowsByContractScope: { 'x.libre:review': [{ id: 1 }] },
      failContracts: ['v.libre', 't.libre'],
    }));
    const { rows, errors } = await fetchBridgeTable('https://api.test', PEGOUT_TABLE);
    expect(rows).toHaveLength(1);
    expect(Object.keys(errors).sort()).toEqual(['t.libre', 'v.libre']);
  });

  it('paginates get_table_rows when more=true', async () => {
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      if (url.endsWith('/v1/chain/get_table_by_scope')) {
        return jsonResponse({ rows: [{ code: body.code, scope: 'review', table: body.table }], more: '' });
      }
      call += 1;
      return call === 1
        ? jsonResponse({ rows: [{ id: 1 }], more: true, next_key: '2' })
        : jsonResponse({ rows: [{ id: 2 }], more: false, next_key: '' });
    }));
    const { rows } = await fetchBridgeTable('https://api.test', PEGOUT_TABLE, ['x.libre']);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/bridgeStatus.test.js`
Expected: FAIL — cannot resolve `../bridgeStatus`.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/bridgeStatus.js
export const API_ENDPOINTS = {
  mainnet: 'https://lb.libre.org',
  testnet: 'https://testnet.libre.org',
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/bridgeStatus.test.js`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/bridgeStatus.js src/utils/__tests__/bridgeStatus.test.js
git commit -m "feat(bridge-status): cross-contract table fetch/merge helpers"
```

---

### Task 2: Msig proposal fetch, decode, and row matching

**Files:**
- Create: `src/utils/bridgeStatusMsig.js`
- Test: `src/utils/__tests__/bridgeStatusMsig.test.js`

**Interfaces:**
- Consumes: `post` from `./bridgeStatus`; `Serializer`, `Transaction` from `@wharfkit/antelope`.
- Produces (used by Task 4):
  - `fetchOpenProposals(endpoint) → Promise<Array<{proposer, proposalName, requested: number, provided: number, actions: Array<{account, name, dataHex}>}>>`
  - `matchProposalsToRows(proposals, rows) → Map<'contract:id', {proposal, level: 'exact'|'contract'}>`
  - `asciiToHex(str) → string` (lowercase hex of UTF-8 bytes)

**Matching strategy (from spec, best-effort):** decode each proposal's `packed_transaction` with `@wharfkit/antelope` (no contract ABI needed). A proposal matches a review row at level `exact` when one of its actions targets the row's contract AND the action's raw data hex contains the ASCII-hex of the row's `to` address (strings serialize as length-prefixed UTF-8, so the address bytes appear verbatim). Level `contract` when an action merely targets the row's contract. Decode failures return `[]` actions and simply produce no match — never throw.

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/bridgeStatusMsig.test.js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Serializer, Transaction } from '@wharfkit/antelope';
import {
  asciiToHex,
  decodeProposalActions,
  matchProposalsToRows,
  fetchOpenProposals,
} from '../bridgeStatusMsig';

function packTransaction(actions) {
  const tx = Transaction.from({
    expiration: '2026-01-01T00:00:00',
    ref_block_num: 0,
    ref_block_prefix: 0,
    max_net_usage_words: 0,
    max_cpu_usage_ms: 0,
    delay_sec: 0,
    context_free_actions: [],
    actions,
    transaction_extensions: [],
  });
  return Serializer.encode({ object: tx }).hexString;
}

const auth = [{ actor: 'x.libre', permission: 'active' }];

describe('decodeProposalActions', () => {
  it('decodes account, name, and data hex from a packed transaction', () => {
    const hex = packTransaction([
      { account: 'x.libre', name: 'approvepay', authorization: auth, data: asciiToHex('bc1qtestaddr') },
    ]);
    const actions = decodeProposalActions(hex);
    expect(actions).toHaveLength(1);
    expect(actions[0].account).toBe('x.libre');
    expect(actions[0].name).toBe('approvepay');
    expect(actions[0].dataHex).toContain(asciiToHex('bc1qtestaddr'));
  });

  it('returns [] for garbage input instead of throwing', () => {
    expect(decodeProposalActions('zz-not-hex')).toEqual([]);
    expect(decodeProposalActions('')).toEqual([]);
  });
});

describe('matchProposalsToRows', () => {
  const rows = [
    { contract: 'x.libre', id: 5, to: 'bc1qtestaddr', quantity: '0.1 BTC' },
    { contract: 'v.libre', id: 9, to: 'bc1qother', quantity: '0.2 CBTC' },
    { contract: 't.libre', id: 3, to: '0xabc123', quantity: '5 USDT' },
  ];

  it('prefers exact match (to-address bytes in action data) over contract match', () => {
    const proposals = [
      {
        proposalName: 'payout5',
        actions: [{ account: 'x.libre', name: 'approvepay', dataHex: `aa${asciiToHex('bc1qtestaddr')}bb` }],
      },
      {
        proposalName: 'generic',
        actions: [{ account: 'x.libre', name: 'approvepay', dataHex: 'deadbeef' }],
      },
    ];
    const matches = matchProposalsToRows(proposals, rows);
    expect(matches.get('x.libre:5')).toMatchObject({ level: 'exact' });
    expect(matches.get('x.libre:5').proposal.proposalName).toBe('payout5');
  });

  it('falls back to contract-level match and leaves unrelated rows unmatched', () => {
    const proposals = [
      { proposalName: 'vfix', actions: [{ account: 'v.libre', name: 'doit', dataHex: '00' }] },
    ];
    const matches = matchProposalsToRows(proposals, rows);
    expect(matches.get('v.libre:9')).toMatchObject({ level: 'contract' });
    expect(matches.has('x.libre:5')).toBe(false);
    expect(matches.has('t.libre:3')).toBe(false);
  });
});

describe('fetchOpenProposals', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches proposals across proposer scopes with approval counts and decoded actions', async () => {
    const packed = packTransaction([
      { account: 'x.libre', name: 'approvepay', authorization: auth, data: asciiToHex('bc1qtestaddr') },
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      const body = JSON.parse(opts.body);
      const json = async () => {
        if (url.endsWith('/v1/chain/get_table_by_scope')) {
          return { rows: [{ code: 'eosio.msig', scope: 'benobi', table: 'proposal' }], more: '' };
        }
        if (body.table === 'proposal') {
          return { rows: [{ proposal_name: 'payout5', packed_transaction: packed }], more: false };
        }
        return {
          rows: [{
            proposal_name: 'payout5',
            requested_approvals: [{ level: { actor: 'bp1', permission: 'active' } }],
            provided_approvals: [
              { level: { actor: 'bp2', permission: 'active' } },
              { level: { actor: 'bp3', permission: 'active' } },
            ],
          }],
          more: false,
        };
      };
      return { ok: true, json };
    }));
    const proposals = await fetchOpenProposals('https://api.test');
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ proposer: 'benobi', proposalName: 'payout5', requested: 1, provided: 2 });
    expect(proposals[0].actions[0].account).toBe('x.libre');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/bridgeStatusMsig.test.js`
Expected: FAIL — cannot resolve `../bridgeStatusMsig`.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/bridgeStatusMsig.js
import { Serializer, Transaction } from '@wharfkit/antelope';
import { post } from './bridgeStatus';

export function asciiToHex(str) {
  return Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function decodeProposalActions(packedTransactionHex) {
  try {
    const tx = Serializer.decode({ data: packedTransactionHex, type: Transaction });
    return tx.actions.map((action) => ({
      account: String(action.account),
      name: String(action.name),
      dataHex: action.data.hexString.toLowerCase(),
    }));
  } catch {
    return [];
  }
}

export async function fetchOpenProposals(endpoint) {
  const scopeData = await post(endpoint, '/v1/chain/get_table_by_scope', {
    code: 'eosio.msig',
    table: 'proposal',
    limit: 100,
  });
  const scopes = (scopeData.rows || []).map((r) => r.scope);
  const perScope = await Promise.all(
    scopes.map(async (scope) => {
      const [proposalData, approvalsData] = await Promise.all([
        post(endpoint, '/v1/chain/get_table_rows', {
          code: 'eosio.msig', scope, table: 'proposal', json: true, limit: 100,
        }),
        post(endpoint, '/v1/chain/get_table_rows', {
          code: 'eosio.msig', scope, table: 'approvals2', json: true, limit: 100,
        }),
      ]);
      return (proposalData.rows || []).map((p) => {
        const approvals = (approvalsData.rows || []).find((a) => a.proposal_name === p.proposal_name);
        return {
          proposer: scope,
          proposalName: p.proposal_name,
          requested: approvals?.requested_approvals?.length ?? 0,
          provided: approvals?.provided_approvals?.length ?? 0,
          actions: decodeProposalActions(p.packed_transaction),
        };
      });
    }),
  );
  return perScope.flat();
}

const rowKey = (row) => `${row.contract}:${row.id}`;

export function matchProposalsToRows(proposals, rows) {
  const matches = new Map();
  for (const row of rows) {
    const toHex = row.to ? asciiToHex(row.to) : '';
    let best = null;
    for (const proposal of proposals) {
      for (const action of proposal.actions) {
        if (action.account !== row.contract) continue;
        if (toHex && action.dataHex.includes(toHex)) {
          best = { proposal, level: 'exact' };
          break;
        }
        if (!best) best = { proposal, level: 'contract' };
      }
      if (best?.level === 'exact') break;
    }
    if (best) matches.set(rowKey(row), best);
  }
  return matches;
}
```

Note: if `action.data.hexString` is not the correct accessor in the installed `@wharfkit/antelope` version, check with `node -e "const {Serializer, Transaction} = require('@wharfkit/antelope'); ..."` or the package's `lib/` typings — the `Bytes` class exposes the hex via `.hexString`. The round-trip test in Step 1 validates this.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/bridgeStatusMsig.test.js`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add src/utils/bridgeStatusMsig.js src/utils/__tests__/bridgeStatusMsig.test.js
git commit -m "feat(bridge-status): msig proposal fetch/decode and review-row matching"
```

---

### Task 3: Legacy explorer URL redirect

**Files:**
- Create: `src/utils/explorerRedirect.js`
- Modify: `src/LibreExplorer.jsx` (add one `useEffect` near the top of the component, after the `useParams`/`useNavigate` lines at `src/LibreExplorer.jsx:9`)
- Test: `src/utils/__tests__/explorerRedirect.test.js`

**Interfaces:**
- Produces: `legacyExplorerRedirect({network, contract, view, item, scope}) → string | null` — returns the `/explorer/.../tables/...` path to redirect to, or `null` when the URL is already canonical.

**Background:** the explorer only recognizes `view === 'tables'` and `view === 'actions'` (see `src/LibreExplorer.jsx:277` and `:1386`). A URL like `/explorer/mainnet/v.libre/ptxhistory/review` silently ignores the last two segments. Rewrite any other `view` value as a table name: `/explorer/:network/:contract/tables/:view/:item`. The `custom` network is excluded — it repurposes `:item` as the contract name (`src/LibreExplorer.jsx:157`).

- [ ] **Step 1: Write the failing test**

```js
// src/utils/__tests__/explorerRedirect.test.js
import { describe, it, expect } from 'vitest';
import { legacyExplorerRedirect } from '../explorerRedirect';

describe('legacyExplorerRedirect', () => {
  it('rewrites a bare table/scope URL to the tables form', () => {
    expect(legacyExplorerRedirect({
      network: 'mainnet', contract: 'v.libre', view: 'ptxhistory', item: 'review',
    })).toBe('/explorer/mainnet/v.libre/tables/ptxhistory/review');
  });

  it('rewrites a table URL without scope', () => {
    expect(legacyExplorerRedirect({
      network: 'mainnet', contract: 'x.libre', view: 'ptxhistory',
    })).toBe('/explorer/mainnet/x.libre/tables/ptxhistory');
  });

  it('returns null for canonical, custom, and incomplete URLs', () => {
    expect(legacyExplorerRedirect({
      network: 'mainnet', contract: 'v.libre', view: 'tables', item: 'ptxhistory', scope: 'review',
    })).toBeNull();
    expect(legacyExplorerRedirect({
      network: 'mainnet', contract: 'v.libre', view: 'actions', item: 'transfer',
    })).toBeNull();
    expect(legacyExplorerRedirect({
      network: 'custom', contract: 'https%3A%2F%2Fapi', view: 'x', item: 'v.libre',
    })).toBeNull();
    expect(legacyExplorerRedirect({ network: 'mainnet', contract: 'v.libre' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/utils/__tests__/explorerRedirect.test.js`
Expected: FAIL — cannot resolve `../explorerRedirect`.

- [ ] **Step 3: Write the implementation**

```js
// src/utils/explorerRedirect.js
// The explorer's canonical deep-link form is
// /explorer/:network/:contract/tables/:table/:scope — any other :view value
// is treated as a table name typed directly into the URL.
export function legacyExplorerRedirect({ network, contract, view, item, scope }) {
  if (!network || !contract || !view) return null;
  if (network === 'custom') return null;
  if (view === 'tables' || view === 'actions') return null;
  const parts = ['/explorer', network, contract, 'tables', view];
  if (item) parts.push(item);
  if (scope) parts.push(scope);
  return parts.join('/');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/__tests__/explorerRedirect.test.js`
Expected: 3 passing.

- [ ] **Step 5: Wire into LibreExplorer**

In `src/LibreExplorer.jsx`, add the import at the top with the other imports:

```js
import { legacyExplorerRedirect } from './utils/explorerRedirect';
```

Immediately after the existing `useParams`/`useNavigate` destructuring (line 9 area), add:

```js
  useEffect(() => {
    const target = legacyExplorerRedirect({
      network: urlNetwork, contract, view: urlView, item: urlItem, scope: urlScope,
    });
    if (target) navigate(target, { replace: true });
  }, [urlNetwork, contract, urlView, urlItem, urlScope, navigate]);
```

(Place it before the other effects so the rewrite wins the race; the guard returns `null` for canonical URLs so it never loops.)

- [ ] **Step 6: Verify manually**

Run: `npm run dev` in the background, then open `http://localhost:5173/explorer/mainnet/v.libre/ptxhistory/review` in a browser (or `curl` won't help — SPA — so use the dev server + browser tooling). Confirm the URL rewrites to `/explorer/mainnet/v.libre/tables/ptxhistory/review` and the review rows render. Also confirm the canonical URL still works unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/utils/explorerRedirect.js src/utils/__tests__/explorerRedirect.test.js src/LibreExplorer.jsx
git commit -m "feat(explorer): redirect legacy table URLs missing the tables segment"
```

---

### Task 4: BridgeStatus page, routes, and nav

**Files:**
- Create: `src/BridgeStatus.jsx`
- Modify: `src/App.jsx` (import + routes)
- Modify: `src/components/Layout.jsx` (nav item after the existing Bridge link at `src/components/Layout.jsx:27`)

**Interfaces:**
- Consumes: `API_ENDPOINTS`, `PEGOUT_TABLE`, `PEGIN_TABLE`, `fetchBridgeTable` from `./utils/bridgeStatus`; `fetchOpenProposals`, `matchProposalsToRows` from `./utils/bridgeStatusMsig`.
- Produces: default-export React component `BridgeStatus` reading route params `:network` (`mainnet`|`testnet`) and `:tab` (`review`|`pegouts`|`pegins`).

No unit test for this task — the repo has no component-test setup (node vitest environment, no testing-library). Verification is lint + build + browser check (Step 3). All logic worth unit-testing already lives in Tasks 1–3.

- [ ] **Step 1: Write the page component**

```jsx
// src/BridgeStatus.jsx
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Nav, Table, Badge, Alert, Form, Spinner } from 'react-bootstrap';
import {
  API_ENDPOINTS, BRIDGE_CONTRACTS, PEGOUT_TABLE, PEGIN_TABLE, fetchBridgeTable,
} from './utils/bridgeStatus';
import { fetchOpenProposals, matchProposalsToRows } from './utils/bridgeStatusMsig';

const TABS = ['review', 'pegouts', 'pegins'];
const ZERO_HASH = /^0+$/;

const rowHash = (row) => row.btc_hash || row.eth_tx_hash || row.tx_hash || '';

function HashCell({ hash, contract, network }) {
  if (!hash || ZERO_HASH.test(hash.replace(/^0x/, ''))) return <span className="text-muted">—</span>;
  const short = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  if (network !== 'mainnet') return <code>{short}</code>;
  const href = contract === 't.libre'
    ? `https://etherscan.io/tx/${hash.startsWith('0x') ? hash : `0x${hash}`}`
    : `https://mempool.space/tx/${hash}`;
  return <a href={href} target="_blank" rel="noopener noreferrer"><code>{short}</code></a>;
}

function MsigBadge({ match }) {
  if (!match) return <Badge bg="secondary">no proposal yet</Badge>;
  const { proposal, level } = match;
  return (
    <a href="/multisig" className="text-decoration-none">
      <Badge bg={level === 'exact' ? 'success' : 'info'}>
        {proposal.proposalName} ({proposal.provided}/{proposal.provided + proposal.requested})
        {level === 'contract' ? ' ?' : ''}
      </Badge>
    </a>
  );
}

export default function BridgeStatus() {
  const { network: urlNetwork, tab: urlTab } = useParams();
  const navigate = useNavigate();
  const network = urlNetwork === 'testnet' ? 'testnet' : 'mainnet';
  const tab = TABS.includes(urlTab) ? urlTab : 'review';

  const [pegouts, setPegouts] = useState({ rows: [], errors: {} });
  const [pegins, setPegins] = useState({ rows: [], errors: {} });
  const [msigMatches, setMsigMatches] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [contractFilter, setContractFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const endpoint = API_ENDPOINTS[network];
    const [outs, ins] = await Promise.all([
      fetchBridgeTable(endpoint, PEGOUT_TABLE),
      fetchBridgeTable(endpoint, PEGIN_TABLE),
    ]);
    setPegouts(outs);
    setPegins(ins);
    setLoading(false);
    // Msig matching is best-effort and slower; never blocks row rendering.
    const reviewRows = outs.rows.filter((r) => r.scope === 'review');
    if (reviewRows.length > 0) {
      try {
        const proposals = await fetchOpenProposals(endpoint);
        setMsigMatches(matchProposalsToRows(proposals, reviewRows));
      } catch {
        setMsigMatches(new Map());
      }
    } else {
      setMsigMatches(new Map());
    }
  }, [network]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { navigate(`/bridge-status/${network}/${tab}`, { replace: true }); }, [network, tab, navigate]);

  const reviewRows = pegouts.rows
    .filter((r) => r.scope === 'review')
    .sort((a, b) => a.contract.localeCompare(b.contract) || b.id - a.id);
  const filterRows = (rows) => rows
    .filter((r) => contractFilter === 'all' || r.contract === contractFilter)
    .filter((r) => statusFilter === 'all' || r.scope === statusFilter)
    .sort((a, b) => b.id - a.id);

  const activeErrors = tab === 'pegins' ? pegins.errors : pegouts.errors;

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Bridge Status</h2>
        <Form.Select
          style={{ width: 'auto' }}
          value={network}
          onChange={(e) => navigate(`/bridge-status/${e.target.value}/${tab}`)}
        >
          <option value="mainnet">Mainnet</option>
          <option value="testnet">Testnet</option>
        </Form.Select>
      </div>

      <Nav variant="tabs" activeKey={tab} className="mb-3"
        onSelect={(k) => navigate(`/bridge-status/${network}/${k}`)}>
        <Nav.Item>
          <Nav.Link eventKey="review">
            Review{' '}
            <Badge bg={reviewRows.length > 0 ? 'warning' : 'secondary'} text={reviewRows.length > 0 ? 'dark' : undefined}>
              {reviewRows.length}
            </Badge>
          </Nav.Link>
        </Nav.Item>
        <Nav.Item><Nav.Link eventKey="pegouts">Peg-outs</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="pegins">Peg-ins</Nav.Link></Nav.Item>
      </Nav>

      {Object.entries(activeErrors).map(([contract, message]) => (
        <Alert key={contract} variant="danger" className="py-2">
          {contract}: {message}
        </Alert>
      ))}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : tab === 'review' ? (
        <>
          <p className="text-muted">
            Peg-outs awaiting multisig approval. Verify each is legitimate, then approve via{' '}
            <a href="/multisig">Multisig</a>.
          </p>
          <Table striped hover responsive size="sm">
            <thead>
              <tr>
                <th>Contract</th><th>ID</th><th>From</th><th>To</th><th>Quantity</th><th>Msig proposal</th>
              </tr>
            </thead>
            <tbody>
              {reviewRows.map((row) => (
                <tr key={`${row.contract}:${row.id}`} className="table-warning">
                  <td>{row.contract}</td>
                  <td>{row.id}</td>
                  <td>{row.from}</td>
                  <td><code>{row.to}</code></td>
                  <td>{row.quantity}</td>
                  <td><MsigBadge match={msigMatches.get(`${row.contract}:${row.id}`)} /></td>
                </tr>
              ))}
              {reviewRows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted">Nothing awaiting review</td></tr>
              )}
            </tbody>
          </Table>
        </>
      ) : (
        <>
          <div className="d-flex gap-2 mb-3">
            <Form.Select style={{ width: 'auto' }} value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}>
              <option value="all">All contracts</option>
              {BRIDGE_CONTRACTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Form.Select>
            {tab === 'pegouts' && (
              <Form.Select style={{ width: 'auto' }} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="review">review</option>
                <option value="completed">completed</option>
                <option value="canceled">canceled</option>
              </Form.Select>
            )}
          </div>
          <Table striped hover responsive size="sm">
            <thead>
              <tr>
                <th>Contract</th><th>Status</th><th>ID</th>
                {tab === 'pegouts' && <th>From</th>}
                <th>To</th><th>Quantity</th><th>Net</th><th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {filterRows(tab === 'pegouts' ? pegouts.rows : pegins.rows).map((row) => (
                <tr key={`${row.contract}:${row.scope}:${row.id}`}
                  className={row.scope === 'review' ? 'table-warning' : undefined}>
                  <td>{row.contract}</td>
                  <td>
                    <Badge bg={{ review: 'warning', completed: 'success', canceled: 'secondary', confirmed: 'success' }[row.scope] || 'light'}
                      text={row.scope === 'review' ? 'dark' : undefined}>
                      {row.scope}
                    </Badge>
                  </td>
                  <td>{row.id}</td>
                  {tab === 'pegouts' && <td>{row.from}</td>}
                  <td><code>{row.to}</code></td>
                  <td>{row.quantity}</td>
                  <td>{row.net_amount}</td>
                  <td><HashCell hash={rowHash(row)} contract={row.contract} network={network} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Container>
  );
}
```

- [ ] **Step 2: Add routes and nav**

`src/App.jsx` — add the import next to the other page imports:

```js
import BridgeStatus from './BridgeStatus';
```

Add routes after the `/bridge-tracker` line (`src/App.jsx:31`):

```jsx
                <Route path="/bridge-status" element={<Navigate to="/bridge-status/mainnet/review" replace />} />
                <Route path="/bridge-status/:network" element={<BridgeStatus />} />
                <Route path="/bridge-status/:network/:tab" element={<BridgeStatus />} />
```

`src/components/Layout.jsx` — after the Bridge nav link (line 27):

```jsx
              <Nav.Link as={Link} to="/bridge-status" className="fs-6">Bridge Status</Nav.Link>
```

- [ ] **Step 3: Verify lint, build, and browser**

Run: `npm run lint && npm run build`
Expected: both pass (fix any lint findings — e.g. missing PropTypes on `HashCell`/`MsigBadge`; add PropTypes declarations matching the repo's pattern in `NetworkSelector.jsx` if the `react/prop-types` rule fires).

Then `npm run dev` in the background and check in a browser:
- `http://localhost:5173/bridge-status` → redirects to `/bridge-status/mainnet/review`, shows review rows from x.libre (14 on chain as of 2026-08-10) and v.libre (4) highlighted, count badge correct, msig badges render (or "no proposal yet").
- Peg-outs tab: filters work; completed rows link hashes to mempool.space / etherscan.
- Peg-ins tab: confirmed rows for all three contracts.
- Testnet toggle: page reloads data, URL updates to `/bridge-status/testnet/...`.
- Nav "Bridge Status" link present and working.

- [ ] **Step 4: Commit**

```bash
git add src/BridgeStatus.jsx src/App.jsx src/components/Layout.jsx
git commit -m "feat(bridge-status): cross-contract bridge status page with msig review view"
```

---

### Task 5: Final verification

- [ ] **Step 1: Full test suite, lint, build**

Run: `npx vitest run && npm run lint && npm run build`
Expected: all tests pass (new + pre-existing rekey tests), no lint errors, build succeeds.

- [ ] **Step 2: End-to-end browser pass**

With `npm run dev` running, walk every deep link once:
- `/bridge-status/mainnet/review`, `/bridge-status/mainnet/pegouts`, `/bridge-status/mainnet/pegins`
- `/bridge-status/testnet/review`
- `/explorer/mainnet/v.libre/ptxhistory/review` (redirect) and `/explorer/mainnet/v.libre/tables/ptxhistory/review` (canonical)

Confirm no console errors beyond pre-existing ones.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "fix(bridge-status): post-verification fixes"
```

(Skip if nothing changed.)
