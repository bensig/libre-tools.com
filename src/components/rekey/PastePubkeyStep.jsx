import { useState } from "react";
import { Card, Form, Button, Alert } from "react-bootstrap";
import { canonicalPubKey } from "../../rekey/seedBundle";

// Path B: the new key was generated elsewhere (Anchor, hardware wallet, etc). We
// never see a private key or mnemonic here -- only the pasted public key, validated
// via canonicalPubKey (throws on malformed input).
export default function PastePubkeyStep({ onSet, onBack }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(null);

  const handleContinue = () => {
    try {
      const canon = canonicalPubKey(input.trim());
      setError(null);
      onSet(canon);
    } catch {
      setError(
        "That doesn't look like a valid Libre public key. Double-check you copied it correctly."
      );
    }
  };

  return (
    <Card>
      <Card.Body>
        <Card.Title>Step 4: Paste your new public key</Card.Title>
        <Alert variant="warning">
          Paste the <strong>public</strong> key only (starts with <code>PUB_K1_</code>) from
          Anchor or another wallet where you&apos;ve already generated a new key pair. Never
          paste a private key or recovery phrase here.
        </Alert>
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
