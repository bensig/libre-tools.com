import { useState, useEffect, useCallback } from "react";
import { Form, Button, Alert, Spinner, Card } from "react-bootstrap";
import { getAccountKeys } from "../../rekey/accountKeys";
import { fetchAffectedSet, isAffected } from "../../rekey/affectedSet";

// Step 1: look up the account's current owner/active keys and show them. Anyone may
// re-key any account they control -- this step does NOT gate on the affected-set.
// `getAccountKeys` still throws (and blocks Continue) for multisig/complex auth,
// since this wizard's single-key updateauth flow can't handle those accounts.
//
// The affected-set check is kept as a best-effort, non-blocking informational note
// only (it never prevents Continue, and a failed fetch is silently ignored).
export default function DetectStep({ apiUrl, affectedSetUrl, initialAccount, onContinue }) {
  const [account, setAccount] = useState(initialAccount || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { currentKeys, affected: true|false|null }

  const runDetect = useCallback(
    async (e) => {
      e?.preventDefault?.();
      if (!account) return;
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const currentKeys = await getAccountKeys(apiUrl, account);
        let affected = null;
        try {
          const set = await fetchAffectedSet(affectedSetUrl);
          affected = await isAffected(currentKeys.active, set);
        } catch {
          // Informational only -- ignore fetch/format failures, do not block progress.
        }
        setResult({ currentKeys, affected });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    },
    [account, apiUrl, affectedSetUrl]
  );

  useEffect(() => {
    if (initialAccount) {
      runDetect();
    }
    // Only run once on mount for the ?account= prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Card>
      <Card.Body>
        <Card.Title>Step 1: Look up your account</Card.Title>
        <p>
          Enter the Libre account you want to rotate to a new key. This works for any
          single-key account you control.
        </p>
        <Form onSubmit={runDetect}>
          <Form.Group className="mb-3" style={{ maxWidth: 320 }}>
            <Form.Label>Account name</Form.Label>
            <Form.Control
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value.toLowerCase())}
              placeholder="youraccount"
              autoComplete="off"
            />
          </Form.Group>
          <Button type="submit" variant="primary" disabled={loading || !account}>
            {loading ? <Spinner size="sm" /> : "Look up account"}
          </Button>
        </Form>

        {error && (
          <Alert variant="danger" className="mt-3">
            {error}
          </Alert>
        )}

        {result && (
          <div className="mt-3">
            {result.affected === true && (
              <Alert variant="info">
                Note: this account&apos;s active key matches a known weak (Ill-Bloom-affected)
                key -- rotating it is strongly recommended.
              </Alert>
            )}

            <div className="small text-muted mb-3">
              <div>
                Current owner key: <code>{result.currentKeys.owner}</code>
              </div>
              <div>
                Current active key: <code>{result.currentKeys.active}</code>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={() => onContinue(account, result.currentKeys, result.affected)}
            >
              Continue: rotate this account&apos;s keys
            </Button>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
