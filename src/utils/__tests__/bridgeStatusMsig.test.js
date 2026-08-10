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
          return {
            rows: [
              { code: 'eosio.msig', scope: 'benobi', table: 'proposal' },
              { code: 'eosio.msig', scope: 'benobi', table: 'approvals2' },
            ],
            more: '',
          };
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
