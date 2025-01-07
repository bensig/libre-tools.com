import React from 'react';
import { Link } from 'react-router-dom';

const Home = () => {
  const tools = [
    {
      title: 'Smart Contract Explorer',
      path: '/explorer',
      description: 'Browse and inspect smart contract data on the Libre blockchain. View table contents, scope data, and contract actions.'
    },
    {
      title: 'Transaction History',
      path: '/transactions',
      description: 'Download and analyze transaction history for any Libre account. Filter by date range and export to CSV format.'
    },
    {
      title: 'BTC Transaction Tracker',
      path: '/btc-tracker',
      description: 'Track Bitcoin peg-in and peg-out transactions between Libre and Bitcoin networks. Monitor cross-chain transaction status.'
    }
  ];

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-center">
        <div style={{ maxWidth: '800px', width: '100%' }}>
          <h2 className="mb-4">Libre Blockchain Tools</h2>
          
          <div className="alert alert-info mb-4">
            <i className="bi bi-info-circle me-2"></i>
            Open-source tools provided by Quantum validator on Libre - please{' '}
            <a 
              href="https://dashboard.libre.org/validators" 
              target="_blank" 
              rel="noopener noreferrer"
              className="alert-link"
            >
              vote for quantum
            </a>
          </div>

          <div className="list-group">
            {tools.map((tool, index) => (
              <Link 
                key={index} 
                to={tool.path} 
                className="list-group-item list-group-item-action"
              >
                <div className="d-flex w-100 justify-content-between">
                  <h5 className="mb-2">{tool.title}</h5>
                </div>
                <p className="mb-1 text-muted">{tool.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home; 