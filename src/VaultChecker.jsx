import React, { useState, useEffect } from 'react';
import { Form, Button, Alert, Spinner, Table } from 'react-bootstrap';
import NetworkSelector from './components/NetworkSelector';

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
      btc: 'https://mempool.space'
    },
    testnet: {
      libre: 'https://testnet.libre.org',
      btc: 'https://mempool.space/signet'
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
        btc: btcEndpoint
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
        // Searching by account name (owner field)
        requestBody.lower_bound = searchInput;
        requestBody.upper_bound = searchInput;
      } else {
        // Searching by vault name - need to scan since vault might be secondary index
        requestBody.limit = 10000;
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
        // Searching by account name
        vaultInfo = vaultData.rows.find(row => row.owner === searchInput);

        if (!vaultInfo) {
          setError(`No vault found for account: ${searchInput}`);
          setIsLoading(false);
          return;
        }

        accountName = searchInput;
        vaultAccount = vaultInfo.vault;
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

      // Step 2: Get the BTC address for this vault
      const btcAddressResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'v.libre',
          table: 'accounts',
          scope: 'v.libre',
          limit: 1,
          json: true,
          lower_bound: vaultAccount,
          upper_bound: vaultAccount
        })
      });

      if (!btcAddressResponse.ok) {
        throw new Error('Failed to fetch BTC address data');
      }

      const btcAddressData = await btcAddressResponse.json();
      
      if (!btcAddressData.rows || btcAddressData.rows.length === 0) {
        setError(`No BTC address found for vault: ${vaultAccount}`);
        setIsLoading(false);
        return;
      }

      const btcAddress = btcAddressData.rows[0].btc_address;

      // Step 3: Get the BTC balance from mempool
      const btcBalanceResponse = await fetch(`${baseEndpoint.btc}/api/address/${btcAddress}`);
      
      let btcBalance = 0;
      if (btcBalanceResponse.ok) {
        const btcBalanceData = await btcBalanceResponse.json();
        btcBalance = btcBalanceData.chain_stats.funded_txo_sum - btcBalanceData.chain_stats.spent_txo_sum;
        // Convert from satoshis to BTC
        btcBalance = btcBalance / 100000000;
      } else {
        console.warn('Failed to fetch BTC balance from mempool');
      }

      // Step 4: Get the CBTC balance on Libre (displayed as Collateral Balance with BTC symbol)
      const cbtcBalanceResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_currency_balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'cbtc.libre',
          account: vaultAccount,
          symbol: 'CBTC'
        })
      });

      let cbtcBalance = 0;
      if (cbtcBalanceResponse.ok) {
        const cbtcBalanceData = await cbtcBalanceResponse.json();
        if (cbtcBalanceData && cbtcBalanceData.length > 0) {
          cbtcBalance = parseFloat(cbtcBalanceData[0].split(' ')[0]);
        }
      } else {
        console.warn('Failed to fetch CBTC balance');
      }

      // Step 5: Check if there's a loan for this account
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

      // Step 6: Get BTC price from Chainlink price feed or oracle
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
        if (btcPriceData.rows && btcPriceData.rows.length > 0) {
          // Find the btcusd pair
          const btcUsdPair = btcPriceData.rows.find(row => row.pair === 'btcusd');
          if (btcUsdPair) {
            btcPrice = parseFloat(btcUsdPair.price);
          }
        }
      } else {
        console.warn(`Failed to fetch BTC price from ${oracleCode}`);
        
        // Fallback to oracle.libre if Chainlink fails
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

      // Calculate collateral value and LTV if there's a loan
      let collateralValue = 0;
      let ltv = 0;
      
      if (loanInfo && btcPrice > 0) {
        collateralValue = cbtcBalance * btcPrice;
        
        // Extract the outstanding amount
        const outstandingAmount = parseFloat(loanInfo.outstanding_amount.split(' ')[0]);
        
        if (collateralValue > 0) {
          ltv = (outstandingAmount / collateralValue) * 100;
        }
      }

      // Determine vault sync status
      const vaultSyncStatus = Math.abs(btcBalance - cbtcBalance) < 0.00000001 ? "IN SYNC" : "PENDING";

      // Prepare the result
      setResult({
        account: accountName,
        vault: vaultAccount,
        btcAddress,
        btcBalance,
        cbtcBalance,
        vaultSyncStatus,
        hasLoan: !!loanInfo,
        loanInfo,
        collateralValue,
        ltv,
        btcPrice
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
          <h2 className="mb-4">Vault Checker</h2>
          
          <div className="alert alert-info mb-4">
            <i className="bi bi-info-circle me-2"></i>
            Check vault information for Libre accounts. View vault balances, sync status, loan details, and collateral values.
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
              <h5 className="mb-0">Search Vault</h5>
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
                        'Check Vault'
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
              <div className="card mb-4">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">Vault Information</h5>
                </div>
                <div className="card-body">
                  <Table striped bordered hover responsive>
                    <tbody>
                      <tr>
                        <th style={{width: '200px'}}>Libre Account</th>
                        <td>
                          <a 
                            href={`${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/account/${result.account}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary"
                          >
                            {result.account}
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <th>Vault</th>
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
                        <th>BTC Address</th>
                        <td>
                          <a 
                            href={`${getApiEndpoint().btc}/address/${result.btcAddress}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary"
                          >
                            {result.btcAddress}
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <th>BTC Balance</th>
                        <td>{result.btcBalance.toFixed(8)} BTC</td>
                      </tr>
                      <tr>
                        <th>Collateral Balance</th>
                        <td>{result.cbtcBalance.toFixed(8)} BTC</td>
                      </tr>
                      <tr>
                        <th>Vault State</th>
                        <td>
                          <span className={result.vaultSyncStatus === "IN SYNC" ? "text-success fw-bold" : "text-warning fw-bold"}>
                            {result.vaultSyncStatus}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </Table>
                </div>
              </div>

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
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default VaultChecker;
