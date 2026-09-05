import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Button, Card, Form, Spinner } from "react-bootstrap";
import { createSessionKit } from "./utils/session";
import ActionPicker from "./components/permissions/ActionPicker";
import PermissionList from "./components/permissions/PermissionList";
import {
  TEMPLATES,
  templateLinks,
  linkId,
  normalizeLink,
  validatePermissionName,
  buildCreateActions,
  buildEditActions,
  buildRevokeActions,
} from "./utils/permissions";

const NETWORK_ENDPOINTS = {
  mainnet: "https://api.libre.org",
  testnet: "https://testnet-api.libre.org",
};
const EXPLORER = {
  mainnet: "https://www.libreblocks.io/tx/",
  testnet: "https://testnet.libreblocks.io/tx/",
};

export default function Permissions({ lockedTemplate = null, title, intro }) {
  const [searchParams] = useSearchParams();
  const network = (searchParams.get("network") || "mainnet").trim().toLowerCase();
  const apiUrl = NETWORK_ENDPOINTS[network] || NETWORK_ENDPOINTS.mainnet;
  const templateId = lockedTemplate ?? searchParams.get("template");

  const [account, setAccount] = useState((searchParams.get("account") || "").trim().toLowerCase());
  const [permissions, setPermissions] = useState(null);
  const [editing, setEditing] = useState(null); // the perm_name being edited, or null for create
  const [name, setName] = useState(TEMPLATES[templateId]?.permission ?? "");
  const [key, setKey] = useState("");
  const [currentKey, setCurrentKey] = useState(null);
  const [links, setLinks] = useState(templateId ? templateLinks([templateId]) : []);
  const [chainId, setChainId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [txid, setTxid] = useState(null);
  const [signedAs, setSignedAs] = useState(null);

  useEffect(() => {
    fetch(`${apiUrl}/v1/chain/get_info`)
      .then((r) => r.json())
      .then((d) => setChainId(d.chain_id))
      .catch((e) => setError(e.message));
  }, [apiUrl]);

  const loadAccount = useCallback(async () => {
    if (!account) return setPermissions(null);
    try {
      const res = await fetch(`${apiUrl}/v1/chain/get_account`, {
        method: "POST",
        body: JSON.stringify({ account_name: account }),
      });
      const data = await res.json();
      setPermissions(data?.permissions ?? null);
    } catch {
      setPermissions(null);
    }
  }, [account, apiUrl]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  const startEdit = (perm) => {
    setEditing(perm.perm_name);
    setName(perm.perm_name);
    const k = perm.required_auth?.keys?.[0]?.key ?? "";
    setKey(k);
    setCurrentKey(k);
    setLinks((perm.linked_actions ?? []).map(normalizeLink));
    setError(null);
    setTxid(null);
  };

  const startCreate = () => {
    setEditing(null);
    setName(TEMPLATES[templateId]?.permission ?? "");
    setKey("");
    setCurrentKey(null);
    setLinks(templateId ? templateLinks([templateId]) : []);
    setError(null);
    setTxid(null);
  };

  const sign = async (build) => {
    setBusy(true);
    setError(null);
    setTxid(null);
    try {
      // Re-read immediately before building, so a stale view can't cause an unintended unlink.
      await loadAccount();
      const kit = createSessionKit({ chainId, apiUrl });
      const { session } = await kit.login();
      setSignedAs(String(session.actor));
      const actions = build();
      if (!actions.length) throw new Error("No changes to apply");
      const result = await session.transact({ actions });
      setTxid(result.resolved?.transaction?.id ?? result.response?.transaction_id ?? null);
      await loadAccount();
    } catch (e) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = (perm) =>
    sign(() =>
      buildRevokeActions({
        account,
        permission: perm.perm_name,
        linkedActions: perm.linked_actions ?? [],
      })
    );

  const submit = () =>
    sign(() =>
      editing
        ? buildEditActions({
            account,
            permission: name,
            key,
            currentKey,
            current: (permissions?.find((p) => p.perm_name === editing)?.linked_actions ?? []).map(
              normalizeLink
            ),
            desired: links,
          })
        : buildCreateActions({ account, permission: name, key, links })
    );

  let nameError = null;
  try {
    if (name) validatePermissionName(name);
  } catch (e) {
    nameError = e.message;
  }

  const canSubmit = account && name && !nameError && key && links.length && chainId && !busy;

  return (
    <div className="container py-4" style={{ maxWidth: "52rem" }}>
      <h1 className="h3">{title ?? "Account permissions"}</h1>
      <p className="text-muted">
        {intro ??
          "Create a named permission on your account holding one key, linked only to the actions you choose. Permissions created here are children of active: strictly weaker than your own keys, and revocable at any time."}
      </p>

      <Alert variant="secondary" className="small">
        <strong>No account yet?</strong> Libre accounts are free at{" "}
        <a href="https://accounts.libre.org" target="_blank" rel="noreferrer">accounts.libre.org</a>.
        Your <code>owner</code> and <code>active</code> keys are never changed here — use{" "}
        <a href="/rekey">/rekey</a> for that.
      </Alert>

      <Card className="mb-3">
        <Card.Body>
          <Form.Label>Account</Form.Label>
          <Form.Control
            value={account}
            onChange={(e) => setAccount(e.target.value.trim().toLowerCase())}
            placeholder="myaccount"
            autoComplete="off"
          />
          <Form.Text>
            Network: <strong>{network}</strong>. Anyone can inspect; only the account owner can sign.
          </Form.Text>
        </Card.Body>
      </Card>

      {permissions && (
        <PermissionList
          permissions={permissions}
          onEdit={startEdit}
          onRevoke={onRevoke}
          canSign
        />
      )}

      <Card className="mb-3">
        <Card.Body>
          <Card.Title className="h6">
            {editing ? `Edit ${editing}` : "Create a permission"}
            {editing && (
              <Button size="sm" variant="link" onClick={startCreate}>
                cancel
              </Button>
            )}
          </Card.Title>

          <Form.Group className="mb-3">
            <Form.Label>Permission name</Form.Label>
            <Form.Control
              value={name}
              onChange={(e) => setName(e.target.value.trim().toLowerCase())}
              disabled={!!editing || !!lockedTemplate}
              isInvalid={!!nameError}
              placeholder="trading"
            />
            <Form.Control.Feedback type="invalid">{nameError}</Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Public key for this permission</Form.Label>
            <Form.Control
              value={key}
              onChange={(e) => setKey(e.target.value.trim())}
              placeholder="PUB_K1_…"
              autoComplete="off"
            />
            <Form.Text>
              The <strong>public</strong> key of the keypair the bot holds — never a private key.{" "}
              <a href="/seed-generator">Generate a keypair</a>.
            </Form.Text>
          </Form.Group>

          {!lockedTemplate && (
            <Form.Group className="mb-3">
              <Form.Label>Start from a template</Form.Label>
              <div className="d-flex gap-2 flex-wrap">
                {Object.entries(TEMPLATES).map(([id, t]) => (
                  <Button
                    key={id}
                    size="sm"
                    variant="outline-secondary"
                    onClick={() => {
                      setLinks(templateLinks([id]));
                      if (!editing) setName(t.permission);
                    }}
                    title={t.description}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </Form.Group>
          )}

          <ActionPicker apiUrl={apiUrl} selected={links} onChange={setLinks} />

          {links.length > 0 && (
            <div className="mt-3">
              <div className="small text-muted mb-1">This permission will be able to:</div>
              <ul className="small mb-0">
                {links.map((l) => (
                  <li key={linkId(l)}>
                    <code>{l.account}</code>::<code>{l.action || "(whole contract)"}</code>{" "}
                    <Button
                      size="sm"
                      variant="link"
                      className="p-0"
                      onClick={() => setLinks(links.filter((x) => linkId(x) !== linkId(l)))}
                    >
                      remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card.Body>
      </Card>

      {error && <Alert variant="danger">{error}</Alert>}
      {txid && (
        <Alert variant="success">
          Done{signedAs ? ` (signed as ${signedAs})` : ""}.{" "}
          <a href={`${EXPLORER[network] ?? EXPLORER.mainnet}${txid}`} target="_blank" rel="noreferrer">
            View transaction
          </a>
        </Alert>
      )}

      <Button disabled={!canSubmit} onClick={submit}>
        {busy ? <Spinner size="sm" animation="border" /> : editing ? "Apply changes" : "Connect wallet & create"}
      </Button>
    </div>
  );
}
