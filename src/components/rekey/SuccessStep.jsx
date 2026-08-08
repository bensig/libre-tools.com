import { useState, useEffect } from "react";
import { Card, Alert, ListGroup, Button, Spinner } from "react-bootstrap";
import { getAccountKeys } from "../../rekey/accountKeys";
import { rotationStatus } from "../../rekey/rotationState";

const EXPLORER_BASE = {
  mainnet: "https://www.libreblocks.io",
  testnet: "https://testnet.libreblocks.io",
};

// Same Bitcoin Libre mobile app link used elsewhere in this app (LibreExplorer.jsx).
const BITCOIN_LIBRE_APP_URL = "https://bitcoinlibre.io/";

export default function SuccessStep({
  account,
  newPubKey,
  txids,
  network,
  apiUrl,
  onFinishOwner,
}) {
  const explorerBase = EXPLORER_BASE[network] || EXPLORER_BASE.mainnet;
  const [status, setStatus] = useState("checking"); // checking | confirmed | owner-missing | incomplete

  const classify = async () => {
    try {
      const keys = await getAccountKeys(apiUrl, account);
      return rotationStatus(keys, newPubKey);
    } catch {
      return "incomplete";
    }
  };

  const manualCheck = async () => {
    setStatus("checking");
    setStatus(await classify());
  };

  // Auto-poll on mount: nodes behind the load balancer reflect a just-applied
  // block at slightly different times, so a single immediate read can miss it.
  // Only "incomplete" is worth retrying -- "confirmed" and "owner-missing" are
  // both terminal (owner-missing will not self-resolve).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 8 && !cancelled; i++) {
        const result = await classify();
        if (result !== "incomplete") {
          if (!cancelled) setStatus(result);
          return;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setStatus("incomplete");
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, account, newPubKey]);

  return (
    <Card className="rekey-card">
      <Card.Body>
        <Card.Title>
          {status === "confirmed" ? "Your account keys have been changed" : "Finishing your key rotation"}
        </Card.Title>

        {status === "confirmed" && (
          <Alert variant="success">
            <i className="bi bi-check-circle-fill" aria-hidden="true"></i>{" "}
            <strong>Confirmed on-chain.</strong> Both the <strong>owner</strong> and{" "}
            <strong>active</strong> permissions on <strong>{account}</strong> now use your new key:
            <div className="mt-2">
              <code className="user-select-all">{newPubKey}</code>
            </div>
          </Alert>
        )}

        {status === "checking" && (
          <Alert variant="info" className="d-flex align-items-center gap-2">
            <Spinner size="sm" /> Confirming the change on-chain…
          </Alert>
        )}

        {status === "incomplete" && (
          <Alert variant="warning">
            <strong>Your transaction was submitted.</strong> The change hasn&apos;t appeared on a
            queried node yet — this is normal load-balancer lag and almost always resolves within a
            few seconds. Your account is being re-keyed to:
            <div className="my-2">
              <code className="user-select-all">{newPubKey}</code>
            </div>
            <Button variant="outline-primary" size="sm" onClick={manualCheck}>
              Check on-chain again
            </Button>
          </Alert>
        )}

        {status === "owner-missing" && (
          <Alert variant="danger">
            <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>{" "}
            <strong>Owner NOT rotated — your account is only half-secured.</strong> Your{" "}
            <strong>active</strong> key was changed, but <strong>owner</strong> still holds the
            OLD key. Anyone who has the old owner key can reset your account. You must finish
            rotating owner.
            <div className="mt-2">
              <Button variant="danger" size="sm" onClick={onFinishOwner}>
                Finish owner rotation
              </Button>
            </div>
            {/* Task 0 = Candidate 2 ONLY — append: */}
            {/* <div className="small mt-2">Bitcoin Libre Wallet cannot sign an owner change.
                Finish this step in <strong>Anchor</strong> using your OLD private key (WIF).</div> */}
          </Alert>
        )}

        {txids.length > 0 && (
          <div className="mb-3">
            <div className="fw-bold mb-1">Transactions</div>
            <ListGroup>
              {txids.map((txid) => (
                <ListGroup.Item key={txid}>
                  <a href={`${explorerBase}/tx/${txid}`} target="_blank" rel="noopener noreferrer">
                    {txid}
                  </a>
                </ListGroup.Item>
              ))}
            </ListGroup>
          </div>
        )}

        <Alert variant="danger">
          <strong>Update your wallet app now.</strong> Your account is controlled by the{" "}
          <strong>new</strong> key. Your wallet still has the <strong>old</strong> one, so it can no
          longer sign for this account until you import the new key you saved at the generate step:
          <ul className="mb-1 mt-1">
            <li>
              <strong>Bitcoin Libre app</strong> — import the new <strong>12-word phrase</strong>.
            </li>
            <li>
              <strong>Anchor</strong> — import the new <strong>private key (WIF)</strong> (Anchor
              doesn&apos;t accept phrases): Manage Wallets → Import Private Key → paste the WIF.
            </li>
          </ul>
          Remove the old wallet once you&apos;ve confirmed the new one signs.
        </Alert>

        <Alert variant="warning">
          <strong>This only secures your Libre account -- not native Bitcoin.</strong> This web
          tool never has access to your wallet&apos;s seed and cannot move Bitcoin held in
          self-custody from this wallet. If you held Bitcoin from this account, open the{" "}
          <strong>Bitcoin Libre</strong> mobile app and move it from there -- this tool cannot.
          <div className="mt-2">
            <a href={BITCOIN_LIBRE_APP_URL} target="_blank" rel="noopener noreferrer">
              Get the Bitcoin Libre app
            </a>
          </div>
        </Alert>
      </Card.Body>
    </Card>
  );
}
