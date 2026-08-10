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
