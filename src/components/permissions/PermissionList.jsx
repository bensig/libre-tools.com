import { useState } from "react";
import { Badge, Button, Card, Table } from "react-bootstrap";
import { groupPermissions, permissionDetail } from "../../utils/permissions";

/** Keys, threshold and any co-signers — hidden until asked for, so rows stay scannable. */
function Detail({ permission }) {
  const { threshold, keys, accounts, waits } = permissionDetail(permission);
  return (
    <div className="mt-2 p-2 bg-light rounded small">
      <div className="text-muted mb-1">
        threshold {threshold} — {keys.length} key{keys.length === 1 ? "" : "s"}
        {accounts.length ? `, ${accounts.length} delegated account(s)` : ""}
        {waits.length ? `, ${waits.length} wait(s)` : ""}
      </div>
      {/* Full key, not truncated: verifying which key a bot holds is the reason to expand. */}
      {keys.map((k) => (
        <div key={k.key} className="text-break">
          <code>{k.key}</code>
          {k.weight !== 1 && <span className="text-muted"> (weight {k.weight})</span>}
        </div>
      ))}
      {accounts.map((a) => (
        <div key={`${a.actor}@${a.permission}`}>
          <code>{`${a.actor}@${a.permission}`}</code>
          {a.weight !== 1 && <span className="text-muted"> (weight {a.weight})</span>}
        </div>
      ))}
      {waits.map((w) => (
        <div key={w.wait_sec} className="text-muted">
          wait {w.wait_sec}s (weight {w.weight})
        </div>
      ))}
    </div>
  );
}

function LinkedActions({ permission }) {
  const links = permission.linked_actions ?? [];
  if (!links.length)
    return <span className="text-muted small">No linked actions — this key can do nothing.</span>;
  return (
    <Table size="sm" className="mb-0">
      <tbody>
        {links.map((l) => (
          <tr key={`${l.account}::${l.action ?? ""}`}>
            <td>
              <code>{l.account}</code>
            </td>
            <td>
              <code>{l.action ?? "(whole contract)"}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Row({ permission, badge, note, actions, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border rounded p-3 mb-2">
      <div className="d-flex justify-content-between align-items-center">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <Button
            size="sm"
            variant="link"
            className="p-0 text-decoration-none"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details for ${permission.perm_name}`}
          >
            <span aria-hidden="true">{open ? "\u25BE" : "\u25B8"}</span>
          </Button>
          <Badge bg={badge}>{permission.perm_name}</Badge>
          <span className="text-muted small">{note}</span>
        </div>
        {actions}
      </div>
      {open && <Detail permission={permission} />}
      {children}
    </div>
  );
}

export default function PermissionList({
  permissions = [],
  onEdit,
  onRevoke,
  canSign,
  network = "mainnet",
  account,
}) {
  const { reserved, manageable, nested } = groupPermissions(permissions);

  return (
    <Card className="mb-3">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <Card.Title className="h6 mb-0">Permissions on this account</Card.Title>
          {account && (
            <a
              className="small"
              href={`/account/${network}/${account}`}
              target="_blank"
              rel="noreferrer"
            >
              View full account
            </a>
          )}
        </div>

        {reserved.map((p) => (
          <Row
            key={p.perm_name}
            permission={p}
            badge="secondary"
            note={
              <>
                Read-only here — use <a href="/rekey">/rekey</a> to change these keys.
              </>
            }
          />
        ))}

        {manageable.length === 0 && (
          <p className="text-muted small mb-0 mt-2">No child permissions yet.</p>
        )}

        {manageable.map((p) => (
          <Row
            key={p.perm_name}
            permission={p}
            badge="primary"
            note={`threshold ${p.required_auth?.threshold} · ${
              p.required_auth?.keys?.length ?? 0
            } key(s)`}
            actions={
              canSign && (
                <div className="d-flex gap-2">
                  <Button size="sm" variant="outline-primary" onClick={() => onEdit(p)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline-danger" onClick={() => onRevoke(p)}>
                    Revoke
                  </Button>
                </div>
              )
            }
          >
            <div className="mt-2">
              <LinkedActions permission={p} />
            </div>
          </Row>
        ))}

        {nested.length > 0 && (
          <>
            <div className="text-muted small mt-3 mb-2">
              Nested deeper than <code>active</code>. Shown so this list is complete; managing
              them is out of scope for this tool.
            </div>
            {nested.map((p) => (
              <Row
                key={p.perm_name}
                permission={p}
                badge="light"
                note={`nested under ${p.parent} — not managed here`}
              >
                <div className="mt-2">
                  <LinkedActions permission={p} />
                </div>
              </Row>
            ))}
          </>
        )}
      </Card.Body>
    </Card>
  );
}
