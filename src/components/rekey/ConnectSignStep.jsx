import { useState, useRef } from "react";
import { Card, Button, Alert, Spinner, Modal } from "react-bootstrap";
import { createSessionKit } from "../../utils/session";
import { getAccountKeys } from "../../rekey/accountKeys";
import {
  executeRekeyOneTx,
  executeRekeyActiveThenChallenge,
  executeRekeyOwner,
} from "../../rekey/executor";
import { authBlock } from "../../rekey/rekeyActions";

// Wallet choice buttons, mirroring LibreExplorer.jsx's "Select Wallet" modal
// (walletPlugin ids "bitcoin-libre" / "anchor").
function WalletChoiceModal({ show, onHide, onChoose, busy }) {
  return (
    <Modal show={show} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title>Select Wallet</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="d-grid gap-2">
          <Button variant="outline-primary" onClick={() => onChoose("bitcoin-libre")} disabled={busy}>
            <i className="bi bi-wallet2 me-2"></i>
            Bitcoin Libre Wallet
          </Button>
          <Button variant="outline-primary" onClick={() => onChoose("anchor")} disabled={busy}>
            <i className="bi bi-wallet2 me-2"></i>
            Anchor Wallet
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}

// Step 5: connect the wallet and sign the rekey transaction(s).
//
// Path A: one transaction (executeRekeyOneTx) rotates both active + owner.
//
// Path B: rotate active only (executeRekeyActiveThenChallenge), then require the user
// to prove control of the NEW key with a challenge transaction, THEN rotate owner
// (executeRekeyOwner). This order protects against a typo'd pubkey permanently
// locking the account out of owner.
export default function ConnectSignStep({ apiUrl, chainId, account, path, newPubKey, onSuccess }) {
  const [session, setSession] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | connecting | connected | signing | awaiting-challenge | challenging | verifying
  const [error, setError] = useState(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [txids, setTxids] = useState([]);
  const txidsRef = useRef([]);

  const addTxid = (txid) => {
    txidsRef.current = [...txidsRef.current, txid];
    setTxids(txidsRef.current);
  };

  const login = async (walletPlugin) => {
    setError(null);
    setPhase("connecting");
    try {
      const sessionKit = createSessionKit({ chainId, apiUrl });
      const { session: newSession } = await sessionKit.login({ walletPlugin });
      if (newSession.actor.toString() !== account) {
        throw new Error(
          `Connected wallet account (${newSession.actor.toString()}) does not match the account being rotated (${account}). Log in with the correct account.`
        );
      }
      setSession(newSession);
      setShowWalletModal(false);
      setPhase("connected");
    } catch (err) {
      setError(err.message);
      setShowWalletModal(false);
      setPhase("idle");
    }
  };

  // Poll get_account until the expected key shows on the requested permissions,
  // or give up after ~20s. NEVER throws on read lag (load-balanced nodes reflect a
  // just-applied block at slightly different times); returns true/false.
  const pollVerify = async (expectedPubKey, { owner = true, active = true } = {}, attempts = 10, delayMs = 2000) => {
    for (let i = 0; i < attempts; i++) {
      try {
        const keys = await getAccountKeys(apiUrl, account);
        const ownerOk = !owner || keys.owner === expectedPubKey;
        const activeOk = !active || keys.active === expectedPubKey;
        if (ownerOk && activeOk) return true;
      } catch {
        /* transient read error -- keep polling */
      }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  };

  const runPathA = async () => {
    setPhase("signing");
    setError(null);
    try {
      const { txid } = await executeRekeyOneTx(session, account, newPubKey);
      addTxid(txid);
      // The tx was accepted -> the rotation is on-chain. Advance to the result
      // screen immediately; it verifies on-chain itself (with retries + a manual
      // re-check). We must NOT bounce back to the sign step on read lag, or the
      // user may re-sign an already-rotated account.
      onSuccess({ session, txids: txidsRef.current });
    } catch (err) {
      setError(err.message);
      setPhase("connected");
    }
  };

  const runPathBStep1 = async () => {
    setPhase("signing");
    setError(null);
    try {
      const { txid } = await executeRekeyActiveThenChallenge(session, account, newPubKey);
      addTxid(txid);
      setPhase("verifying");
      // The challenge step signs AS the new active key, so active MUST reflect the
      // new key before we continue. Poll (don't single-read); if it never confirms,
      // let the user retry the check rather than re-signing.
      const ok = await pollVerify(newPubKey, { owner: false, active: true });
      if (!ok) {
        throw new Error(
          "The active permission hasn't shown the new key yet (network lag). Wait a few seconds and press Continue again -- do NOT re-sign from the start."
        );
      }
      setPhase("awaiting-challenge");
    } catch (err) {
      setError(err.message);
      setPhase("connected");
    }
  };

  // Challenge: prove the connected wallet actually controls the NEW key that now sits
  // on `active`, before we burn `owner` on it.
  //
  // UNVERIFIED ON LIVE CHAIN (same caveat as src/rekey/executor.js): this requires the
  // user to RECONNECT their wallet -- by now their wallet app (Anchor / Bitcoin Libre)
  // must already have the NEW key imported/selected for this account, since the OLD
  // key no longer satisfies `active`. A human must verify this reconnect-and-resign
  // flow against a real wallet on testnet before this path ships.
  //
  // The challenge itself is a no-op `eosio::updateauth` that re-affirms the current
  // `active` auth (same key, same threshold) but is authorized by `account@active`
  // itself (not `owner`) -- eosio permits a permission to authorize updates to
  // itself, so a successful signature here proves the connected wallet currently
  // controls `active`, i.e. holds `newPubKey`. We do NOT reuse `updateauthAction`
  // from rekeyActions.js here because that helper hardcodes `owner` authorization;
  // the whole point of the challenge is to sign with `active` instead.
  const runChallengeThenOwner = async (walletPlugin) => {
    setError(null);
    setPhase("challenging");
    try {
      const sessionKit = createSessionKit({ chainId, apiUrl });
      const { session: challengeSession } = await sessionKit.login({ walletPlugin });
      if (challengeSession.actor.toString() !== account) {
        throw new Error(
          `Reconnected wallet account (${challengeSession.actor.toString()}) does not match ${account}. Make sure your wallet is set to sign as ${account} with the NEW key.`
        );
      }
      setShowChallengeModal(false);

      const challengeAction = {
        account: "eosio",
        name: "updateauth",
        authorization: [{ actor: account, permission: "active" }],
        data: { account, permission: "active", parent: "owner", auth: authBlock(newPubKey) },
      };
      const challengeResult = await challengeSession.transact({ actions: [challengeAction] });
      const challengeTxid = String(
        challengeResult.resolved?.transaction?.id ?? challengeResult.response?.transaction_id
      );
      addTxid(challengeTxid);

      // Owner is still controlled by the ORIGINAL session (old key) at this point --
      // only active was rotated so far. Use `session`, not `challengeSession`.
      setPhase("signing");
      const { txid: ownerTxid } = await executeRekeyOwner(session, account, newPubKey);
      addTxid(ownerTxid);
      // Both perms submitted -> advance to the result screen, which verifies on-chain.
      onSuccess({ session, txids: txidsRef.current });
    } catch (err) {
      setError(err.message);
      setPhase("awaiting-challenge");
    }
  };

  const busy = ["connecting", "signing", "challenging", "verifying"].includes(phase);

  return (
    <Card className="rekey-card">
      <Card.Body>
        <Card.Title>Step 5: Connect your wallet and sign</Card.Title>

        {error && (
          <Alert variant="danger" className="mt-2">
            {error}
          </Alert>
        )}

        {phase === "idle" && (
          <>
            <p>
              Connect the wallet that currently controls <strong>{account}</strong> to sign the
              rotation.
            </p>
            <Button variant="primary" onClick={() => setShowWalletModal(true)}>
              Connect wallet
            </Button>
          </>
        )}

        {phase === "connecting" && (
          <div className="py-3">
            <Spinner size="sm" className="me-2" />
            Connecting...
          </div>
        )}

        {phase === "connected" && (
          <>
            <Alert variant="success">
              Connected as <strong>{session?.actor?.toString()}</strong>.
            </Alert>
            {path === "A" ? (
              <Button variant="primary" onClick={runPathA}>
                Sign: rotate owner + active
              </Button>
            ) : (
              <Button variant="primary" onClick={runPathBStep1}>
                Sign: rotate active permission
              </Button>
            )}
          </>
        )}

        {(phase === "signing" || phase === "verifying") && (
          <div className="py-3">
            <Spinner size="sm" className="me-2" />
            {phase === "signing" ? "Waiting for signature..." : "Verifying on-chain..."}
          </div>
        )}

        {phase === "awaiting-challenge" && (
          <>
            <Alert variant="warning">
              Your <strong>active</strong> permission now requires the <strong>new</strong> key
              to sign. Before continuing: make sure your wallet app (Anchor or Bitcoin Libre) is
              set up to sign as <strong>{account}</strong> using the new key -- if you generated
              it in this tool (Path A), import that recovery phrase into your wallet now. Then
              reconnect below to prove control of the new key and finish rotating owner.
            </Alert>
            <Button variant="primary" onClick={() => setShowChallengeModal(true)}>
              Reconnect with new key &amp; finish rotation
            </Button>
          </>
        )}

        {phase === "challenging" && (
          <div className="py-3">
            <Spinner size="sm" className="me-2" />
            Waiting for challenge signature...
          </div>
        )}

        {txids.length > 0 && (
          <div className="small text-muted mt-3">
            {txids.map((txid) => (
              <div key={txid}>
                tx: <code>{txid}</code>
              </div>
            ))}
          </div>
        )}

        <WalletChoiceModal
          show={showWalletModal}
          onHide={() => setShowWalletModal(false)}
          onChoose={login}
          busy={busy}
        />
        <WalletChoiceModal
          show={showChallengeModal}
          onHide={() => setShowChallengeModal(false)}
          onChoose={runChallengeThenOwner}
          busy={busy}
        />
      </Card.Body>
    </Card>
  );
}
