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
