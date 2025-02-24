import React, { useState, useEffect, useRef } from "react";
import { Form, Button, Table, Alert, Spinner } from "react-bootstrap";
import NetworkSelector from './components/NetworkSelector';
import { useParams, useNavigate } from 'react-router-dom';

const LoanTracker = () => {
  const { network: urlNetwork, view: urlView } = useParams();
  const navigate = useNavigate();
  const initialized = useRef(false);

  const NETWORK_ENDPOINTS = {
    mainnet: 'https://lb.libre.org',
    testnet: 'https://testnet.libre.org',
  };

  const [network, setNetwork] = useState('mainnet');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [activeLoans, setActiveLoans] = useState([]);
  const [completedLoans, setCompletedLoans] = useState([]);
  const [activeLiquidations, setActiveLiquidations] = useState([]);
  const [completedLiquidations, setCompletedLiquidations] = useState([]);
  const [view, setView] = useState('active');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [poolStats, setPoolStats] = useState({
    total: '0 USDT',
    available: '0 USDT',
    utilized: '0 USDT'
  });
  const [vaultAccounts, setVaultAccounts] = useState({});
  const [vaultBalances, setVaultBalances] = useState({});
  const [btcPrice, setBtcPrice] = useState(0);

  const getApiEndpoint = () => {
    if (customEndpoint && (network === 'custom-libre-btc-mainnet' || network === 'custom-libre-btc-signet')) {
      return customEndpoint;
    }
    return NETWORK_ENDPOINTS[network] || NETWORK_ENDPOINTS.mainnet;
  };

  useEffect(() => {
    if (!initialized.current) {
      if (urlNetwork && (urlNetwork === 'mainnet' || urlNetwork === 'testnet')) {
        setNetwork(urlNetwork);
      }
      if (urlView && (urlView === 'active' || urlView === 'completed' || urlView === 'liquidations')) {
        setView(urlView);
      }
      initialized.current = true;
    }
  }, [urlNetwork, urlView]);

  useEffect(() => {
    if (network === 'mainnet' || network === 'testnet') {
      navigate(`/loans/${network}/${view}`);
    }
  }, [network, view, navigate]);

  const handleNetworkChange = (newNetwork) => {
    setNetwork(newNetwork);
  };

  const formatUSDT = (value) => {
    if (typeof value === 'string') {
      const [amount] = value.split(' ');
      return parseFloat(amount).toFixed(2) + ' USDT';
    }
    return parseFloat(value).toFixed(2) + ' USDT';
  };

  const fetchPoolStats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get total deposits
      const depositResponse = await fetch(getApiEndpoint() + '/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: 'loan',
          table: 'deposit',
          scope: 'loan',
          limit: 100,
          json: true
        })
      });

      if (!depositResponse.ok) {
        throw new Error('Failed to fetch deposit data');
      }

      const depositData = await depositResponse.json();

      // Get available balance
      const balanceResponse = await fetch(getApiEndpoint() + '/v1/chain/get_currency_balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: 'usdt.libre',
          account: 'loan',
          symbol: 'USDT'
        })
      });

      if (!balanceResponse.ok) {
        throw new Error('Failed to fetch balance data');
      }

      const balanceData = await balanceResponse.json();

      const available = formatUSDT(balanceData[0] || '0 USDT');
      const total = formatUSDT(depositData.rows.reduce((sum, row) => sum + parseFloat(row.amount), 0));
      const utilized = formatUSDT(parseFloat(total) - parseFloat(available));

      setPoolStats({ total, available, utilized });
    } catch (error) {
      console.error('Error fetching pool stats:', error);
      setError('Failed to fetch pool statistics. ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLoans = async (scope) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(getApiEndpoint() + '/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: 'loan',
          table: 'loan',
          scope,
          limit: 100,
          json: true
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch ${scope} loans`);
      }

      const data = await response.json();
      return data.rows || [];
    } catch (error) {
      console.error(`Error fetching ${scope} loans:`, error);
      setError(`Failed to fetch ${scope} loans. ` + error.message);
      return [];
    }
  };

  const fetchLiquidations = async (scope) => {
    try {
      const response = await fetch(getApiEndpoint() + '/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: 'loan',
          table: 'liquidation',
          scope: scope,
          limit: 100,
          json: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch liquidation data');
      }

      const data = await response.json();
      return data.rows || [];
    } catch (error) {
      console.error('Error fetching liquidations:', error);
      setError('Failed to fetch liquidation data. ' + error.message);
      return [];
    }
  };

  const fetchVaultAccounts = async () => {
    try {
      const response = await fetch(getApiEndpoint() + '/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: 'loan',
          table: 'vault',
          scope: 'loan',
          limit: 100,
          json: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch vault data');
      }

      const data = await response.json();
      const vaults = {};
      data.rows.forEach(row => {
        vaults[row.owner] = row.vault;
      });
      return vaults;
    } catch (error) {
      console.error('Error fetching vault accounts:', error);
      setError('Failed to fetch vault data. ' + error.message);
      return {};
    }
  };

  const fetchVaultBalance = async (vaultAccount) => {
    try {
      // Fetch both CBTC and BTC balances in parallel
      const [cbtcResponse, btcResponse] = await Promise.all([
        fetch(getApiEndpoint() + '/v1/chain/get_currency_balance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code: 'cbtc.libre',
            account: vaultAccount,
            symbol: 'CBTC'
          })
        }),
        fetch(getApiEndpoint() + '/v1/chain/get_currency_balance', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code: 'btc.libre',
            account: vaultAccount,
            symbol: 'BTC'
          })
        })
      ]);

      if (!cbtcResponse.ok || !btcResponse.ok) {
        throw new Error('Failed to fetch vault balances');
      }

      const [cbtcBalances, btcBalances] = await Promise.all([
        cbtcResponse.json(),
        btcResponse.json()
      ]);

      // Extract amounts and sum them
      const cbtcAmount = parseFloat(cbtcBalances[0]?.split(' ')[0] || '0');
      const btcAmount = parseFloat(btcBalances[0]?.split(' ')[0] || '0');
      const totalBtc = cbtcAmount + btcAmount;

      return {
        cbtc: cbtcBalances[0] || '0.00000000 CBTC',
        btc: btcBalances[0] || '0.00000000 BTC',
        total: totalBtc.toFixed(8)
      };
    } catch (error) {
      console.error('Error fetching vault balances:', error);
      return {
        cbtc: '0.00000000 CBTC',
        btc: '0.00000000 BTC',
        total: '0.00000000'
      };
    }
  };

  const fetchBTCPrice = async () => {
    try {
      const response = await fetch(getApiEndpoint() + '/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: network === 'mainnet' ? 'chainlink' : 'oracletest',
          table: 'feed',
          scope: network === 'mainnet' ? 'chainlink' : 'oracletest',
          limit: 100,
          json: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to fetch BTC price');
      }

      const data = await response.json();
      console.log('BTC price data:', data);
      if (data.rows && data.rows.length > 0) {
        // Get the first row that matches btcusd pair
        const btcFeed = data.rows.find(row => row.pair === 'btcusd');
        if (btcFeed) {
          const price = parseFloat(btcFeed.price);
          console.log('Calculated BTC price:', price);
          return price;
        }
      }
      return 0;
    } catch (error) {
      console.error('Error fetching BTC price:', error);
      return 0;
    }
  };

  const calculateLoanLTV = (loan) => {
    const collateralValue = calculateCollateralValue(loan);
    const loanValue = parseFloat(loan.outstanding_amount.split(' ')[0]);
    return collateralValue > 0 ? (loanValue / collateralValue * 100) : 0;
  };

  const getCollateralBTC = (loan) => {
    if (!vaultAccounts[loan.account]) return { cbtc: '0', btc: '0', total: '0' };
    const balance = vaultBalances[vaultAccounts[loan.account]] || { 
      cbtc: '0.00000000 CBTC', 
      btc: '0.00000000 BTC', 
      total: '0.00000000' 
    };
    return {
      cbtc: balance.cbtc.split(' ')[0],
      btc: balance.btc.split(' ')[0],
      total: balance.total
    };
  };

  const calculateCollateralValue = (loan) => {
    const balance = getCollateralBTC(loan);
    const totalBTC = parseFloat(balance.total);
    const value = totalBTC * btcPrice;
    console.log(`Calculating value for ${totalBTC} BTC at price $${btcPrice}: $${value}`);
    return value;
  };

  const calculateTotalCollateralValue = (loans) => {
    console.log('Calculating total collateral for loans:', loans);
    const total = loans.reduce((sum, loan) => {
      const value = calculateCollateralValue(loan);
      console.log('Loan', loan.id, 'collateral value:', value);
      return sum + value;
    }, 0);
    console.log('Total collateral value:', total);
    return total;
  };

  const calculateCollateralizationRatio = (loans) => {
    const totalCollateralValue = calculateTotalCollateralValue(loans);
    const totalLoanValue = loans.reduce((sum, loan) => {
      const amount = parseFloat(loan.outstanding_amount.split(' ')[0]);
      return sum + amount;
    }, 0);
    
    return totalLoanValue > 0 ? (totalCollateralValue / totalLoanValue * 100) : 0;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch all data in parallel
        const [
          active, 
          completed, 
          activeLiq, 
          completedLiq,
          vaults,
          btcPriceData
        ] = await Promise.all([
          fetchLoans('loan'),
          fetchLoans('completed'),
          fetchLiquidations('liquidating'),
          fetchLiquidations('finished'),
          fetchVaultAccounts(),
          fetchBTCPrice()
        ]);
        
        // Filter active loans by status
        const activeLoans = active.filter(loan => loan.status < 4);
        const completedLoans = [...completed, ...active.filter(loan => loan.status >= 4)];
        
        setActiveLoans(activeLoans);
        setCompletedLoans(completedLoans);
        setActiveLiquidations(activeLiq);
        setCompletedLiquidations(completedLiq);
        setVaultAccounts(vaults);
        setBtcPrice(btcPriceData);

        // Fetch balances for all vault accounts
        const balances = {};
        await Promise.all(
          Object.values(vaults).map(async (vault) => {
            balances[vault] = await fetchVaultBalance(vault);
          })
        );
        setVaultBalances(balances);

        await fetchPoolStats();
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load data. ' + error.message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [network, customEndpoint]);

  const handleViewChange = (newView) => {
    setView(newView);
  };

  const renderStatus = (status) => {
    const statusMap = {
      0: { label: 'In Progress', variant: 'primary' },
      1: { label: 'Warning', variant: 'warning' },
      2: { label: 'At Risk', variant: 'danger' },
      3: { label: 'Liquidating', variant: 'danger' },
      4: { label: 'Liquidated', variant: 'secondary' },
      5: { label: 'Repaid', variant: 'success' },
      6: { label: 'Canceled', variant: 'secondary' }
    };

    const { label, variant } = statusMap[status] || { label: 'Unknown', variant: 'secondary' };
    return <Button size="sm" variant={variant} disabled>{label}</Button>;
  };

  const renderLiquidationStatus = (status) => {
    const statusMap = {
      0: { label: 'At Risk', variant: 'warning' },
      1: { label: 'Resolved', variant: 'success' },
      2: { label: 'Processing', variant: 'primary' },
      3: { label: 'Processing', variant: 'primary' },
      4: { label: 'Penalizing', variant: 'danger' },
      5: { label: 'Liquidated', variant: 'secondary' }
    };

    const { label, variant } = statusMap[status] || { label: 'Unknown', variant: 'secondary' };
    return <Button size="sm" variant={variant} disabled>{label}</Button>;
  };

  const renderLiquidationsTable = (liquidations) => (
    <Table striped bordered hover responsive>
      <thead>
        <tr>
          <th>ID</th>
          <th>Loan ID</th>
          <th>Outstanding Amount</th>
          <th>Collateral Amount</th>
          <th>Collateral USD Price</th>
          <th>Review Start Time</th>
          <th>Last Check Time</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {liquidations.map(liq => (
          <tr key={liq.id}>
            <td>{liq.id}</td>
            <td>{liq.loan_id}</td>
            <td>{formatUSDT(liq.outstanding_amount)}</td>
            <td>{liq.collateral_amount}</td>
            <td>${(parseFloat(liq.collateral_usd_price) / 100000000).toFixed(2)}</td>
            <td>{new Date(liq.review_start_time).toLocaleString()}</td>
            <td>{new Date(liq.last_check_time).toLocaleString()}</td>
            <td>{renderLiquidationStatus(liq.status)}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  const calculateTotalAmount = (loans) => {
    return formatUSDT(loans.reduce((sum, loan) => {
      const amount = parseFloat(loan.outstanding_amount.split(' ')[0]);
      return sum + amount;
    }, 0));
  };

  return (
    <div className="container">
      <div className="row mb-4">
        <div className="col">
          <h2>Loan Tracker</h2>
        </div>
      </div>

      <div className="row mb-4">
        <div className="col">
          <NetworkSelector
            network={network}
            setNetwork={setNetwork}
            customEndpoint={customEndpoint}
            setCustomEndpoint={setCustomEndpoint}
            customEndpointError={''}
            setCustomEndpointError={() => {}}
          />
        </div>
      </div>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <div className="text-center my-5">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      ) : (
        <>
          <div className="row mb-4">
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Total USDT</h5>
                  <p className="card-text h3">{poolStats.total}</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Available USDT</h5>
                  <p className="card-text h3">{poolStats.available}</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Utilized USDT</h5>
                  <p className="card-text h3">{poolStats.utilized}</p>
                </div>
              </div>
            </div>
          </div>

          {view === 'active' && (
            <div className="row mb-4">
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">Total Active Loan Amount</h5>
                    <p className="card-text h3">{calculateTotalAmount(activeLoans)}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">Total BTC Collateral Value</h5>
                    <p className="card-text h3">${calculateTotalCollateralValue(activeLoans).toFixed(2)}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">Collateralization Ratio</h5>
                    <p className="card-text h3">{calculateCollateralizationRatio(activeLoans).toFixed(2)}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-header d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                {view === 'completed' ? 'Completed Loans' : 
                 view === 'liquidations' ? 'Liquidations' : 
                 'Active Loans'}
              </h5>
              <div>
                <Button
                  variant={view === 'active' ? 'primary' : 'outline-primary'}
                  onClick={() => handleViewChange('active')}
                  className="me-2"
                >
                  Active
                </Button>
                <Button
                  variant={view === 'completed' ? 'primary' : 'outline-primary'}
                  onClick={() => handleViewChange('completed')}
                  className="me-2"
                >
                  Completed
                </Button>
                <Button
                  variant={view === 'liquidations' ? 'primary' : 'outline-primary'}
                  onClick={() => handleViewChange('liquidations')}
                >
                  Liquidations
                </Button>
              </div>
            </div>
            <div className="card-body">
              {view === 'liquidations' ? (
                <>
                  <h6 className="mb-4">Active Liquidations</h6>
                  {renderLiquidationsTable(activeLiquidations)}
                  
                  <h6 className="mt-5 mb-4">Completed Liquidations</h6>
                  {renderLiquidationsTable(completedLiquidations)}
                </>
              ) : (
                <>
                  <Table striped bordered hover responsive>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Account</th>
                        <th>Initial Amount</th>
                        <th>Outstanding Amount</th>
                        <th>APR</th>
                        {view === 'active' && (
                          <>
                            <th>Collateral (BTC)</th>
                            <th>Collateral Value</th>
                            <th>LTV</th>
                          </>
                        )}
                        <th>Start Time</th>
                        <th>End Time</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(view === 'completed' ? completedLoans : activeLoans).map(loan => {
                        const collateral = getCollateralBTC(loan);
                        const collateralValue = calculateCollateralValue(loan);
                        const ltv = calculateLoanLTV(loan);
                        
                        return (
                          <tr key={loan.id}>
                            <td>{loan.id}</td>
                            <td>{loan.account}</td>
                            <td>{formatUSDT(loan.initial_amount)}</td>
                            <td>{formatUSDT(loan.outstanding_amount)}</td>
                            <td>{(loan.terms?.apr / 100).toFixed(2)}%</td>
                            {view === 'active' && (
                              <>
                                <td>
                                  {parseFloat(collateral.total).toFixed(8)}
                                  <small className="d-block text-muted">
                                    CBTC: {parseFloat(collateral.cbtc).toFixed(8)}
                                    {parseFloat(collateral.btc) > 0 && (
                                      <>, BTC: {parseFloat(collateral.btc).toFixed(8)}</>
                                    )}
                                  </small>
                                </td>
                                <td>${collateralValue.toFixed(2)}</td>
                                <td>{ltv.toFixed(2)}%</td>
                              </>
                            )}
                            <td>{new Date(loan.start_time).toLocaleString()}</td>
                            <td>{new Date(loan.end_time).toLocaleString()}</td>
                            <td>{renderStatus(loan.status)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LoanTracker;