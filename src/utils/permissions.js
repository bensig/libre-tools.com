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

/** Writing these is permanently out of scope: a bad updateauth on them is unrecoverable. */
export const RESERVED_PERMISSIONS = new Set(["owner", "active"]);

const NAME_RE = /^[a-z1-5.]+$/;

export function validatePermissionName(name) {
  if (!name) throw new Error("A permission name is required");
  if (RESERVED_PERMISSIONS.has(name))
    throw new Error(
      `"${name}" is reserved — this tool only creates child permissions. Use /rekey to change owner or active keys.`
    );
  if (name.length > 12) throw new Error("A permission name is at most 12 characters");
  if (!NAME_RE.test(name))
    throw new Error("A permission name may contain only a-z, 1-5 and . characters");
  return name;
}
