import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Spinner } from "react-bootstrap";
import "./components/rekey/rekey.css";
import DetectStep from "./components/rekey/DetectStep";
import BackupOldGate from "./components/rekey/BackupOldGate";
import ChoosePathStep from "./components/rekey/ChoosePathStep";
import GenerateNewStep from "./components/rekey/GenerateNewStep";
import PastePubkeyStep from "./components/rekey/PastePubkeyStep";
import ConnectSignStep from "./components/rekey/ConnectSignStep";
import SuccessStep from "./components/rekey/SuccessStep";

// Same network config as LibreExplorer.jsx -- duplicated here (rather than imported)
// since this is a standalone hidden wizard page, not wired into the explorer's
// NetworkSelector/routing.
const NETWORK_ENDPOINTS = {
  mainnet: "https://lb.libre.org",
  testnet: "https://testnet.libre.org",
};

// Server-published hashed affected-set (see src/rekey/affectedSet.js). Served as a
// static JSON file from this app's own `public/` directory so this page has no extra
// backend dependency. Detection no longer GATES progress (anyone may re-key any
// single-key account they control) -- this is used only for the small optional
// informational note in DetectStep. Populate public/rekey-affected-set.json with the
// real Ill-Bloom-affected key hashes; it currently ships as an empty placeholder.
const AFFECTED_SET_URL = "/rekey-affected-set.json";

const STEPS = ["detect", "backupOld", "choosePath", "generate", "paste", "connectSign", "success"];

function Rekey() {
  const [searchParams] = useSearchParams();
  const initialAccount = (searchParams.get("account") || "").trim().toLowerCase();
  const network = (searchParams.get("network") || "mainnet").trim().toLowerCase();
  const apiUrl = NETWORK_ENDPOINTS[network] || NETWORK_ENDPOINTS.mainnet;

  const [step, setStep] = useState("detect");
  const [account, setAccount] = useState(initialAccount);
  const [currentKeys, setCurrentKeys] = useState(null);
  const [affected, setAffected] = useState(null);
  const [path, setPath] = useState(null);
  const [newPubKey, setNewPubKey] = useState(null);
  // Held per spec (client-side only, Path A) but intentionally not re-rendered
  // anywhere after GenerateNewStep -- we don't want a second on-screen copy of a
  // just-generated recovery phrase floating around the wizard's state tree render.
  const [, setNewMnemonic] = useState(null);
  const [session, setSession] = useState(null);
  const [txids, setTxids] = useState([]);
  const [chainId, setChainId] = useState(null);
  const [chainIdError, setChainIdError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setChainId(null);
    setChainIdError(null);
    fetch(`${apiUrl}/v1/chain/get_info`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setChainId(data.chain_id);
      })
      .catch((err) => {
        if (!cancelled) setChainIdError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const stepIndex = STEPS.indexOf(step);

  const handleDetected = (acct, keys, aff) => {
    setAccount(acct);
    setCurrentKeys(keys);
    setAffected(aff);
    setStep("backupOld");
  };

  const handleBackupConfirmed = () => setStep("choosePath");

  const handleChoosePath = (chosenPath) => {
    setPath(chosenPath);
    setStep(chosenPath === "A" ? "generate" : "paste");
  };

  const handleGenerated = (pubKey, mnemonic) => {
    setNewPubKey(pubKey);
    setNewMnemonic(mnemonic);
    setStep("connectSign");
  };

  const handlePasted = (pubKey) => {
    setNewPubKey(pubKey);
    setStep("connectSign");
  };

  const handleRekeySuccess = ({ session: finalSession, txids: finalTxids }) => {
    setSession(finalSession);
    setTxids(finalTxids);
    setStep("success");
  };

  return (
    <div className="rekey-page">
      <div className="rekey-header mb-4">
        <span className="rekey-badge">
          <i className="bi bi-shield-lock-fill" aria-hidden="true"></i>
          Official Libre security tool
        </span>
        <h2 className="text-3xl font-bold">Change account keys</h2>
        <p className="text-muted">
          Step {stepIndex + 1} of {STEPS.length}
          {account && step !== "detect" ? ` -- ${account}` : ""}
        </p>
        <Alert variant="light" className="rekey-precheck mt-2">
          <div className="rekey-precheck-title">
            <i className="bi bi-shield-lock-fill" aria-hidden="true"></i> Before you use this page
          </div>
          <ul className="rekey-precheck-list">
            <li>
              <i className="bi bi-lock-fill" aria-hidden="true"></i>
              <span>
                Check the address — genuine only at <strong>https://tools.libre.org/rekey</strong>{" "}
                with a valid HTTPS padlock. If it looks wrong, stop.
              </span>
            </li>
            <li>
              <i className="bi bi-incognito" aria-hidden="true"></i>
              <span>
                Open in a <strong>private / incognito window</strong> (or disable extensions) before
                revealing a recovery phrase — a malicious extension can read it off the screen.
              </span>
            </li>
            <li>
              <i className={`bi ${network === "mainnet" ? "bi-hdd-network-fill" : "bi-hdd-network"}`} aria-hidden="true"></i>
              <span>
                {network === "mainnet" ? (
                  <>
                    Network: <strong>Mainnet</strong> — key changes are real and permanent.
                  </>
                ) : (
                  <>
                    Network: <strong>Testnet</strong> — safe to practice.
                  </>
                )}
              </span>
            </li>
            <li>
              <i className="bi bi-key-fill" aria-hidden="true"></i>
              <span>Save your new key — if you lose it, you lose access to the account.</span>
            </li>
          </ul>
        </Alert>
        <div className="rekey-progress-track">
          <div
            className="rekey-progress-fill"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        {currentKeys && step !== "detect" && step !== "success" && (
          <p className="small rekey-orig-key mt-2">
            Original active key: <code>{currentKeys.active}</code>
          </p>
        )}
      </div>

      {chainIdError && (
        <Alert variant="danger">
          Could not reach {apiUrl}: {chainIdError}
        </Alert>
      )}

      {step === "detect" && (
        <DetectStep
          apiUrl={apiUrl}
          affectedSetUrl={AFFECTED_SET_URL}
          initialAccount={initialAccount}
          onContinue={handleDetected}
        />
      )}

      {step === "backupOld" && <BackupOldGate account={account} onContinue={handleBackupConfirmed} />}

      {step === "choosePath" && <ChoosePathStep onChoose={handleChoosePath} />}

      {step === "generate" && (
        <GenerateNewStep onGenerated={handleGenerated} onBack={() => setStep("choosePath")} />
      )}

      {step === "paste" && (
        <PastePubkeyStep onSet={handlePasted} onBack={() => setStep("choosePath")} currentKeys={currentKeys} />
      )}

      {step === "connectSign" && chainId && (
        <ConnectSignStep
          apiUrl={apiUrl}
          chainId={chainId}
          account={account}
          path={path}
          network={network}
          newPubKey={newPubKey}
          onSuccess={handleRekeySuccess}
        />
      )}

      {step === "connectSign" && !chainId && !chainIdError && (
        <div className="text-center py-4">
          <Spinner /> <span className="ms-2">Connecting to {apiUrl}...</span>
        </div>
      )}

      {step === "success" && (
        <SuccessStep
          account={session?.actor?.toString() || account}
          newPubKey={newPubKey}
          txids={txids}
          network={network}
          apiUrl={apiUrl}
        />
      )}
    </div>
  );
}

export default Rekey;
