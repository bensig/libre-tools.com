import { Badge, Button, Card, Table } from "react-bootstrap";
import { RESERVED_PERMISSIONS } from "../../utils/permissions";

export default function PermissionList({ permissions = [], onEdit, onRevoke, canSign }) {
  const children = permissions.filter((p) => p.parent === "active");
  const reserved = permissions.filter((p) => RESERVED_PERMISSIONS.has(p.perm_name));

  return (
    <Card className="mb-3">
      <Card.Body>
        <Card.Title className="h6">Permissions on this account</Card.Title>

        {reserved.map((p) => (
          <div key={p.perm_name} className="border rounded p-2 mb-2 bg-light">
            <Badge bg="secondary" className="me-2">{p.perm_name}</Badge>
            <span className="text-muted small">
              Read-only here — use <a href="/rekey">/rekey</a> to change these keys.
            </span>
          </div>
        ))}

        {children.length === 0 && (
          <p className="text-muted small mb-0">No child permissions yet.</p>
        )}

        {children.map((p) => (
          <div key={p.perm_name} className="border rounded p-3 mb-2">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div>
                <Badge bg="primary" className="me-2">{p.perm_name}</Badge>
                <span className="text-muted small">
                  threshold {p.required_auth?.threshold} ·{" "}
                  {p.required_auth?.keys?.length ?? 0} key(s)
                </span>
              </div>
              {canSign && (
                <div className="d-flex gap-2">
                  <Button size="sm" variant="outline-primary" onClick={() => onEdit(p)}>Edit</Button>
                  <Button size="sm" variant="outline-danger" onClick={() => onRevoke(p)}>Revoke</Button>
                </div>
              )}
            </div>
            {p.linked_actions?.length ? (
              <Table size="sm" className="mb-0">
                <tbody>
                  {p.linked_actions.map((l) => (
                    <tr key={`${l.account}::${l.action ?? ""}`}>
                      <td><code>{l.account}</code></td>
                      <td><code>{l.action ?? "(whole contract)"}</code></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <span className="text-muted small">No linked actions — this key can do nothing.</span>
            )}
          </div>
        ))}
      </Card.Body>
    </Card>
  );
}
