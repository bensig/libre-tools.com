import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Form, Spinner, Table } from "react-bootstrap";
import { createSessionKit } from "./utils/session";
import {
  BUNDLES,
  AGENT_PERMISSION,
  buildAgentPermissionActions,
  buildRevokeActions,
  linkedActions,
} from "./utils/botAccount";

// Same endpoints as Rekey.jsx / LibreExplorer.jsx.
const NETWORK_ENDPOINTS = {
  mainnet: "https://api.libre.org",
  testnet: "https://testnet-api.libre.org",
};

const EXPLORER = {
  mainnet: "https://www.libreblocks.io/tx/",
  testnet: "https://testnet.libreblocks.io/tx/",
};

function BotAccount() {
  const [searchParams] = useSearchParams();
  const network = (searchParams.get("network") || "mainnet").trim().toLowerCase();
  const apiUrl = NETWORK_ENDPOINTS[network] || NETWORK_ENDPOINTS.mainnet;

  const [account, setAccount] = useState((searchParams.get("account") || "").trim().toLowerCase());
  const [agentKey, setAgentKey] = useState("");
  const [selected, setSelected] = useState([]);
  const [chainId, setChainId] = useState(null);
  const [chainIdError, setChainIdError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [txid, setTxid] = useState(null);
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setChainId(null);
    setChainIdError(null);
    fetch(`${apiUrl}/v1/chain/get_info`)
      .then((res) => res.json())
      .then((data) => !cancelled && setChainId(data.chain_id))
      .catch((e) => !cancelled && setChainIdError(e.message));
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  // Show whether an `agent` permission already exists, so re-running this replaces a
  // known thing rather than surprising someone.
  useEffect(() => {
    if (!account) return setExisting(null);
    let cancelled = false;
    fetch(`${apiUrl}/v1/chain/get_account`, {
      method: "POST",
      body: JSON.stringify({ account_name: account }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const perm = d?.permissions?.find((p) => p.perm_name === AGENT_PERMISSION);
        setExisting(perm ?? null);
      })
      .catch(() => !cancelled && setExisting(null));
    return () => {
      cancelled = true;
    };
  }, [account, apiUrl]);

  const toggle = (key) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const preview = useMemo(() => {
    try {
      return selected.length ? linkedActions(selected) : [];
    } catch {
      return [];
    }
  }, [selected]);

  const sign = async (buildFn) => {
    setBusy(true);
    setError(null);
    setTxid(null);
    try {
      const kit = createSessionKit({ chainId, apiUrl });
      const { session } = await kit.login();
      const actions = buildFn();
      const result = await session.transact({ actions });
      setTxid(result.resolved?.transaction?.id ?? result.response?.transaction_id ?? null);
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const canGrant = account && agentKey && selected.length && chainId && !busy;

  return (
    <div className="container py-4" style={{ maxWidth: "52rem" }}>
      <h1 className="h3">Give a bot its own permission</h1>
      <p className="text-muted">
        Create a restricted <code>{AGENT_PERMISSION}</code> permission on your account, holding
        only your bot&apos;s key and linked only to the actions you choose. Your bot signs with
        that key; it can never change your keys, vote, or spend outside what you grant here.
      </p>

      <Alert variant="secondary">
        <strong>Don&apos;t have an account yet?</strong> Libre accounts are free — create one at{" "}
        <a href="https://accounts.libre.org" target="_blank" rel="noreferrer">
          accounts.libre.org
        </a>{" "}
        first, then come back here. Once set up, point your bot at{" "}
        <a href="https://mcp.libre.org" target="_blank" rel="noreferrer">
          mcp.libre.org
        </a>
        .
      </Alert>

      {chainIdError && <Alert variant="danger">Could not reach {apiUrl}: {chainIdError}</Alert>}

      <Card className="mb-3">
        <Card.Body>
          <Form.Group className="mb-3">
            <Form.Label>Your Libre account</Form.Label>
            <Form.Control
              value={account}
              onChange={(e) => setAccount(e.target.value.trim().toLowerCase())}
              placeholder="myaccount"
              autoComplete="off"
            />
            <Form.Text>
              Network: <strong>{network}</strong>. You will sign with this account&apos;s{" "}
              <code>active</code> key.
            </Form.Text>
          </Form.Group>

          <Form.Group>
            <Form.Label>Your bot&apos;s public key</Form.Label>
            <Form.Control
              value={agentKey}
              onChange={(e) => setAgentKey(e.target.value.trim())}
              placeholder="PUB_K1_…"
              autoComplete="off"
            />
            <Form.Text>
              The <strong>public</strong> key of a keypair your bot holds — never your own key,
              and never a private key. Need one?{" "}
              <a href="/seed-generator">Generate a keypair</a> and give the bot the private half.
            </Form.Text>
          </Form.Group>
        </Card.Body>
      </Card>

      {existing && (
        <Alert variant="warning">
          This account already has an <code>{AGENT_PERMISSION}</code> permission with{" "}
          {existing.required_auth?.keys?.length ?? 0} key(s). Granting again <strong>replaces</strong>{" "}
          it.
        </Alert>
      )}

      <Card className="mb-3">
        <Card.Body>
          <Card.Title className="h6">What may the bot do?</Card.Title>
          <p className="text-muted small mb-3">
            Grant the least it needs. Each capability is a set of specific actions — anything not
            listed stays impossible for that key.
          </p>
          {Object.entries(BUNDLES).map(([key, bundle]) => (
            <Form.Check
              key={key}
              type="checkbox"
              id={`bundle-${key}`}
              className="mb-3"
              checked={selected.includes(key)}
              onChange={() => toggle(key)}
              label={
                <span>
                  <strong>{bundle.label}</strong>
                  <br />
                  <span className="text-muted small">{bundle.description}</span>
                </span>
              }
            />
          ))}
        </Card.Body>
      </Card>

      {preview.length > 0 && (
        <Card className="mb-3">
          <Card.Body>
            <Card.Title className="h6">Exactly what this grants</Card.Title>
            <Table size="sm" className="mb-0">
              <thead>
                <tr>
                  <th>Contract</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((a) => (
                  <tr key={`${a.account}::${a.action}`}>
                    <td>
                      <code>{a.account}</code>
                    </td>
                    <td>
                      <code>{a.action}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      )}

      {selected.includes("trade") && (
        <Alert variant="info">
          Trading works by sending tokens to <code>dex.libre</code> with a memo, so the bot can move
          your BTC and USDT to that contract. It cannot send them anywhere else.
        </Alert>
      )}

      {error && <Alert variant="danger">{error}</Alert>}
      {txid && (
        <Alert variant="success">
          Done.{" "}
          <a href={`${EXPLORER[network] ?? EXPLORER.mainnet}${txid}`} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </Alert>
      )}

      <div className="d-flex gap-2 flex-wrap">
        <Button
          disabled={!canGrant}
          onClick={() => sign(() => buildAgentPermissionActions({ account, agentKey, bundles: selected }))}
        >
          {busy ? <Spinner size="sm" animation="border" /> : "Connect wallet & grant"}
        </Button>
        {existing && (
          <Button
            variant="outline-danger"
            disabled={busy || !account || !chainId}
            onClick={() => sign(() => buildRevokeActions({ account }))}
          >
            Revoke agent permission
          </Button>
        )}
      </div>

      <hr className="my-4" />
      <h2 className="h6">Why a separate permission</h2>
      <p className="text-muted small mb-1">
        A bot needs a key that can act without you. Giving it your <code>active</code> key would let
        it do everything you can, including changing your keys and locking you out.
      </p>
      <p className="text-muted small">
        This creates <code>{AGENT_PERMISSION}</code> as a child of <code>active</code>: strictly
        weaker, limited to the actions above, and revocable by you at any time with a single
        transaction. If the bot&apos;s key leaks, the damage is bounded by what you granted, and your
        account itself stays yours.
      </p>
    </div>
  );
}

export default BotAccount;
