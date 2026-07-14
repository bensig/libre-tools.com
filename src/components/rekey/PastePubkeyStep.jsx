import { useState } from "react";
import { Card, Form, Button, Alert } from "react-bootstrap";
import { canonicalPubKey } from "../../rekey/seedBundle";

// Path B: the new key was generated elsewhere (Anchor, hardware wallet, etc). We
// never see a private key or mnemonic here -- only the pasted public key, validated
// via canonicalPubKey (throws on malformed input).
export default function PastePubkeyStep({ onSet, onBack, currentKeys }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(null);

  const handleContinue = () => {
    let canon;
    try {
      canon = canonicalPubKey(input.trim());
    } catch {
      setError(
        "That doesn't look like a valid Libre public key. Double-check you copied it correctly."
      );
      return;
    }
    // Guard: rotating to the CURRENT key would leave the account on the same
    // (weak) key while appearing 'secured'. currentKeys are already canonical.
    if (currentKeys && (canon === currentKeys.owner || canon === currentKeys.active)) {
      setError(
        "That is the account's current key. You must rotate to a DIFFERENT, newly generated key — otherwise nothing changes and the account stays exposed."
      );
      return;
    }
    setError(null);
    onSet(canon);
  };

  return (
    <Card className="rekey-card">
      <Card.Body>
        <Card.Title>Step 4: Paste your new public key</Card.Title>
        <Alert variant="warning">
          Paste the <strong>public</strong> key only (either <code>PUB_K1_…</code> or the
          legacy <code>EOS…</code> form is fine) from Anchor or another wallet where
          you&apos;ve already generated a new key pair. Never paste a private key or recovery
          phrase here.
        </Alert>
        <p className="text-muted" style={{ fontSize: "0.9rem" }}>
          Don&apos;t have a new key yet? Generate one in{" "}
          <a href="/seed-generator" target="_blank" rel="noopener noreferrer">the Seed Generator</a>{" "}
          (or in Anchor), then copy its public key here.
        </p>
        <Form.Group className="mb-3" style={{ maxWidth: 480 }}>
          <Form.Label>New public key</Form.Label>
          <Form.Control
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="PUB_K1_..."
            autoComplete="off"
          />
        </Form.Group>
        {error && <Alert variant="danger">{error}</Alert>}
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" onClick={onBack}>
            Back
          </Button>
          <Button variant="primary" disabled={!input.trim()} onClick={handleContinue}>
            Continue
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}
