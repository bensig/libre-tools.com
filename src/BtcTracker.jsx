import React, { useState } from 'react';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import NetworkSelector from './components/NetworkSelector';

const isValidHash = (hash) => {
  // Bitcoin and Libre transaction hashes are 64 character hex strings
  const hashRegex = /^[0-9a-fA-F]{64}$/;
  return hashRegex.test(hash);
};

const truncateHash = (hash) => {
  if (!hash) return '';
  return `${hash.slice(0, 4)}-${hash.slice(-4)}`;
};

const truncateAddress = (address) => {
  if (!address) return '';
  return `${address.slice(0, 5)}-${address.slice(-5)}`;
};

const BtcTracker = () => {
  const [hash, setHash] = useState('');
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
      libre: 'https://test.libre.eosusa.io',
      btc: 'https://mempool.space/signet'
    }
  };

  const getApiEndpoint = () => {
    if (network === 'custom') {
      if (!customEndpoint) {
        throw new Error('Custom endpoint is required');
      }
      return formatEndpoint(customEndpoint);
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

  const handleHashChange = (e) => {
    const value = e.target.value;
    setHash(value);
    
    if (value && !isValidHash(value)) {
      setError('Please enter a valid transaction hash (64 characters, hexadecimal)');
    } else {
      setError(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hash) return;

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const baseEndpoint = getApiEndpoint();

      // Check both Libre and BTC simultaneously
      const [libreResponse, btcResponse] = await Promise.all([
        // Try Libre transaction
        fetch(`${baseEndpoint.libre}/v1/history/get_transaction`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: hash,
            block_num_hint: 0
          })
        }).catch(err => ({ ok: false, error: err })),

        // Try BTC transaction
        fetch(`${baseEndpoint.btc}/api/tx/${hash}`).catch(err => ({ ok: false, error: err }))
      ]);

      // Check if it's a Libre transaction
      if (libreResponse.ok) {
        const libreData = await libreResponse.json();
        if (libreData.traces && libreData.traces.length > 0) {
          // Find transfer action to x.libre in traces
          const transferTrace = libreData.traces.find(trace => 
            trace.act.name === 'transfer' && 
            trace.act.account === 'btc.libre' &&
            trace.act.data && 
            trace.act.data.to === 'x.libre' &&
            trace.act.data.memo
          );

          if (transferTrace) {
            const { data } = transferTrace.act;
            const btcAddress = data.memo;
            const amount = data.quantity;

            // Check all scopes (completed, pending, canceled) for this transaction
            const scopes = ['completed', 'pending', 'canceled'];
            let matchingTx = null;
            let txStatus = null;

            for (const scope of scopes) {
              const tableResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  code: 'x.libre',
                  scope: scope,
                  table: 'ptxhistory',
                  json: true,
                  limit: 1000
                })
              });

              const tableData = await tableResponse.json();
              const foundTx = tableData.rows.find(row => 
                row.to === btcAddress && 
                parseFloat(row.quantity) === parseFloat(amount)
              );

              if (foundTx) {
                matchingTx = foundTx;
                txStatus = scope;
                break;
              }
            }

            if (matchingTx) {
              setResult({
                type: 'peg-out',
                status: txStatus, // Will be 'completed', 'pending', or 'canceled'
                libreHash: hash,
                btcHash: matchingTx.btc_hash,
                amount: amount,
                btcAddress: btcAddress,
                from: data.from,
                blockTime: transferTrace.block_time,
                cancelReason: txStatus === 'canceled' ? matchingTx.cancel_reason : null
              });

              // Set appropriate error message for canceled transactions
              if (txStatus === 'canceled') {
                setError(`Transaction was canceled${matchingTx.cancel_reason ? `: ${matchingTx.cancel_reason}` : ''}`);
              }
            } else {
              setResult({
                type: 'peg-out',
                status: 'new', // Changed from 'pending' to 'new' for more clarity
                libreHash: hash,
                amount: amount,
                btcAddress: btcAddress,
                from: data.from,
                blockTime: transferTrace.block_time
              });
            }
            return; // Exit after finding result
          }
        }
      }

      // Check if it's a BTC transaction
      if (btcResponse.ok) {
        const btcTx = await btcResponse.json();
        console.log('BTC Transaction:', btcTx);
        
        // First get the x.libre account for this BTC address
        const accountsResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: 'x.libre',
            scope: 'x.libre',
            table: 'accounts',
            json: true,
            limit: 1000
          })
        });

        const accountsData = await accountsResponse.json();
        let matchingAccount = accountsData.rows.find(row => row.btc_address === btcTx.vout[0].scriptpubkey_address);
        let isVaultTx = false;

        if (!matchingAccount) {
          // Check v.libre if account not found in x.libre
          const vaultAccountsResponse = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: 'v.libre',
              scope: 'v.libre',
              table: 'accounts',
              json: true,
              limit: 1000
            })
          });

          const vaultAccountsData = await vaultAccountsResponse.json();
          matchingAccount = vaultAccountsData.rows.find(row => row.btc_address === btcTx.vout[0].scriptpubkey_address);
          if (matchingAccount) {
            isVaultTx = true;
          }
        }

        if (matchingAccount) {
          // Calculate date range (current tx time + 7 days)
          const txTimestamp = new Date(btcTx.status.block_time * 1000);
          const endDate = new Date(txTimestamp);
          endDate.setDate(endDate.getDate() + 7);

          // Get account history for transfers received from btc.libre or cbtc.libre within date range
          const accountResponse = await fetch(`${baseEndpoint.libre}/v1/history/get_actions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              account_name: matchingAccount.account,
              pos: -1,
              offset: -1000,
              filter: isVaultTx ? "cbtc.libre:transfer" : "btc.libre:transfer",
              after: txTimestamp.toISOString(),
              before: endDate.toISOString()
            })
          });

          const accountData = await accountResponse.json();
          console.log('BTC Transaction Time:', txTimestamp.toISOString());
          console.log('Search End Time:', endDate.toISOString());
          console.log('Account Actions:', accountData);

          // Convert satoshis to BTC
          const btcAmount = (btcTx.vout[0].value / 100000000).toFixed(8);

          // Find all matching transfers by amount
          const matchingActions = accountData.actions?.filter(action => {
            const actionData = action.action_trace.act.data;
            return action.action_trace.act.name === 'transfer' && 
                   action.action_trace.act.account === (isVaultTx ? 'cbtc.libre' : 'btc.libre') &&
                   actionData.to === matchingAccount.account &&
                   parseFloat(actionData.quantity.split(' ')[0]) === parseFloat(btcAmount);
          });

          // Sort by block time and get earliest match
          if (matchingActions && matchingActions.length > 0) {
            const earliestMatch = matchingActions.sort((a, b) => 
              new Date(a.block_time) - new Date(b.block_time)
            )[0];

            setResult({
              type: 'peg-in',
              status: 'completed',
              btcHash: hash,
              libreHash: earliestMatch.action_trace.trx_id,
              amount: earliestMatch.action_trace.act.data.quantity,
              libreAccount: matchingAccount.account,
              btcTimestamp: new Date(btcTx.status.block_time * 1000).toLocaleString(),
              libreTimestamp: new Date(earliestMatch.block_time).toLocaleString(),
              isVaultTx: isVaultTx
            });
          } else {
            setResult({
              type: 'peg-in',
              status: 'pending',
              btcHash: hash,
              amount: btcAmount + (isVaultTx ? ' CBTC' : ' BTC'),
              libreAccount: matchingAccount.account,
              btcTimestamp: new Date(btcTx.status.block_time * 1000).toLocaleString(),
              isVaultTx: isVaultTx
            });
            setError('Matching Libre transaction not found yet - transaction may be pending');
          }
        } else {
          setError('Bitcoin address not found in x.libre or v.libre accounts');
        }
      }

      // If neither was successful, show error
      if (!libreResponse.ok && !btcResponse.ok) {
        setError('Transaction not found on either Libre or Bitcoin networks');
      }

    } catch (err) {
      console.error('Error:', err);
      setError(err.message || 'Error processing transaction');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-end" style={{ marginRight: '20%' }}>
        <div style={{ width: '100%' }}>
          <h2 className="text-3xl font-bold mb-6">Bitcoin Transaction Tracker</h2>
          
          <div className="alert alert-info mb-4 d-flex">
            <i className="bi bi-info-circle me-2"></i>
            <div>
              Track the status of Bitcoin peg-in and peg-out transactions. 
              <br />
              Enter either a Libre transaction hash (for peg-outs) or a Bitcoin transaction hash (for peg-ins).
            </div>
          </div>

          <Form className="mb-4">
            <Form.Group className="mb-3" style={{ maxWidth: '300px' }}>
              <NetworkSelector
                network={network}
                setNetwork={setNetwork}
                customEndpoint={customEndpoint}
                setCustomEndpoint={setCustomEndpoint}
                customEndpointError={customEndpointError}
                setCustomEndpointError={setCustomEndpointError}
              />
            </Form.Group>

            <Form.Group className="mb-3" style={{ maxWidth: '650px' }}>
              <Form.Label>Transaction Hash</Form.Label>
              <div className="d-flex gap-2">
                <Form.Control
                  type="text"
                  value={hash}
                  onChange={handleHashChange}
                  placeholder="Enter Libre or Bitcoin transaction hash"
                  autoFocus
                  isInvalid={hash && !isValidHash(hash)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && isValidHash(hash)) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <Button 
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={isLoading || !hash || !isValidHash(hash)}
                >
                  {isLoading ? <Spinner size="sm" /> : 'Track'}
                </Button>
              </div>
              {hash && !isValidHash(hash) && (
                <Form.Text className="text-danger">
                  Transaction hash must be 64 hexadecimal characters
                </Form.Text>
              )}
            </Form.Group>
          </Form>

          {error && (
            <div className="alert alert-danger mb-4">
              {error}
            </div>
          )}

          {result && (
            <div className="bg-light p-4 rounded mb-4">
              <h3 className="text-xl font-bold mb-3">Transaction Details</h3>
              <div className="space-y-2">
                <p><strong>Type:</strong> {result.type === 'peg-in' ? 'Bitcoin → Libre' : 'Libre → Bitcoin'}</p>
                <p><strong>Status:</strong>{' '}
                  <span className={`badge ${
                    result.status === 'completed' ? 'bg-success' : 
                    result.status === 'pending' ? 'bg-warning' :
                    result.status === 'canceled' ? 'bg-danger' :
                    'bg-secondary'
                  }`}>
                    {result.status.charAt(0).toUpperCase() + result.status.slice(1)}
                  </span>
                </p>
                <p><strong>Amount:</strong> {result.amount}</p>
                
                {result.type === 'peg-out' ? (
                  <>
                    {result.libreHash && (
                      <p>
                        <strong>Libre Hash:</strong>{' '}
                        <a 
                          href={`https://explorer.libre.org/tx/${result.libreHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {truncateHash(result.libreHash)}
                        </a>
                        {(result.libreTimestamp || result.blockTime) && (
                          <span className="text-muted ms-2">
                            ({result.libreTimestamp || new Date(result.blockTime).toLocaleString()})
                          </span>
                        )}
                      </p>
                    )}
                    
                    {result.btcHash && (
                      <p>
                        <strong>Bitcoin Hash:</strong>{' '}
                        <a 
                          href={`${getApiEndpoint().btc}/tx/${result.btcHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {truncateHash(result.btcHash)}
                        </a>
                        {result.btcTimestamp && <span className="text-muted ms-2">({result.btcTimestamp})</span>}
                      </p>
                    )}
                    
                    {result.btcAddress && (
                      <p>
                        <strong>Destination Bitcoin Address:</strong>{' '}
                        <a 
                          href={`${getApiEndpoint().btc}/address/${result.btcAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {truncateAddress(result.btcAddress)}
                        </a>
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {result.btcHash && (
                      <p>
                        <strong>Bitcoin Hash:</strong>{' '}
                        <a 
                          href={`${getApiEndpoint().btc}/tx/${result.btcHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {truncateHash(result.btcHash)}
                        </a>
                        {result.btcTimestamp && <span className="text-muted ms-2">({result.btcTimestamp})</span>}
                      </p>
                    )}
                    
                    {result.libreHash && (
                      <p>
                        <strong>Libre Hash:</strong>{' '}
                        <a 
                          href={`https://explorer.libre.org/tx/${result.libreHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {truncateHash(result.libreHash)}
                        </a>
                        {result.libreTimestamp && <span className="text-muted ms-2">({result.libreTimestamp})</span>}
                      </p>
                    )}
                    
                    {result.libreAccount && (
                      <p>
                        <strong>Destination Libre Account:</strong>{' '}
                        <a 
                          href={`https://explorer.libre.org/address/${result.libreAccount}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {result.libreAccount}
                        </a>
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BtcTracker; 