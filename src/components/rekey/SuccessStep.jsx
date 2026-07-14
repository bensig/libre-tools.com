import { Card, Alert, ListGroup } from "react-bootstrap";

const EXPLORER_BASE = {
  mainnet: "https://www.libreblocks.io",
  testnet: "https://testnet.libreblocks.io",
};

// Same Bitcoin Libre mobile app link used elsewhere in this app (LibreExplorer.jsx).
const BITCOIN_LIBRE_APP_URL = "https://bitcoinlibre.io/";

export default function SuccessStep({ account, newPubKey, txids, network }) {
  const explorerBase = EXPLORER_BASE[network] || EXPLORER_BASE.mainnet;

  return (
    <Card>
      <Card.Body>
        <Card.Title>Your account has been re-keyed</Card.Title>
        <Alert variant="success">
          Both the <strong>owner</strong> and <strong>active</strong> permissions on{" "}
          <strong>{account}</strong> now point to your new key:
          <div className="mt-2">
            <code className="user-select-all">{newPubKey}</code>
          </div>
        </Alert>

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
