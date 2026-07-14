import { useState } from "react";
import { Card, Alert, Button, Form } from "react-bootstrap";
import { entropyToMnemonic } from "bip39";
import { deriveLibreKeys } from "../../rekey/seedBundle";
import SecretReveal from "../SecretReveal";

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
  const [wif, setWif] = useState(null);
  const [error, setError] = useState(null);
  const [written, setWritten] = useState(false);

  const generate = () => {
    setError(null);
    try {
      const entropy = new Uint8Array(16); // 128 bits of entropy -> 12-word mnemonic (Bitcoin Libre supports 12 words)
      if (!globalThis.crypto || typeof crypto.getRandomValues !== "function") {
        throw new Error(
          "Secure random generator unavailable. Open this page over HTTPS (or localhost) and try again — do not proceed."
        );
      }
      crypto.getRandomValues(entropy);
      const newMnemonic = entropyToMnemonic(bytesToHex(entropy));
      const { publicKey: pk, wif: newWif } = deriveLibreKeys(newMnemonic);
      setMnemonic(newMnemonic);
      setPublicKey(pk);
      setWif(newWif);
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
          <>
            <Alert variant="light" className="border small">
              <i className="bi bi-shield-lock" aria-hidden="true"></i>{" "}
              <strong>How this is generated:</strong> your new 12-word phrase comes from 128 bits
              of entropy produced by your browser&apos;s secure random generator (Web Crypto
              <code> crypto.getRandomValues</code>) — never <code>Math.random</code> or any
              predictable source. It is created entirely on this device and is never transmitted.
            </Alert>
            <Button variant="primary" onClick={generate}>
              Generate new recovery phrase
            </Button>
          </>
        ) : (
          <>
            <Alert variant="warning">
              <strong>Write this down now.</strong> This is your new recovery phrase -- the only
              way to recover this account after rotation. It is generated locally in your
              browser and is never sent anywhere. Anyone with access to it controls this
              account.
            </Alert>
            <div className="mb-3">
              <SecretReveal value={mnemonic} />
            </div>

            <Alert variant="info" className="small">
              <strong>Importing this key into your wallet:</strong>
              <ul className="mb-1 mt-1">
                <li>
                  <strong>Bitcoin Libre app</strong> — import the <strong>12-word phrase</strong> above.
                </li>
                <li>
                  <strong>Anchor</strong> — Anchor does <em>not</em> accept a recovery phrase; it
                  imports a <strong>private key (WIF)</strong>. Use the private key below. In Anchor:
                  Manage Wallets → Import Account / Import Private Key → paste the WIF.
                </li>
              </ul>
            </Alert>

            <div className="small mb-2">
              <strong>Private key (WIF)</strong> — for Anchor; treat it exactly like the phrase, it
              controls the account:
              <div className="mt-1">
                <SecretReveal value={wif} />
              </div>
            </div>
            <div className="small text-muted mb-3">
              New public key (safe to share): <code style={{ wordBreak: "break-all" }}>{publicKey}</code>
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
