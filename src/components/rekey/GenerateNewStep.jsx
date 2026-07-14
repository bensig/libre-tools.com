import { useState } from "react";
import { Card, Alert, Button, Form } from "react-bootstrap";
import { entropyToMnemonic } from "bip39";
import { deriveLibreKeys } from "../../rekey/seedBundle";

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Path A: generate a brand-new mnemonic client-side using the Web Crypto CSPRNG
// (crypto.getRandomValues) -- NOT Math.random, which is not a secure RNG -- then
// derive the Libre key pair from it the same way seedBundle.js/deriveLibreKeys does
// for the rest of the app.
export default function GenerateNewStep({ onGenerated, onBack }) {
  const [mnemonic, setMnemonic] = useState(null);
  const [publicKey, setPublicKey] = useState(null);
  const [error, setError] = useState(null);
  const [written, setWritten] = useState(false);

  const generate = () => {
    setError(null);
    try {
      const entropy = new Uint8Array(16); // 128 bits of entropy -> 12-word mnemonic
      crypto.getRandomValues(entropy);
      const newMnemonic = entropyToMnemonic(bytesToHex(entropy));
      const { publicKey: pk } = deriveLibreKeys(newMnemonic);
      setMnemonic(newMnemonic);
      setPublicKey(pk);
      setWritten(false);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Card className="rekey-card">
      <Card.Body>
        <Card.Title>Step 4: Generate your new key</Card.Title>
        {error && <Alert variant="danger">{error}</Alert>}

        {!mnemonic ? (
          <Button variant="primary" onClick={generate}>
            Generate new recovery phrase
          </Button>
        ) : (
          <>
            <Alert variant="warning">
              <strong>Write this down now.</strong> This is your new recovery phrase -- the only
              way to recover this account after rotation. It is generated locally in your
              browser and is never sent anywhere. Anyone with access to it controls this
              account.
            </Alert>
            <div className="p-3 rekey-mnemonic-box mb-3">
              <code className="user-select-all">{mnemonic}</code>
            </div>
            <div className="small text-muted mb-3">
              New public key: <code>{publicKey}</code>
            </div>
            <Form.Check
              type="checkbox"
              id="new-mnemonic-written"
              label="I have written down this new recovery phrase and stored it safely."
              checked={written}
              onChange={(e) => setWritten(e.target.checked)}
              className="mb-3"
            />
            <div className="d-flex gap-2">
              <Button variant="outline-secondary" onClick={generate}>
                Generate a different phrase
              </Button>
              <Button
                variant="primary"
                disabled={!written}
                onClick={() => onGenerated(publicKey, mnemonic)}
              >
                Continue
              </Button>
            </div>
          </>
        )}
        <div className="mt-3">
          <Button variant="link" onClick={onBack}>
            Back
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}
