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
                <option value="custom-libre-btc-mainnet">Custom Libre + BTC Mainnet</option>
                <option value="custom-libre-btc-signet">Custom Libre + BTC Signet</option>
            </select>
            
            {(network === 'custom-libre-btc-mainnet' || 
              network === 'custom-libre-btc-signet') && (
                <div>
                    <input
                        type="text"
                        className={`form-control mb-2 ${customEndpointError ? 'is-invalid' : ''}`}
                        value={customEndpoint}
                        onChange={(e) => {
                            setCustomEndpoint(e.target.value);
                            setCustomEndpointError('');
                        }}
                        placeholder="Enter Libre API endpoint"
                    />
                    {customEndpointError && (
                        <div className="invalid-feedback">
                            {customEndpointError}
                        </div>
                    )}
                    <div className="form-text">
                        BTC endpoint: {network === 'custom-libre-btc-signet' ? 
                            'https://mempool.space/signet' : 
                            'https://mempool.space'}
                    </div>
                </div>
            )}
        </div>
    );
};

export default NetworkSelector; 