import React from 'react';
import { Form } from 'react-bootstrap';

const NetworkSelector = ({ 
  network, 
  setNetwork, 
  customEndpoint, 
  setCustomEndpoint, 
  customEndpointError, 
  setCustomEndpointError 
}) => {
  const handleNetworkChange = (e) => {
    setNetwork(e.target.value);
    setCustomEndpointError('');
    if (e.target.value !== 'custom') {
      setCustomEndpoint('');
    }
  };

  const handleCustomEndpointChange = (e) => {
    setCustomEndpoint(e.target.value);
    setCustomEndpointError('');
  };

  return (
    <Form.Group className="mb-3">
      <Form.Label>Network</Form.Label>
      <Form.Select
        value={network}
        onChange={handleNetworkChange}
      >
        <option value="mainnet">Mainnet</option>
        <option value="testnet">Testnet</option>
        <option value="custom">Custom Endpoint</option>
      </Form.Select>
      {network === 'custom' && (
        <div className="mt-2">
          <Form.Control
            type="text"
            placeholder="Enter API endpoint (e.g., api.example.com)"
            value={customEndpoint}
            onChange={handleCustomEndpointChange}
            isInvalid={!!customEndpointError}
          />
          <Form.Control.Feedback type="invalid">
            {customEndpointError}
          </Form.Control.Feedback>
          <Form.Text className="text-muted">
            HTTPS will be used by default if protocol is not specified
          </Form.Text>
        </div>
      )}
    </Form.Group>
  );
};

export default NetworkSelector; 