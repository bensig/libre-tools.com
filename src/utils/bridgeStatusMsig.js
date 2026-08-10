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
  const scopes = (scopeData.rows || [])
    .filter((r) => r.table === 'proposal')
    .map((r) => r.scope);
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
