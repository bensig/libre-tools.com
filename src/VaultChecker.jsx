import { useState, useEffect } from 'react';
import { Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import NetworkSelector from './components/NetworkSelector';

// Primary-key lookup of a single address field in a contract's accounts table.
// Returns the address string, or null if the account has no entry.
const lookupAccountAddress = async (libre, code, key, field) => {
  try {
    const res = await fetch(`${libre}/v1/chain/get_table_rows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        table: 'accounts',
        scope: code,
        lower_bound: key,
        upper_bound: key,
        limit: 1,
        json: true
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.rows && data.rows.length ? data.rows[0][field] : null;
  } catch {
    return null;
  }
};

const VaultChecker = () => {
  const [searchInput, setSearchInput] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [network, setNetwork] = useState('mainnet');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customEndpointError, setCustomEndpointError] = useState('');

  const NETWORK_ENDPOINTS = {
    mainnet: {
      libre: 'https://lb.libre.org',
      btc: 'https://mempool.space',
      etherscan: 'https://etherscan.io'
    },
    testnet: {
      libre: 'https://testnet.libre.org',
      btc: 'https://mempool.space/signet',
      etherscan: 'https://sepolia.etherscan.io'
    }
  };

  const getApiEndpoint = () => {
    if (network === 'custom-libre-btc-mainnet' || network === 'custom-libre-btc-signet') {
      if (!customEndpoint) {
        throw new Error('Custom endpoint is required');
      }

      const btcEndpoint = network === 'custom-libre-btc-signet'
        ? 'https://mempool.space/signet'
        : 'https://mempool.space';

      return {
        libre: formatEndpoint(customEndpoint),
        btc: btcEndpoint,
        etherscan: 'https://etherscan.io'
      };
    }
    return NETWORK_ENDPOINTS[network];
  };

  const formatEndpoint = (url) => {
    let cleanUrl = url.trim().replace(/\/$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    return cleanUrl;
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  const formatUSDT = (value) => {
    let amount;
    if (typeof value === 'string') {
      [amount] = value.split(' ');
      amount = parseFloat(amount);
    } else {
      amount = parseFloat(value);
    }
    // Ensure exactly 2 decimal places
    return formatNumber(amount.toFixed(2)) + ' USDT';
  };

  const handleSearchInputChange = (e) => {
    const value = e.target.value.toLowerCase();
    setSearchInput(value);
    setError(null);
  };

  // Effect to clear error and result when network changes
  useEffect(() => {
    setError(null);
    setResult(null);
  }, [network, customEndpoint]);

  const isVaultName = (input) => {
    return input.trim().endsWith('.loan');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!searchInput) {
      setError('Please enter a Libre account name or vault name');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const baseEndpoint = getApiEndpoint();
      const isVault = isVaultName(searchInput);

      // Step 1: Find the vault info
      const requestBody = {
        code: 'loan',
        table: 'vault',
        scope: 'loan',
        limit: 1,
        json: true
      };

      // Use lower_bound and upper_bound for efficient lookup
      if (!isVault) {
        // Searching by account name (owner field) - use primary index (index_position 1, default)
        requestBody.lower_bound = searchInput;
        requestBody.upper_bound = searchInput;
      } else {
        // Searching by vault name - use secondary index on vault field (index_position 2)
        requestBody.index_position = 2;
        requestBody.key_type = 'name';
        requestBody.lower_bound = searchInput;
        requestBody.upper_bound = searchInput;
      }

      const vaultResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!vaultResponse.ok) {
        throw new Error('Failed to fetch vault data');
      }

      const vaultData = await vaultResponse.json();
      let vaultInfo;
      let accountName;
      let vaultAccount;

      if (!isVault) {
        // Searching by account name - vault is optional
        vaultInfo = vaultData.rows.find(row => row.owner === searchInput);
        accountName = searchInput;
        vaultAccount = vaultInfo ? vaultInfo.vault : null;
      } else {
        // Searching by vault name
        vaultInfo = vaultData.rows.find(row => row.vault === searchInput);

        if (!vaultInfo) {
          setError(`No owner found for vault: ${searchInput}`);
          setIsLoading(false);
          return;
        }

        accountName = vaultInfo.owner;
        vaultAccount = searchInput;
      }

      // Step 2: Bridge deposit addresses are keyed by the OWNER account
      // (x.libre = BTC bridge, t.libre = USDT/ETH bridge)
      const [bridgeBtcAddress, ethAddress] = await Promise.all([
        lookupAccountAddress(baseEndpoint.libre, 'x.libre', accountName, 'btc_address'),
        lookupAccountAddress(baseEndpoint.libre, 't.libre', accountName, 'eth_address')
      ]);

      if (!vaultAccount && !bridgeBtcAddress && !ethAddress) {
        setError(`No vault or bridge addresses found for account: ${accountName}`);
        setIsLoading(false);
        return;
      }

      // Step 3: Vault collateral details live under the vault (.loan) account
      // in v.libre - only fetched when the account actually has a vault
      let vaultDetails = null;
      if (vaultAccount) {
        const vaultBtcAddress = await lookupAccountAddress(baseEndpoint.libre, 'v.libre', vaultAccount, 'btc_address');

        // BTC balance of the collateral address (from mempool)
        let btcBalance = 0;
        if (vaultBtcAddress) {
          const btcBalanceResponse = await fetch(`${baseEndpoint.btc}/api/address/${vaultBtcAddress}`);
          if (btcBalanceResponse.ok) {
            const btcBalanceData = await btcBalanceResponse.json();
            btcBalance = (btcBalanceData.chain_stats.funded_txo_sum - btcBalanceData.chain_stats.spent_txo_sum) / 100000000;
          } else {
            console.warn('Failed to fetch BTC balance from mempool');
          }
        }

        // CBTC (collateral) balance on Libre
        let cbtcBalance = 0;
        const cbtcBalanceResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_currency_balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'cbtc.libre',
            account: vaultAccount,
            symbol: 'CBTC'
          })
        });
        if (cbtcBalanceResponse.ok) {
          const cbtcBalanceData = await cbtcBalanceResponse.json();
          if (cbtcBalanceData && cbtcBalanceData.length > 0) {
            cbtcBalance = parseFloat(cbtcBalanceData[0].split(' ')[0]);
          }
        } else {
          console.warn('Failed to fetch CBTC balance');
        }

        // Loan for this account
        const loanResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'loan',
            table: 'loan',
            scope: 'loan',
            limit: 1000,
            json: true
          })
        });

        let loanInfo = null;
        if (loanResponse.ok) {
          const loanData = await loanResponse.json();
          loanInfo = loanData.rows.find(row => row.account === accountName);
        } else {
          console.warn('Failed to fetch loan data');
        }

        // BTC price from Chainlink price feed, fallback to oracle.libre
        const oracleCode = network === 'mainnet' || network === 'custom-libre-btc-mainnet' ? 'chainlink' : 'oracletest';
        const btcPriceResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: oracleCode,
            table: 'feed',
            scope: oracleCode,
            limit: 1000,
            json: true
          })
        });

        let btcPrice = 0;
        if (btcPriceResponse.ok) {
          const btcPriceData = await btcPriceResponse.json();
          const btcUsdPair = btcPriceData.rows?.find(row => row.pair === 'btcusd');
          if (btcUsdPair) {
            btcPrice = parseFloat(btcUsdPair.price);
          }
        } else {
          console.warn(`Failed to fetch BTC price from ${oracleCode}`);

          const oracleResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: 'oracle.libre',
              table: 'datapoints',
              scope: 'btc.usd',
              limit: 1,
              json: true,
              reverse: true
            })
          });

          if (oracleResponse.ok) {
            const oracleData = await oracleResponse.json();
            if (oracleData.rows && oracleData.rows.length > 0) {
              btcPrice = oracleData.rows[0].median / 10000;
            }
          } else {
            console.warn('Failed to fetch BTC price from oracle.libre');
          }
        }

        // Collateral value and LTV when there's a loan
        let collateralValue = 0;
        let ltv = 0;
        if (loanInfo && btcPrice > 0) {
          collateralValue = cbtcBalance * btcPrice;
          const outstandingAmount = parseFloat(loanInfo.outstanding_amount.split(' ')[0]);
          if (collateralValue > 0) {
            ltv = (outstandingAmount / collateralValue) * 100;
          }
        }

        const vaultSyncStatus = Math.abs(btcBalance - cbtcBalance) < 0.00000001 ? "IN SYNC" : "PENDING";

        vaultDetails = {
          vault: vaultAccount,
          vaultBtcAddress,
          btcBalance,
          cbtcBalance,
          vaultSyncStatus,
          hasLoan: !!loanInfo,
          loanInfo,
          collateralValue,
          ltv,
          btcPrice
        };
      }

      setResult({
        account: accountName,
        bridgeBtcAddress,
        ethAddress,
        hasVault: !!vaultAccount,
        ...vaultDetails
      });

    } catch (err) {
      console.error('Error fetching data:', err);
      setError(`Error: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renderLoanStatus = (status) => {
    if (status === undefined || status === null) return 'N/A';
    
    switch (status) {
      case 0:
        return <span className="text-success">Active</span>;
      case 1:
        return <span className="text-warning">Liquidation Warning</span>;
      case 2:
        return <span className="text-danger">Liquidation Risk</span>;
      case 3:
        return <span className="text-danger">In Liquidation</span>;
      case 4:
        return <span className="text-secondary">Completed</span>;
      default:
        return <span className="text-secondary">Unknown</span>;
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-center">
        <div style={{ width: '100%' }}>
          <h2 className="mb-4">Vault &amp; Addresses</h2>

          <div className="alert alert-info mb-4">
            <i className="bi bi-info-circle me-2"></i>
            <div>
              Look up any Libre account to see its bridge deposit addresses (BTC and USDT/ETH), its vault collateral address, and whether the vault is in sync — plus loan details when there is one.
              <div className="mt-3 px-3 py-2 bg-white text-info border border-info rounded">
                <strong className="me-1">Quick tip:</strong>
                Enter an account name (e.g. nobi) or a vault name ending in `.loan`. Accounts without a vault still show their bridge addresses.
              </div>
            </div>
          </div>

          <div style={{ maxWidth: '300px' }} className="mb-4">
            <NetworkSelector 
              network={network} 
              setNetwork={setNetwork}
              customEndpoint={customEndpoint}
              setCustomEndpoint={setCustomEndpoint}
              customEndpointError={customEndpointError}
              setCustomEndpointError={setCustomEndpointError}
            />
          </div>

          {error && (
            <Alert variant="danger" className="mb-4">
              {error}
            </Alert>
          )}

          <div className="card mb-4">
            <div className="card-header bg-primary text-white">
              <h5 className="mb-0">Look Up Account</h5>
            </div>
            <div className="card-body">
              <Form onSubmit={handleSubmit}>
                <div className="row">
                  <div className="col-md-6">
                    <Form.Group className="mb-3">
                      <Form.Label>Libre Account or Vault Name</Form.Label>
                      <Form.Control
                        type="text"
                        value={searchInput}
                        onChange={handleSearchInputChange}
                        placeholder="Enter account name or vault name (ends with .loan)"
                        autoFocus
                      />
                      <Form.Text className="text-muted">
                        Enter a Libre account name (e.g. nobi) or a vault name (e.g. 2kcv5ga.loan)
                      </Form.Text>
                    </Form.Group>
                    
                    <Button 
                      variant="primary" 
                      type="submit" 
                      disabled={isLoading || !searchInput}
                      className="mb-3"
                    >
                      {isLoading ? (
                        <>
                          <Spinner
                            as="span"
                            animation="border"
                            size="sm"
                            role="status"
                            aria-hidden="true"
                            className="me-2"
                          />
                          Loading...
                        </>
                      ) : (
                        'Look Up'
                      )}
                    </Button>
                  </div>
                </div>
              </Form>
            </div>
          </div>

          {isLoading && (
            <div className="text-center my-5">
              <Spinner animation="border" role="status">
                <span className="visually-hidden">Loading...</span>
              </Spinner>
            </div>
          )}

          {result && !isLoading && (
            <>
              {/* Addresses - shown for any account, with or without a vault */}
              <div className="card mb-4">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">Addresses</h5>
                  <a
                    href={`${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/account/${result.account}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white font-monospace"
                  >
                    {result.account}
                  </a>
                </div>
                <div className="card-body">
                  <Table striped bordered hover responsive className="mb-0">
                    <tbody>
                      <tr>
                        <th style={{width: '260px'}}>
                          BTC Bridge Deposit
                          <div className="text-muted small fw-normal">x.libre · account {result.account}</div>
                        </th>
                        <td className="font-monospace">
                          {result.bridgeBtcAddress ? (
                            <a
                              href={`${getApiEndpoint().btc}/address/${result.bridgeBtcAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary"
                            >
                              {result.bridgeBtcAddress}
                            </a>
                          ) : (
                            <span className="text-muted">Not registered</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <th>
                          USDT Bridge Deposit
                          <div className="text-muted small fw-normal">t.libre · account {result.account}</div>
                        </th>
                        <td className="font-monospace">
                          {result.ethAddress ? (
                            <a
                              href={`${getApiEndpoint().etherscan}/address/${result.ethAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary"
                            >
                              {result.ethAddress}
                            </a>
                          ) : (
                            <span className="text-muted">Not registered</span>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <th>
                          Vault Collateral (BTC)
                          <div className="text-muted small fw-normal">
                            {result.hasVault ? `v.libre · vault ${result.vault}` : 'v.libre · no vault'}
                          </div>
                        </th>
                        <td className="font-monospace">
                          {result.vaultBtcAddress ? (
                            <a
                              href={`${getApiEndpoint().btc}/address/${result.vaultBtcAddress}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary"
                            >
                              {result.vaultBtcAddress}
                            </a>
                          ) : (
                            <span className="text-muted">No vault</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              </div>

              {!result.hasVault && (
                <Alert variant="info" className="mb-4">
                  This account has no vault, so there is no collateral or loan to display.
                </Alert>
              )}

              {/* Vault balances + sync status - only when the account has a vault */}
              {result.hasVault && (
                <div className="card mb-4">
                  <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                    <h5 className="mb-0">Vault Status</h5>
                    <Badge bg={result.vaultSyncStatus === "IN SYNC" ? "success" : "warning"} className="fs-6">
                      {result.vaultSyncStatus === "IN SYNC" ? (
                        <><i className="bi bi-check-circle me-1"></i>In Sync</>
                      ) : (
                        <><i className="bi bi-hourglass-split me-1"></i>Pending Sync</>
                      )}
                    </Badge>
                  </div>
                  <div className="card-body">
                    <Table striped bordered hover responsive className="mb-0">
                      <tbody>
                        <tr>
                          <th style={{width: '200px'}}>Vault</th>
                          <td>
                            <a
                              href={`${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/account/${result.vault}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary"
                            >
                              {result.vault}
                            </a>
                          </td>
                        </tr>
                        <tr>
                          <th>BTC Balance (on-chain)</th>
                          <td>{result.btcBalance.toFixed(8)} BTC</td>
                        </tr>
                        <tr>
                          <th>Collateral Balance (CBTC)</th>
                          <td>{result.cbtcBalance.toFixed(8)} BTC</td>
                        </tr>
                      </tbody>
                    </Table>
                  </div>
                </div>
              )}

              {result.hasVault && (
              <div className="card">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">Loan Information</h5>
                </div>
                <div className="card-body">
                  {result.hasLoan ? (
                    <Table striped bordered hover responsive>
                      <tbody>
                        <tr>
                          <th style={{width: '200px'}}>Loan ID</th>
                          <td>{result.loanInfo.id}</td>
                        </tr>
                        <tr>
                          <th>Loan State</th>
                          <td>{renderLoanStatus(result.loanInfo.status)}</td>
                        </tr>
                        <tr>
                          <th>Initial Amount</th>
                          <td>{formatUSDT(result.loanInfo.initial_amount)}</td>
                        </tr>
                        <tr>
                          <th>Outstanding Amount</th>
                          <td>{formatUSDT(result.loanInfo.outstanding_amount)}</td>
                        </tr>
                        <tr>
                          <th>Collateral Value</th>
                          <td>${formatNumber(result.collateralValue.toFixed(2))}</td>
                        </tr>
                        <tr>
                          <th>Loan-to-Value (LTV)</th>
                          <td>{formatNumber(result.ltv.toFixed(2))}%</td>
                        </tr>
                        <tr>
                          <th>APR</th>
                          <td>{(result.loanInfo.terms.apr / 100).toFixed(2)}%</td>
                        </tr>
                        <tr>
                          <th>Start Date</th>
                          <td>{new Date(result.loanInfo.start_time).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </Table>
                  ) : (
                    <Alert variant="info" className="mb-0">
                      No active loan found for this account.
                    </Alert>
                  )}
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

export default VaultChecker;
