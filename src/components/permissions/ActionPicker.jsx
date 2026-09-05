import { useState } from "react";
import { Alert, Button, Form, Spinner } from "react-bootstrap";
import { fetchContractActions } from "../../utils/abi";
import { linkId, normalizeLink } from "../../utils/permissions";

export default function ActionPicker({ apiUrl, selected = [], onChange }) {
  const [contract, setContract] = useState("");
  const [actions, setActions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState(false);
  const [manualAction, setManualAction] = useState("");

  const load = async () => {
    setLoading(true);
    setError(null);
    setActions(null);
    setManual(false);
    try {
      setActions(await fetchContractActions(apiUrl, contract.trim()));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const has = (link) => selected.some((s) => linkId(s) === linkId(link));
  const toggle = (link) => {
    const l = normalizeLink(link);
    onChange(has(l) ? selected.filter((s) => linkId(s) !== linkId(l)) : [...selected, l]);
  };

  return (
    <div>
      <Form.Label>Add actions from a contract</Form.Label>
      <div className="d-flex gap-2 mb-2">
        <Form.Control
          value={contract}
          onChange={(e) => setContract(e.target.value.trim().toLowerCase())}
          placeholder="dex.libre, loan, or your own contract"
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), load())}
        />
        <Button variant="outline-primary" onClick={load} disabled={!contract || loading}>
          {loading ? <Spinner size="sm" animation="border" /> : "Load"}
        </Button>
      </div>

      {error && (
        <Alert variant="warning" className="py-2">
          <div className="small">{error}</div>
          {!manual && (
            <Button size="sm" variant="link" className="p-0" onClick={() => setManual(true)}>
              Enter an action name manually
            </Button>
          )}
        </Alert>
      )}

      {manual && (
        <div className="d-flex gap-2 mb-2">
          <Form.Control
            value={manualAction}
            onChange={(e) => setManualAction(e.target.value.trim().toLowerCase())}
            placeholder="action name"
          />
          <Button
            variant="outline-secondary"
            disabled={!manualAction}
            onClick={() => {
              toggle({ account: contract, action: manualAction });
              setManualAction("");
            }}
          >
            Add unverified
          </Button>
        </div>
      )}

      {actions && (
        <div className="border rounded p-2" style={{ maxHeight: "14rem", overflowY: "auto" }}>
          {actions.map((action) => {
            const link = { account: contract, action };
            return (
              <Form.Check
                key={action}
                type="checkbox"
                id={`act-${contract}-${action}`}
                label={<code>{`${contract}::${action}`}</code>}
                checked={has(link)}
                onChange={() => toggle(link)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
