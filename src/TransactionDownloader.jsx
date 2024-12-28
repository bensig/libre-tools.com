import { useState } from 'react';
import { Form, Button } from 'react-bootstrap';

export default function TransactionDownloader() {
  const [network, setNetwork] = useState('https://lb.libre.org');
  const [showCustomEndpoint, setShowCustomEndpoint] = useState(false);
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [account, setAccount] = useState('');
  const [afterDate, setAfterDate] = useState('');
  const [beforeDate, setBeforeDate] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [contract, setContract] = useState('');
  const [action, setAction] = useState('');

  return (
    <div className="row">
      <div className="col-md-4 mb-4">
        <Form>
          <Form.Group className="mb-3">
            <Form.Label>1. Choose Network:</Form.Label>
            <Form.Select 
              value={network}
              onChange={(e) => {
                setNetwork(e.target.value);
                setShowCustomEndpoint(e.target.value === 'custom');
              }}
            >
              <option value="https://lb.libre.org">Mainnet</option>
              <option value="https://testnet.libre.org">Testnet</option>
              <option value="custom">Custom Endpoint</option>
            </Form.Select>
            {showCustomEndpoint && (
              <Form.Control
                type="text"
                placeholder="Enter custom API endpoint URL"
                className="mt-2"
                value={customEndpoint}
                onChange={(e) => setCustomEndpoint(e.target.value)}
              />
            )}
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>2. Enter Libre Account:</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g., bank.libre"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>3. Choose date range:</Form.Label>
            <div className="ms-3">
              <Form.Group className="mb-3">
                <Form.Label>Start:</Form.Label>
                <Form.Control
                  type="date"
                  value={afterDate}
                  onChange={(e) => setAfterDate(e.target.value)}
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>End:</Form.Label>
                <Form.Control
                  type="date"
                  value={beforeDate}
                  onChange={(e) => setBeforeDate(e.target.value)}
                />
              </Form.Group>
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Check
              type="checkbox"
              label="4. (Optional) Filter by specific contract and action:"
              checked={showFilter}
              onChange={(e) => setShowFilter(e.target.checked)}
            />
            {showFilter && (
              <div className="ms-3 mt-2">
                <Form.Group className="mb-3">
                  <Form.Label>Contract:</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., btc.ptokens"
                    value={contract}
                    onChange={(e) => setContract(e.target.value)}
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Action:</Form.Label>
                  <Form.Control
                    type="text"
                    placeholder="e.g., transfer"
                    value={action}
                    onChange={(e) => setAction(e.target.value)}
                  />
                </Form.Group>
              </div>
            )}
          </Form.Group>

          <Button variant="primary" type="submit">
            Submit
          </Button>
        </Form>
      </div>
      
      <div className="col-md-8">
        <div id="summary">
          {/* Summary content will be added here */}
        </div>
        <div id="result">
          {/* Results will be added here */}
        </div>
      </div>
    </div>
  );
} 