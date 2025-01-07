import React, { useState } from 'react';
import { Form, Button, Alert, Spinner } from 'react-bootstrap';
import NetworkSelector from './components/NetworkSelector';

const isValidHash = (hash) => {
  // Bitcoin and Libre transaction hashes are 64 character hex strings
  const hashRegex = /^[0-9a-fA-F]{64}$/;
  return hashRegex.test(hash);
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
    mainnet: 'https://lb.libre.org',
    testnet: 'https://testnet.libre.org',
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

      // First try to get transaction from Libre
      const libreResponse = await fetch(`${baseEndpoint}/v1/history/get_transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: hash,
          block_num_hint: 0
        })
      });

      const libreData = await libreResponse.json();

      if (libreData.traces && libreData.traces.length > 0) {
        // Find transfer action in traces
        const transferTrace = libreData.traces.find(trace => 
          trace.act.name === 'transfer' && 
          trace.act.data && 
          trace.act.data.memo
        );

        if (transferTrace) {
          const { data } = transferTrace.act;
          const btcAddress = data.memo.match(/[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[ac-hj-np-zAC-HJ-NP-Z02-9]{11,71}/);
          const amount = data.quantity.split(' ')[0];

          if (btcAddress) {
            // Check ptxhistory table for this address and amount
            const tableResponse = await fetch(`${baseEndpoint}/v1/chain/get_table_rows`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: 'x.libre',
                scope: 'completed',
                table: 'ptxhistory',
                json: true,
                limit: 1000
              })
            });

            const tableData = await tableResponse.json();
            const matchingTx = tableData.rows.find(row => 
              row.to === btcAddress[0] && 
              parseFloat(row.quantity) === parseFloat(amount)
            );

            if (matchingTx) {
              setResult({
                type: 'peg-out',
                status: 'completed',
                libreHash: hash,
                btcHash: matchingTx.btc_hash,
                amount: amount,
                btcAddress: btcAddress[0],
                from: data.from,
                blockTime: transferTrace.block_time
              });
            } else {
              setResult({
                type: 'peg-out',
                status: 'pending',
                libreHash: hash,
                amount: amount,
                btcAddress: btcAddress[0],
                from: data.from,
                blockTime: transferTrace.block_time
              });
            }
            return; // Exit after finding result
          }
        }
      } else {
        // Check if this is a Bitcoin hash
        try {
          const mempoolResponse = await fetch(`https://mempool.space/api/tx/${hash}`);
          if (mempoolResponse.ok) {
            const btcTx = await mempoolResponse.json();
            console.log('BTC Transaction:', btcTx);
            
            // First get the x.libre account for this BTC address
            const accountsResponse = await fetch(`${baseEndpoint}/v1/chain/get_table_rows`, {
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
            const matchingAccount = accountsData.rows.find(row => row.btc_address === btcTx.vout[0].scriptpubkey_address);

            if (matchingAccount) {
              // Calculate date range (current tx time + 7 days)
              const txTimestamp = new Date(btcTx.status.block_time * 1000);
              const endDate = new Date(txTimestamp);
              endDate.setDate(endDate.getDate() + 7);

              // Get account history for transfers received from btc.libre within date range
              const accountResponse = await fetch(`${baseEndpoint}/v1/history/get_actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  account_name: matchingAccount.account,
                  pos: -1,
                  offset: -1000,
                  filter: "btc.libre:transfer",
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
                       action.action_trace.act.account === 'btc.libre' &&
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
                  libreTimestamp: new Date(earliestMatch.block_time).toLocaleString()
                });
              } else {
                setResult({
                  type: 'peg-in',
                  status: 'pending',
                  btcHash: hash,
                  amount: btcAmount + ' BTC',
                  libreAccount: matchingAccount.account,
                  btcTimestamp: new Date(btcTx.status.block_time * 1000).toLocaleString()
                });
                setError('Matching Libre transaction not found yet - transaction may be pending');
              }
            } else {
              setError('Bitcoin address not found in x.libre accounts');
            }
          } else {
            setError('Bitcoin transaction not found on mempool.space');
          }
        } catch (err) {
          console.error('Error fetching from mempool.space:', err);
          setError('Error fetching Bitcoin transaction details');
        }
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
        <div style={{ maxWidth: '800px', width: '100%' }}>
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
                <p><strong>Status:</strong> <span className={`badge ${result.status === 'completed' ? 'bg-success' : 'bg-warning'}`}>{result.status}</span></p>
                <p><strong>Amount:</strong> {result.amount}</p>
                
                {result.type === 'peg-out' ? (
                  // Peg-out order: Libre Hash, Bitcoin Hash, Bitcoin Address
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
                          {result.libreHash}
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
                          href={`https://mempool.space/tx/${result.btcHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {result.btcHash}
                        </a>
                        {result.btcTimestamp && <span className="text-muted ms-2">({result.btcTimestamp})</span>}
                      </p>
                    )}
                    
                    {result.btcAddress && (
                      <p>
                        <strong>Destination Bitcoin Address:</strong>{' '}
                        <a 
                          href={`https://mempool.space/address/${result.btcAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {result.btcAddress}
                        </a>
                      </p>
                    )}
                  </>
                ) : (
                  // Keep original order for peg-in
                  <>
                    {result.btcHash && (
                      <p>
                        <strong>Bitcoin Hash:</strong>{' '}
                        <a 
                          href={`https://mempool.space/tx/${result.btcHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary-dark"
                        >
                          {result.btcHash}
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
                          {result.libreHash}
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