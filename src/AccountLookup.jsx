import { useState, useEffect, useRef } from "react";
import { Table, Alert, Spinner, Badge, Form, Button, InputGroup } from "react-bootstrap";
import { useParams, useNavigate } from "react-router-dom";

const NETWORK_CONFIG = {
  mainnet: {
    label: "Mainnet",
    api: "https://lb.libre.org",
    hyperion: "https://api.libre.iad.cryptobloks.io",
    explorer: "https://www.libreblocks.io",
  },
  testnet: {
    label: "Testnet",
    api: "https://testnet.libre.org",
    hyperion: "https://api.testnet.libre.iad.cryptobloks.io",
    explorer: "https://testnet.libreblocks.io",
  },
};

const ALLOWED_TOKEN_CONTRACTS = ["eosio.token", "usdt.libre", "btc.libre", "cbtc.libre"];

const EXAMPLE_LOOKUPS = [
  { label: "quantum", type: "account" },
  { label: "x.libre", type: "account" },
  { label: "loan", type: "account" },
  { label: "dex.libre", type: "account" },
];

const AccountLookup = () => {
  const { network: urlNetwork, query: urlQuery } = useParams();
  const navigate = useNavigate();
  const initialized = useRef(false);

  const [network, setNetwork] = useState("mainnet");
  const [searchInput, setSearchInput] = useState("");
  const [searchType, setSearchType] = useState(null);
  const [accountData, setAccountData] = useState(null);
  const [creatorData, setCreatorData] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [controlledAccounts, setControlledAccounts] = useState([]);
  const [keyAccounts, setKeyAccounts] = useState([]);
  const [producerInfo, setProducerInfo] = useState(null);
  const [recentActions, setRecentActions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const getConfig = () => NETWORK_CONFIG[network];

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      if (urlNetwork && NETWORK_CONFIG[urlNetwork]) {
        setNetwork(urlNetwork);
      }
      if (urlQuery) {
        const decoded = decodeURIComponent(urlQuery);
        setSearchInput(decoded);
        performSearch(decoded, urlNetwork || "mainnet");
      }
    }
  }, []);

  // Handle browser back/forward navigation
  useEffect(() => {
    if (initialized.current && urlQuery) {
      const decoded = decodeURIComponent(urlQuery);
      const net = urlNetwork && NETWORK_CONFIG[urlNetwork] ? urlNetwork : "mainnet";
      if (decoded !== searchInput || (!accountData && !keyAccounts.length && !isLoading)) {
        setNetwork(net);
        setSearchInput(decoded);
        performSearch(decoded, net);
      }
    }
  }, [urlQuery, urlNetwork]);

  const isPublicKey = (input) => {
    return input.startsWith("EOS") || input.startsWith("PUB_");
  };

  const isValidAccountName = (name) => {
    return /^[a-z1-5.]{1,13}$/.test(name);
  };

  const performSearch = async (query, net) => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return;

    const currentNet = net || network;

    if (!isPublicKey(trimmed) && !isValidAccountName(trimmed)) {
      setError("Invalid account name. Must be 1-13 characters, only a-z, 1-5, and \".\" allowed.");
      return;
    }

    navigate(`/account/${currentNet}/${encodeURIComponent(trimmed)}`);
    setSearchInput(trimmed);
    setIsLoading(true);
    setError(null);
    setAccountData(null);
    setCreatorData(null);
    setTokens([]);
    setControlledAccounts([]);
    setKeyAccounts([]);
    setProducerInfo(null);
    setRecentActions([]);

    try {
      const config = NETWORK_CONFIG[currentNet];
      if (isPublicKey(trimmed)) {
        setSearchType("key");
        await fetchKeyAccounts(trimmed, config);
      } else {
        setSearchType("account");
        await fetchAccountData(trimmed, config);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchKeyAccounts = async (publicKey, config) => {
    const response = await fetch(config.hyperion + "/v1/history/get_key_accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key: publicKey }),
    });

    if (!response.ok) throw new Error("Failed to fetch accounts for this key");

    const data = await response.json();
    setKeyAccounts(data.account_names || []);
  };

  const fetchAccountData = async (accountName, config) => {
    const [accountRes, creatorRes, stateRes, controlledRes, producerRes] = await Promise.all([
      fetch(config.api + "/v1/chain/get_account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: accountName }),
      }),
      fetch(config.hyperion + "/v2/history/get_creator?account=" + accountName).catch(() => null),
      fetch(config.hyperion + "/v2/state/get_account?account=" + accountName).catch(() => null),
      fetch(config.hyperion + "/v1/history/get_controlled_accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlling_account: accountName }),
      }).catch(() => null),
      fetch(config.api + "/v1/chain/get_table_rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "eosio",
          table: "producers",
          scope: "eosio",
          lower_bound: accountName,
          upper_bound: accountName,
          limit: 1,
          json: true,
        }),
      }).catch(() => null),
    ]);

    if (!accountRes.ok) {
      const errData = await accountRes.json().catch(() => ({}));
      throw new Error(errData.message || `Account "${accountName}" not found`);
    }

    const account = await accountRes.json();
    setAccountData(account);

    if (creatorRes && creatorRes.ok) {
      const creator = await creatorRes.json();
      setCreatorData(creator);
    }

    if (stateRes && stateRes.ok) {
      const state = await stateRes.json();
      if (state.tokens) {
        setTokens(state.tokens.filter((t) => ALLOWED_TOKEN_CONTRACTS.includes(t.contract)));
      }
      if (state.actions) setRecentActions(state.actions);
    }

    if (controlledRes && controlledRes.ok) {
      const controlled = await controlledRes.json();
      setControlledAccounts(controlled.controlled_accounts || []);
    }

    if (producerRes && producerRes.ok) {
      const pData = await producerRes.json();
      if (pData.rows && pData.rows.length > 0) {
        setProducerInfo(pData.rows[0]);
      }
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    performSearch(searchInput);
  };

  const handleAccountClick = (accountName) => {
    setSearchInput(accountName);
    performSearch(accountName);
  };

  const handleKeyClick = (publicKey) => {
    setSearchInput(publicKey);
    performSearch(publicKey);
  };

  const handleNetworkChange = (net) => {
    setNetwork(net);
    if (searchInput.trim()) {
      performSearch(searchInput, net);
    } else {
      navigate(`/account/${net}`);
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === -1) return "unlimited";
    if (bytes < 1024) return bytes + " bytes";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };

  const formatMicroseconds = (us) => {
    if (us === -1) return "unlimited";
    if (us < 1000) return us + " us";
    if (us < 1000000) return (us / 1000).toFixed(2) + " ms";
    return (us / 1000000).toFixed(2) + " s";
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
    return d.toLocaleString();
  };

  const formatTimeAgo = (dateStr) => {
    if (!dateStr) return "";
    const d = new Date(dateStr + (dateStr.endsWith("Z") ? "" : "Z"));
    const now = new Date();
    const diff = now - d;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const getUsagePercent = (used, max) => {
    if (max <= 0 || used === -1) return null;
    return ((used / max) * 100).toFixed(1);
  };

  const getUsageColor = (percent) => {
    if (percent === null) return "info";
    if (percent > 90) return "danger";
    if (percent > 70) return "warning";
    return "success";
  };

  const buildPermTree = (permissions) => {
    if (!permissions) return [];
    const permMap = {};
    permissions.forEach((p) => {
      permMap[p.perm_name] = { ...p, children: [] };
    });
    const roots = [];
    permissions.forEach((p) => {
      if (p.parent && permMap[p.parent]) {
        permMap[p.parent].children.push(permMap[p.perm_name]);
      } else {
        roots.push(permMap[p.perm_name]);
      }
    });
    return roots;
  };

  const renderPermission = (perm, depth = 0) => {
    const auth = perm.required_auth;
    return (
      <div key={perm.perm_name} style={{ marginLeft: Math.min(depth * 24, 48) }} className={depth > 0 ? "mt-2" : ""}>
        <div className="border rounded p-3 mb-2 overflow-hidden" style={{ backgroundColor: depth === 0 ? "#f0f7ff" : "#f8f9fa" }}>
          <div className="d-flex align-items-center mb-2">
            <Badge bg={depth === 0 ? "primary" : depth === 1 ? "info" : "secondary"} className="me-2">
              {perm.perm_name}
            </Badge>
            <span className="text-muted small">threshold: {auth.threshold}</span>
          </div>

          {auth.keys && auth.keys.length > 0 && auth.keys.map((k, i) => (
            <div key={i} className="d-flex align-items-center ms-3 mb-1" style={{ minWidth: 0 }}>
              <i className="bi bi-key me-2 text-warning flex-shrink-0"></i>
              <span className="font-monospace small text-truncate">
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleKeyClick(k.key); }}
                  className="link-primary"
                >
                  {k.key}
                </a>
              </span>
              <Badge bg="light" text="dark" className="ms-2 flex-shrink-0">weight: {k.weight}</Badge>
            </div>
          ))}

          {auth.accounts && auth.accounts.length > 0 && auth.accounts.map((a, i) => (
            <div key={i} className="d-flex align-items-center ms-3 mb-1">
              <i className="bi bi-person me-2 text-primary"></i>
              <span className="font-monospace small">
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleAccountClick(a.permission.actor); }}
                  className="link-primary"
                >
                  {a.permission.actor}
                </a>
                @{a.permission.permission}
              </span>
              <Badge bg="light" text="dark" className="ms-2">weight: {a.weight}</Badge>
            </div>
          ))}

          {auth.waits && auth.waits.length > 0 && auth.waits.map((w, i) => (
            <div key={i} className="d-flex align-items-center ms-3 mb-1">
              <i className="bi bi-clock me-2 text-info"></i>
              <span className="small">wait {w.wait_sec}s</span>
              <Badge bg="light" text="dark" className="ms-2">weight: {w.weight}</Badge>
            </div>
          ))}

          {perm.linked_actions && perm.linked_actions.length > 0 && (
            <div className="ms-3 mt-2">
              <span className="text-muted small me-2">linked actions:</span>
              {perm.linked_actions.map((la, i) => (
                <span key={i} className="badge me-1 border text-dark bg-light">
                  {la.account}::{la.action}
                </span>
              ))}
            </div>
          )}
        </div>

        {perm.children && perm.children.map((child) => renderPermission(child, depth + 1))}
      </div>
    );
  };

  const permTree = accountData ? buildPermTree(accountData.permissions) : [];
  const config = getConfig();

  const ramPercent = accountData && accountData.ram_quota > 0
    ? getUsagePercent(accountData.ram_usage, accountData.ram_quota)
    : null;
  const cpuPercent = accountData
    ? getUsagePercent(accountData.cpu_limit.used, accountData.cpu_limit.max)
    : null;
  const netPercent = accountData
    ? getUsagePercent(accountData.net_limit.used, accountData.net_limit.max)
    : null;

  // Get voted producers for badge display
  const votedProducers = accountData?.voter_info?.producers || [];

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-center">
        <div style={{ width: "100%" }}>
          <h2 className="mb-4">Account Lookup</h2>

          <div className="alert alert-info mb-4">
            <div className="d-flex">
              <i className="bi bi-info-circle me-2 mt-1"></i>
              <div>
                <div>
                  Look up any Libre account by name or public key. View permissions, keys, thresholds,
                  linked actions, resource usage, token balances, votes, and recent activity.
                </div>
                <div className="mt-2 px-3 py-2 bg-white text-info border border-info rounded">
                  <strong className="me-1">Quick tip:</strong>
                  Enter a public key to find all accounts associated with that key.
                </div>
              </div>
            </div>
          </div>

          {/* Network Selector */}
          <div style={{ maxWidth: "300px" }} className="mb-3">
            <label className="form-label">Network</label>
            <select
              className="form-select"
              value={network}
              onChange={(e) => handleNetworkChange(e.target.value)}
            >
              <option value="mainnet">Mainnet</option>
              <option value="testnet">Testnet</option>
            </select>
          </div>

          {/* Search Form */}
          <Form onSubmit={handleSearch} className="mb-3">
            <InputGroup>
              <Form.Control
                type="text"
                placeholder="Enter account name or public key"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value.toLowerCase())}
                className="font-monospace"
              />
              <Button variant="primary" type="submit" disabled={isLoading || !searchInput.trim()}>
                {isLoading ? (
                  <Spinner animation="border" size="sm" />
                ) : (
                  <><i className="bi bi-search me-1"></i> Lookup</>
                )}
              </Button>
            </InputGroup>
          </Form>

          {/* Example Lookups */}
          {!accountData && !isLoading && searchType !== "key" && (
            <div className="mb-4">
              <span className="text-muted small me-2">Examples:</span>
              {EXAMPLE_LOOKUPS.map((ex, i) => (
                <a
                  key={i}
                  href="#"
                  onClick={(e) => { e.preventDefault(); setSearchInput(ex.label); performSearch(ex.label); }}
                  className="font-monospace small me-3 link-primary"
                >
                  {ex.label}
                </a>
              ))}
            </div>
          )}

          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}

          {isLoading && (
            <div className="text-center my-5">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            </div>
          )}

          {/* Key Lookup Results */}
          {!isLoading && searchType === "key" && !accountData && (
            <div className="card mb-4">
              <div className="card-header bg-primary text-white">
                <h5 className="mb-0">
                  Accounts for Key ({keyAccounts.length} found)
                </h5>
              </div>
              <div className="card-body">
                {keyAccounts.length === 0 ? (
                  <p className="text-muted mb-0">No accounts found for this key.</p>
                ) : (
                  <div className="row">
                    {keyAccounts.map((name) => (
                      <div key={name} className="col-md-3 col-sm-6 mb-2">
                        <a
                          href="#"
                          onClick={(e) => { e.preventDefault(); handleAccountClick(name); }}
                          className="d-block p-2 border rounded text-decoration-none font-monospace text-center"
                        >
                          {name}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Account Data */}
          {!isLoading && accountData && (
            <>
              {/* Account Header */}
              <div className="card mb-4">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <h5 className="mb-0 font-monospace">{accountData.account_name}</h5>
                  <div>
                    {producerInfo && producerInfo.is_active === 1 && (
                      <Badge bg="success" className="me-2">Block Producer</Badge>
                    )}
                    {producerInfo && producerInfo.is_active === 0 && (
                      <Badge bg="secondary" className="me-2">Inactive Producer</Badge>
                    )}
                    {votedProducers.length > 0 && (
                      <Badge pill style={{ backgroundColor: "#7952b3" }} className="me-2 px-3 py-2">
                        Voted: {votedProducers[0]}
                      </Badge>
                    )}
                    {accountData.privileged && (
                      <Badge bg="warning">Privileged</Badge>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-6">
                      <table className="table table-sm mb-0">
                        <tbody>
                          <tr>
                            <td className="text-muted" style={{ width: "140px" }}>Created</td>
                            <td>{formatDate(accountData.created)}</td>
                          </tr>
                          {creatorData && (
                            <tr>
                              <td className="text-muted">Created by</td>
                              <td>
                                <a
                                  href="#"
                                  onClick={(e) => { e.preventDefault(); handleAccountClick(creatorData.creator); }}
                                  className="font-monospace link-primary"
                                >
                                  {creatorData.creator === "eosio" ? "system" : creatorData.creator}
                                </a>
                              </td>
                            </tr>
                          )}
                          {accountData.last_code_update && accountData.last_code_update !== "1970-01-01T00:00:00.000" && (
                            <tr>
                              <td className="text-muted">Last code update</td>
                              <td>{formatDate(accountData.last_code_update)}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="col-md-6">
                      {accountData.core_liquid_balance && (
                        <table className="table table-sm mb-0">
                          <tbody>
                            <tr>
                              <td className="text-muted" style={{ width: "140px" }}>Liquid Balance</td>
                              <td className="font-monospace">{accountData.core_liquid_balance}</td>
                            </tr>
                            {accountData.voter_info && accountData.voter_info.staked > 0 && (
                              <tr>
                                <td className="text-muted">Staked</td>
                                <td className="font-monospace">
                                  {(accountData.voter_info.staked / 10000).toFixed(4)} LIBRE
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Resource Usage */}
              <div className="row mb-4">
                <div className="col-md-4">
                  <div className="card h-100">
                    <div className="card-body">
                      <h5 className="card-title">RAM</h5>
                      {accountData.ram_quota === -1 ? (
                        <>
                          <p className="card-text h3 mb-1">Unlimited</p>
                          <p className="card-text text-muted small mb-0">
                            Used: {formatBytes(accountData.ram_usage)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="card-text h3 mb-1">
                            {ramPercent !== null ? ramPercent + "%" : "N/A"}
                            <span className="fs-6 text-muted ms-2">used</span>
                          </p>
                          <div className="progress mb-2" style={{ height: "6px" }}>
                            <div
                              className={`progress-bar bg-${getUsageColor(ramPercent)}`}
                              style={{ width: `${ramPercent || 0}%` }}
                            ></div>
                          </div>
                          <p className="card-text text-muted small mb-0">
                            {formatBytes(accountData.ram_usage)} / {formatBytes(accountData.ram_quota)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card h-100">
                    <div className="card-body">
                      <h5 className="card-title">CPU</h5>
                      {accountData.cpu_limit.max === -1 ? (
                        <>
                          <p className="card-text h3 mb-1">Unlimited</p>
                          <p className="card-text text-muted small mb-0">System account</p>
                        </>
                      ) : (
                        <>
                          <p className="card-text h3 mb-1">
                            {cpuPercent !== null ? cpuPercent + "%" : "N/A"}
                            <span className="fs-6 text-muted ms-2">used</span>
                          </p>
                          <div className="progress mb-2" style={{ height: "6px" }}>
                            <div
                              className={`progress-bar bg-${getUsageColor(cpuPercent)}`}
                              style={{ width: `${cpuPercent || 0}%` }}
                            ></div>
                          </div>
                          <p className="card-text text-muted small mb-0">
                            {formatMicroseconds(accountData.cpu_limit.used)} / {formatMicroseconds(accountData.cpu_limit.max)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card h-100">
                    <div className="card-body">
                      <h5 className="card-title">NET</h5>
                      {accountData.net_limit.max === -1 ? (
                        <>
                          <p className="card-text h3 mb-1">Unlimited</p>
                          <p className="card-text text-muted small mb-0">System account</p>
                        </>
                      ) : (
                        <>
                          <p className="card-text h3 mb-1">
                            {netPercent !== null ? netPercent + "%" : "N/A"}
                            <span className="fs-6 text-muted ms-2">used</span>
                          </p>
                          <div className="progress mb-2" style={{ height: "6px" }}>
                            <div
                              className={`progress-bar bg-${getUsageColor(netPercent)}`}
                              style={{ width: `${netPercent || 0}%` }}
                            ></div>
                          </div>
                          <p className="card-text text-muted small mb-0">
                            {formatBytes(accountData.net_limit.used)} / {formatBytes(accountData.net_limit.max)}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Permissions & Keys */}
              <div className="card mb-4">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">Permissions & Keys</h5>
                </div>
                <div className="card-body">
                  {permTree.map((perm) => renderPermission(perm))}
                </div>
              </div>

              <div className="row mb-4">
                {/* Tokens */}
                {tokens.length > 0 && (
                  <div className={producerInfo ? "col-md-4" : "col-md-6"}>
                    <div className="card h-100">
                      <div className="card-header bg-primary text-white">
                        <h5 className="mb-0">Tokens ({tokens.length})</h5>
                      </div>
                      <div className="card-body">
                        {tokens.map((t, i) => (
                          <div key={i} className={`d-flex justify-content-between align-items-center ${i < tokens.length - 1 ? "border-bottom pb-2 mb-2" : ""}`}>
                            <div>
                              <span className="text-muted small">{t.contract}</span>
                              <div className="fw-bold text-primary">{t.symbol}</div>
                            </div>
                            <div className="font-monospace text-end">
                              {typeof t.amount === "number" ? t.amount.toLocaleString("en-US", { maximumFractionDigits: t.precision || 4 }) : t.amount}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Producer Info */}
                {producerInfo && (
                  <div className={tokens.length > 0 ? "col-md-4" : "col-md-6"}>
                    <div className="card h-100">
                      <div className="card-header bg-primary text-white">
                        <h5 className="mb-0">Producer Info</h5>
                      </div>
                      <div className="card-body">
                        <table className="table table-sm mb-0">
                          <tbody>
                            <tr>
                              <td className="text-muted">Status</td>
                              <td>
                                <Badge bg={producerInfo.is_active ? "success" : "secondary"}>
                                  {producerInfo.is_active ? "Active" : "Inactive"}
                                </Badge>
                              </td>
                            </tr>
                            <tr>
                              <td className="text-muted">Total Votes</td>
                              <td className="font-monospace">
                                {parseFloat(producerInfo.total_votes).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                            <tr>
                              <td className="text-muted">Unpaid Blocks</td>
                              <td className="font-monospace">{producerInfo.unpaid_blocks}</td>
                            </tr>
                            <tr>
                              <td className="text-muted">Last Claim</td>
                              <td>{formatDate(producerInfo.last_claim_time)}</td>
                            </tr>
                            {producerInfo.url && (
                              <tr>
                                <td className="text-muted">URL</td>
                                <td>
                                  <a href={producerInfo.url} target="_blank" rel="noopener noreferrer" className="text-break">
                                    {producerInfo.url}
                                  </a>
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {/* Controlled Accounts */}
              {controlledAccounts.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header bg-primary text-white">
                    <h5 className="mb-0">Controlled Accounts ({controlledAccounts.length})</h5>
                  </div>
                  <div className="card-body">
                    <div className="row">
                      {controlledAccounts.map((name) => (
                        <div key={name} className="col-md-3 col-sm-6 mb-2">
                          <a
                            href="#"
                            onClick={(e) => { e.preventDefault(); handleAccountClick(name); }}
                            className="d-block p-2 border rounded text-decoration-none font-monospace text-center"
                          >
                            {name}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Actions */}
              {recentActions.length > 0 && (
                <div className="card mb-4">
                  <div className="card-header bg-primary text-white">
                    <h5 className="mb-0">Recent Actions</h5>
                  </div>
                  <div className="card-body">
                    <Table striped bordered hover responsive size="sm">
                      <thead>
                        <tr>
                          <th>TX</th>
                          <th>Action</th>
                          <th>Data</th>
                          <th className="text-end">Block & Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentActions.slice(0, 20).map((action, i) => (
                          <tr key={i}>
                            <td>
                              <a
                                href={`${config.explorer}/tx/${action.trx_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-monospace small"
                              >
                                {action.trx_id ? action.trx_id.slice(0, 8) + "..." : "N/A"}
                              </a>
                            </td>
                            <td>
                              <Badge bg="light" text="dark" className="font-monospace">
                                {action.act.name}
                              </Badge>
                              <span className="text-muted small ms-1">on {action.act.account}</span>
                            </td>
                            <td className="small" style={{ maxWidth: "300px" }}>
                              {action.act.data && (() => {
                                const d = action.act.data;
                                if (d.from && d.to && d.quantity) {
                                  return (
                                    <span>
                                      <a href="#" onClick={(e) => { e.preventDefault(); handleAccountClick(d.from); }} className="link-primary">{d.from}</a>
                                      {" → "}
                                      <a href="#" onClick={(e) => { e.preventDefault(); handleAccountClick(d.to); }} className="link-primary">{d.to}</a>
                                      {" "}
                                      <span className="font-monospace">{d.quantity}</span>
                                      {d.memo && <span className="text-muted"> ({d.memo})</span>}
                                    </span>
                                  );
                                }
                                if (d.voter && d.producers) {
                                  return (
                                    <span>
                                      producers: {d.producers.map((p, j) => (
                                        <span key={j}>
                                          {j > 0 && ", "}
                                          <a href="#" onClick={(e) => { e.preventDefault(); handleAccountClick(p); }} className="link-primary">{p}</a>
                                        </span>
                                      ))}
                                    </span>
                                  );
                                }
                                if (d.owner && typeof d.owner === "string") return <span>owner: {d.owner}</span>;
                                const str = JSON.stringify(d);
                                return str.slice(0, 120) + (str.length > 120 ? "..." : "");
                              })()}
                            </td>
                            <td className="text-end">
                              <a
                                href={`${config.explorer}/block/${action.block_num}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-monospace small"
                              >
                                {action.block_num}
                              </a>
                              <br />
                              <span className="text-muted small">{formatTimeAgo(action.timestamp)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AccountLookup;
