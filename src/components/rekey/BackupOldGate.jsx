import { useState } from "react";
import { Card, Form, Button, Alert } from "react-bootstrap";

// Required gate: the web tool never sees the user's CURRENT (old) recovery phrase --
// it only ever talks to public keys and a connected wallet. Until the rotation below
// fully completes and is verified on-chain, that old phrase is the only recovery path
// if a step fails partway through (this matters most for Path B, where active is
// rotated before owner). So we require an explicit confirmation before continuing.
export default function BackupOldGate({ account, network, onContinue }) {
  const [checked, setChecked] = useState(false);

  return (
    <Card className="rekey-card">
      <Card.Body>
        <Card.Title>Step 2: Before you continue</Card.Title>
        <p className="text-muted">Please read these before rotating <strong>{account}</strong>:</p>
        <ul className="rekey-precheck-list mb-3">
          <li>
            <i className="bi bi-incognito" aria-hidden="true"></i>
            <span>
              Open this page in a <strong>private / incognito window</strong> (or disable browser
              extensions) before revealing a recovery phrase — a malicious extension can read it
              off the screen.
            </span>
          </li>
          <li>
            <i className={`bi ${network === "mainnet" ? "bi-hdd-network-fill" : "bi-hdd-network"}`} aria-hidden="true"></i>
            <span>
              {network === "mainnet" ? (
                <>Network: <strong>Mainnet</strong> — this key change is real and permanent.</>
              ) : (
                <>Network: <strong>Testnet</strong> — safe to practice.</>
              )}
            </span>
          </li>
          <li>
            <i className="bi bi-key-fill" aria-hidden="true"></i>
            <span>
              You&apos;ll be given a <strong>new key</strong> to save — if you lose it, you lose
              access to the account.
            </span>
          </li>
        </ul>
        <Alert variant="warning">
          This tool cannot show or access your <strong>current (old)</strong> recovery phrase --
          it only ever sees public keys and signs transactions through your connected wallet.
          Before rotating <strong>{account}</strong>, make sure you already have that phrase
          written down somewhere safe. You can find it in the <strong>Bitcoin Libre</strong>{" "}
          mobile app or in <strong>Anchor</strong>, wherever you originally saved it.
        </Alert>
        <p>
          Until the rotation below fully completes and is verified on-chain, your old recovery
          phrase remains the only way to recover this account if a step fails partway through.
        </p>
        <Form.Check
          type="checkbox"
          id="backup-old-confirm"
          label="I have my current recovery phrase written down and stored safely."
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
          className="mb-3"
        />
        <Button variant="primary" disabled={!checked} onClick={onContinue}>
          Continue
        </Button>
      </Card.Body>
    </Card>
  );
}
