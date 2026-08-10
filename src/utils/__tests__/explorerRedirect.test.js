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
