import React from 'react';

const NetworkSelector = ({ network, setNetwork, customEndpoint, setCustomEndpoint, customEndpointError, setCustomEndpointError }) => {
    return (
        <div>
            <label className="form-label">Network</label>
            <select 
                className="form-select mb-2"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
            >
                <option value="mainnet">Mainnet</option>
                <option value="testnet">Testnet</option>
                <option value="custom">Custom</option>
            </select>
            
            {network === 'custom' && (
                <div>
                    <input
                        type="text"
                        className={`form-control ${customEndpointError ? 'is-invalid' : ''}`}
                        value={customEndpoint}
                        onChange={(e) => {
                            setCustomEndpoint(e.target.value);
                            setCustomEndpointError('');
                        }}
                        placeholder="Enter API endpoint"
                    />
                    {customEndpointError && (
                        <div className="invalid-feedback">
                            {customEndpointError}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NetworkSelector; 