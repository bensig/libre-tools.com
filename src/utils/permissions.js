// src/utils/permissions.js

/** A link is {account, action}; `action` is optional on chain for a contract-wide link. */
export function normalizeLink(link) {
  return { account: link.account, action: link.action ?? "" };
}

export function linkId(link) {
  const n = normalizeLink(link);
  return `${n.account}::${n.action}`;
}

/** What must be linked and unlinked to move from `current` to `desired`. */
export function diffLinks(current = [], desired = []) {
  const cur = new Map(current.map((l) => [linkId(l), normalizeLink(l)]));
  const des = new Map(desired.map((l) => [linkId(l), normalizeLink(l)]));
  const add = [...des.entries()].filter(([id]) => !cur.has(id)).map(([, l]) => l);
  const remove = [...cur.entries()].filter(([id]) => !des.has(id)).map(([, l]) => l);
  return { add, remove };
}
