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
        
        // Function to find matching account in a table
        async function findMatchingAccount(code, btcAddress) {
          let lower_bound = "";  // Start with empty string to get from beginning
          const BATCH_SIZE = 1000;
          let searchedCount = 0;
          
          while (true) {
            console.log(`Searching ${code} accounts, batch starting from: ${lower_bound}, searched so far: ${searchedCount}`);
            
            const response = await fetch(`${baseEndpoint.libre}/v1/chain/get_table_rows`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: code,
                scope: code,
                table: 'accounts',
                json: true,
                limit: BATCH_SIZE,
                lower_bound: lower_bound
              })
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch ${code} accounts: ${response.statusText}`);
            }

            const data = await response.json();
            searchedCount += data.rows.length;
            
            // Check if the BTC address matches any account in this batch
            const account = data.rows.find(row => row.btc_address === btcAddress);
            if (account) {
              console.log(`Found matching account in ${code}: ${account.account}`);
              return account;
            }

            // If we've reached the end of the table or no more rows
            if (!data.more || data.rows.length === 0) {
              console.log(`Finished searching ${code}, total accounts checked: ${searchedCount}`);
              break;
            }

            // Get the last account name for the next iteration
            lower_bound = data.rows[data.rows.length - 1].account;
          }

          return null;
        }

        // Check all vouts for matching addresses
        let matchingAccount = null;
        let matchingVout = null;
        let isVaultTx = false;

        // First try x.libre with vout[0]
        try {
          console.log('Searching x.libre accounts for address:', btcTx.vout[0].scriptpubkey_address);
          const result = await findMatchingAccount('x.libre', btcTx.vout[0].scriptpubkey_address);
          if (result) {
            matchingAccount = result;
            matchingVout = btcTx.vout[0];
            isVaultTx = false;
          } else {
            // If not found in x.libre, try v.libre
            console.log('Searching v.libre accounts for address:', btcTx.vout[0].scriptpubkey_address);
            const vaultResult = await findMatchingAccount('v.libre', btcTx.vout[0].scriptpubkey_address);
            if (vaultResult) {
              matchingAccount = vaultResult;
              matchingVout = btcTx.vout[0];
              isVaultTx = true;
            }
          }
        } catch (error) {
          console.error('Error searching accounts:', error);
        }

        if (matchingAccount && matchingVout) {
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

          // Convert satoshis to BTC for the matching vout
          const btcAmount = (matchingVout.value / 100000000).toFixed(8);

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
              Track Bitcoin peg-in and peg-out transactions between Libre and Bitcoin networks.
            </div>
          </div>

          <Form onSubmit={handleSubmit}>
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
              <Form.Text className="text-muted">
                Example Peg-in: <span className="text-primary" style={{cursor: 'pointer'}} onClick={() => setHash('1eb56903cb898a104fc078adca4fb023a0ae3c43c647e898f5d730575909e3ed')}>1eb56903cb898a104fc078adca4fb023a0ae3c43c647e898f5d730575909e3ed</span>
                <br />
                Example Peg-out: <span className="text-primary" style={{cursor: 'pointer'}} onClick={() => setHash('8fa7dab0e27affdb9236cd90e0f2b9797b48a6dad9960ff1df8a1280c4dd66bc')}>8fa7dab0e27affdb9236cd90e0f2b9797b48a6dad9960ff1df8a1280c4dd66bc</span>
              </Form.Text>
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