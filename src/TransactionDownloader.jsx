import React, { useState } from 'react';
import { Form, Button, Alert } from 'react-bootstrap';

export default function TransactionDownloader() {
  const [formData, setFormData] = useState({
    account: '',
    beforeDate: '',
    afterDate: '',
    filterContractAction: false,
    contract: '',
    action: '',
    network: 'mainnet',
    customEndpoint: ''
  });
  
  const [downloadData, setDownloadData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showJsonData, setShowJsonData] = useState(false);

  const NETWORK_ENDPOINTS = {
    mainnet: 'https://lb.libre.org',
    testnet: 'https://testnet.libre.org',
  };

  const formatEndpoint = (url) => {
    let cleanUrl = url.trim().replace(/\/$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    return cleanUrl;
  };

  const fetchData = async (url, skip = 0, formattedData = []) => {
    try {
      const response = await fetch(`${url}&skip=${skip * 1000}`);
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
        return fetchData(url, skip + 1, newFormattedData);
      }

      return newFormattedData;
    } catch (error) {
      throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(false);
    setDownloadData(null);

    try {
      let baseEndpoint;
      if (formData.network === 'custom') {
        if (!formData.customEndpoint) {
          throw new Error('Custom endpoint is required');
        }
        baseEndpoint = formatEndpoint(formData.customEndpoint);
      } else {
        baseEndpoint = NETWORK_ENDPOINTS[formData.network];
      }

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

      let url = `${baseEndpoint}/v2/history/get_actions?limit=1000&account=${formData.account}`;
      if (afterDate) url += `&after=${afterDate}`;
      if (beforeDate) url += `&before=${beforeDate}`;
      if (formData.filterContractAction && formData.contract && formData.action) {
        url += `&filter=${formData.contract}%3A${formData.action}`;
      }

      console.log('Fetching from URL:', url);

      const formattedData = await fetchData(url);
      
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

  return (
    <div className="container-fluid">
      <div className="row justify-content-center">
        <div className="col-12 col-md-8 col-lg-6">
          <h2 className="text-center mb-4">Libre Transaction Downloader</h2>
          
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3">
              <Form.Label>Network</Form.Label>
              <Form.Select
                value={formData.network}
                onChange={(e) => setFormData({
                  ...formData,
                  network: e.target.value,
                  customEndpoint: e.target.value === 'custom' ? '' : formData.customEndpoint
                })}
              >
                <option value="mainnet">Mainnet</option>
                <option value="testnet">Testnet</option>
                <option value="custom">Custom Endpoint</option>
              </Form.Select>
            </Form.Group>

            {formData.network === 'custom' && (
              <Form.Group className="mb-3">
                <Form.Label>Custom Endpoint</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Enter API endpoint (e.g., api.example.com)"
                  value={formData.customEndpoint}
                  onChange={(e) => setFormData({...formData, customEndpoint: e.target.value})}
                />
                <Form.Text className="text-muted">
                  HTTPS will be used by default if protocol is not specified
                </Form.Text>
              </Form.Group>
            )}

            <Form.Group className="mb-3">
              <Form.Label>Account</Form.Label>
              <Form.Control
                type="text"
                value={formData.account}
                onChange={e => setFormData({...formData, account: e.target.value})}
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>After Date</Form.Label>
              <Form.Control
                type="date"
                value={formData.afterDate}
                onChange={e => setFormData({...formData, afterDate: e.target.value})}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Before Date</Form.Label>
              <Form.Control
                type="date"
                value={formData.beforeDate}
                onChange={e => setFormData({...formData, beforeDate: e.target.value})}
              />
            </Form.Group>

            <Form.Check
              type="checkbox"
              label="Filter by Contract/Action"
              checked={formData.filterContractAction}
              onChange={e => setFormData({...formData, filterContractAction: e.target.checked})}
              className="mb-3"
            />

            {formData.filterContractAction && (
              <div className="mb-3">
                <Form.Group className="mb-3">
                  <Form.Label>Contract</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.contract}
                    onChange={e => setFormData({...formData, contract: e.target.value})}
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Action</Form.Label>
                  <Form.Control
                    type="text"
                    value={formData.action}
                    onChange={e => setFormData({...formData, action: e.target.value})}
                  />
                </Form.Group>
              </div>
            )}

            <div className="d-grid gap-2">
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Loading...' : 'Submit'}
              </Button>
            </div>
          </Form>

          {error && (
            <Alert variant="danger" className="mt-4">
              {error}
            </Alert>
          )}

          {downloadData && (
            <div className="mt-4">
              <h4 className="mb-3">Results</h4>
              <p className="mb-3">Total Transactions: {downloadData.totalTransactions}</p>
              
              <div className="mb-3">
                <h5>Sent Amounts:</h5>
                <pre className="bg-light p-3 rounded">
                  {JSON.stringify(downloadData.sentAmounts, null, 2)}
                </pre>
              </div>
              
              <div className="mb-3">
                <h5>Received Amounts:</h5>
                <pre className="bg-light p-3 rounded">
                  {JSON.stringify(downloadData.receivedAmounts, null, 2)}
                </pre>
              </div>

              <div className="d-flex gap-2">
                <Button onClick={handleDownload} variant="primary">
                  Download CSV
                </Button>

                <Button 
                  onClick={() => setShowJsonData(!showJsonData)} 
                  variant="outline-secondary"
                >
                  {showJsonData ? 'Hide Data' : 'Show Data'}
                </Button>
              </div>

              {showJsonData && (
                <div className="mt-3">
                  <pre className="bg-light p-3 rounded" style={{ maxHeight: '400px', overflow: 'auto' }}>
                    {JSON.stringify(downloadData.transactions, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 