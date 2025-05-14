import React, { useState } from 'react';
import { Form, Button, Alert } from 'react-bootstrap';
import NetworkSelector from './components/NetworkSelector';

export default function TransactionDownloader() {
  // Get today and yesterday's dates in YYYY-MM-DD format
  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    account: '',
    beforeDate: today,
    afterDate: yesterday,
    filterContractAction: false,
    contract: '',
    action: ''
  });
  
  const [downloadData, setDownloadData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showJsonData, setShowJsonData] = useState(false);
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

  const fetchData = async (url, network, skip = 0, formattedData = []) => {
    try {
      const baseEndpoint = network === 'custom' 
        ? formatEndpoint(customEndpoint)
        : NETWORK_ENDPOINTS[network];
      
      console.log('Using endpoint:', baseEndpoint, 'Network:', network);
      
      const response = await fetch(`${baseEndpoint}${url}&skip=${skip * 1000}`);
      const data = await response.json();
      
      const newFormattedData = formattedData.concat(
        data.actions.map(action => ({
          Date: action.timestamp,
          Sender: action.act.data.from,
          Recipient: action.act.data.to,
          Quantity: action.act.data.quantity,
          Memo: action.act.data.memo,
          'Transaction ID': action.trx_id,
        }))
      );

      if (data.actions.length === 1000) {
        return fetchData(url, network, skip + 1, newFormattedData);
      }

      return newFormattedData;
    } catch (error) {
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setDownloadData(null);

    try {
      if (formData.afterDate && formData.beforeDate && 
          new Date(formData.afterDate) >= new Date(formData.beforeDate)) {
        throw new Error('After Date must be earlier than Before Date');
      }

      const beforeDate = formData.beforeDate 
        ? new Date(formData.beforeDate).toISOString().split('T')[0] + 'T00:00:00Z'
        : '';
      const afterDate = formData.afterDate
        ? new Date(formData.afterDate).toISOString().split('T')[0] + 'T00:00:00Z'
        : '';

      let url = `/v2/history/get_actions?limit=1000&account=${formData.account}`;
      if (afterDate) url += `&after=${afterDate}`;
      if (beforeDate) url += `&before=${beforeDate}`;
      if (formData.filterContractAction && formData.contract && formData.action) {
        url += `&filter=${formData.contract}%3A${formData.action}`;
      }

      console.log('Fetching from URL:', url);

      const formattedData = await fetchData(url, network);
      
      const { sentAmounts, receivedAmounts } = calculateTotals(formattedData, formData.account);
      
      setDownloadData({
        transactions: formattedData,
        sentAmounts,
        receivedAmounts,
        totalTransactions: formattedData.length
      });

    } catch (error) {
      console.error('Error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateTotals = (data, account) => {
    const sentAmounts = {};
    const receivedAmounts = {};

    data.forEach(action => {
      if (action.Quantity) {
        const [quantity, symbol] = action.Quantity.split(' ');
        const amount = parseFloat(quantity);

        if (!isNaN(amount) && symbol && /^[A-Za-z]+$/.test(symbol)) {
          if (action.Sender === account) {
            sentAmounts[symbol] = (sentAmounts[symbol] || 0) + amount;
          } else if (action.Recipient === account) {
            receivedAmounts[symbol] = (receivedAmounts[symbol] || 0) + amount;
          }
        }
      }
    });

    return { sentAmounts, receivedAmounts };
  };

  const handleDownload = () => {
    if (!downloadData?.transactions) return;

    const csv = [
      'Created by Libre validator Quantum - please vote for us on Libre.',
      'Date,Sender,Recipient,Quantity,Memo,Transaction ID',
      ...downloadData.transactions.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transactions.csv';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const validateAccountName = (account) => {
    const regex = /^[a-z1-5.]{1,12}$/;
    if (!regex.test(account)) {
      return false;
    }
    // Additional rules:
    // - Cannot start or end with a period
    // - Cannot have two consecutive periods
    if (account.startsWith('.') || account.endsWith('.') || account.includes('..')) {
      return false;
    }
    return true;
  };

  const handleNetworkChange = (newNetwork) => {
    setNetwork(newNetwork);
    if (formData.account) {
      const submitWithNewNetwork = async () => {
        try {
          setError(null);
          setLoading(true);
          setDownloadData(null);

          if (formData.afterDate && formData.beforeDate && 
              new Date(formData.afterDate) >= new Date(formData.beforeDate)) {
            throw new Error('After Date must be earlier than Before Date');
          }

          const beforeDate = formData.beforeDate 
            ? new Date(formData.beforeDate).toISOString().split('T')[0] + 'T00:00:00Z'
            : '';
          const afterDate = formData.afterDate
            ? new Date(formData.afterDate).toISOString().split('T')[0] + 'T00:00:00Z'
            : '';

          let url = `/v2/history/get_actions?limit=1000&account=${formData.account}`;
          if (afterDate) url += `&after=${afterDate}`;
          if (beforeDate) url += `&before=${beforeDate}`;
          if (formData.filterContractAction && formData.contract && formData.action) {
            url += `&filter=${formData.contract}%3A${formData.action}`;
          }

          console.log('Current network:', newNetwork);
          console.log('Fetching from URL:', url);

          const formattedData = await fetchData(url, newNetwork);
          
          const { sentAmounts, receivedAmounts } = calculateTotals(formattedData, formData.account);
          
          setDownloadData({
            transactions: formattedData,
            sentAmounts,
            receivedAmounts,
            totalTransactions: formattedData.length
          });

        } catch (error) {
          console.error('Error:', error);
          setError(error.message);
        } finally {
          setLoading(false);
        }
      };

      setTimeout(submitWithNewNetwork, 0);
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-end" style={{ marginRight: '20%' }}>
        <div style={{ width: '100%' }}>
          <h2 className="mb-4">Account History</h2>
          
          <div className="alert alert-info mb-4">
            <i className="bi bi-info-circle me-2"></i>
            Download account history for any Libre account. Filter by date range and specific contract actions.
          </div>

          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" style={{ maxWidth: '300px' }}>
              <NetworkSelector
                network={network}
                setNetwork={handleNetworkChange}
                customEndpoint={customEndpoint}
                setCustomEndpoint={setCustomEndpoint}
                customEndpointError={customEndpointError}
                setCustomEndpointError={setCustomEndpointError}
              />
            </Form.Group>

            <Form.Group className="mb-3" style={{ maxWidth: '300px' }}>
              <Form.Label>Account</Form.Label>
              <Form.Control
                type="text"
                value={formData.account}
                onChange={e => setFormData({...formData, account: e.target.value})}
                required
                autoFocus
                name="accountName"
                isInvalid={formData.account && !validateAccountName(formData.account)}
              />
              <Form.Control.Feedback type="invalid">
                Account must be exactly 12 characters using only a-z and 1-5
              </Form.Control.Feedback>
            </Form.Group>

            <div className="d-flex gap-3 mb-3">
              <Form.Group style={{ maxWidth: '200px' }}>
                <Form.Label>After Date</Form.Label>
                <Form.Control
                  type="date"
                  value={formData.afterDate}
                  onChange={e => setFormData({...formData, afterDate: e.target.value})}
                />
              </Form.Group>

              <Form.Group style={{ maxWidth: '200px' }}>
                <Form.Label>Before Date</Form.Label>
                <Form.Control
                  type="date"
                  value={formData.beforeDate}
                  onChange={e => setFormData({...formData, beforeDate: e.target.value})}
                />
              </Form.Group>
            </div>

            <Form.Check
              type="checkbox"
              label="Filter by Contract/Action"
              checked={formData.filterContractAction}
              onChange={e => setFormData({...formData, filterContractAction: e.target.checked})}
              className="mb-3"
            />

            {formData.filterContractAction && (
              <div className="d-flex gap-3 mb-3">
                <Form.Group style={{ maxWidth: '200px' }}>
                  <Form.Label>Contract</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.contract}
                    onChange={e => setFormData({...formData, contract: e.target.value})}
                  />
                </Form.Group>

                <Form.Group style={{ maxWidth: '200px' }}>
                  <Form.Label>Action</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.action}
                    onChange={e => setFormData({...formData, action: e.target.value})}
                  />
                </Form.Group>
              </div>
            )}

            <Button 
              type="submit" 
              variant="primary" 
              disabled={loading}
              style={{ width: 'auto' }}
            >
              {loading ? 'Loading...' : 'Submit'}
            </Button>
          </Form>

          {error && (
            <Alert variant="danger" className="mt-4">
              {error}
            </Alert>
          )}

          {downloadData && (
            <div className="card mt-4 bg-light">
              <div className="card-body">
                <h5 className="card-title mb-3">Results</h5>
                <p className="mb-3">Total Transactions: {downloadData.totalTransactions}</p>
                
                <div className="mb-3">
                  <h6>Sent Amounts:</h6>
                  <pre className="bg-white p-3 rounded">
                    {JSON.stringify(downloadData.sentAmounts, null, 2)}
                  </pre>
                </div>
                
                <div className="mb-3">
                  <h6>Received Amounts:</h6>
                  <pre className="bg-white p-3 rounded">
                    {JSON.stringify(downloadData.receivedAmounts, null, 2)}
                  </pre>
                </div>

                <Button 
                  variant="primary" 
                  onClick={handleDownload}
                  disabled={!downloadData?.transactions}
                >
                  Download CSV
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 