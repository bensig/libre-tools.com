import { useState, useEffect, useRef } from "react";
import { Button, Table, Alert, Spinner, Dropdown } from "react-bootstrap";
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
    total: 0,
    available: 0,
    utilized: 0
  });
  const [vaultAccounts, setVaultAccounts] = useState({});
  const [vaultBalances, setVaultBalances] = useState({});
  const [vaultAddresses, setVaultAddresses] = useState({});
  const [btcPrice, setBtcPrice] = useState(0);

  const getApiEndpoint = () => {
    if (customEndpoint && (network === 'custom-libre-btc-mainnet' || network === 'custom-libre-btc-signet')) {
      return customEndpoint;
    }
    return NETWORK_ENDPOINTS[network] || NETWORK_ENDPOINTS.mainnet;
  };

  const fetchAllTableRows = async (requestBody) => {
    const rows = [];
    let lowerBound = requestBody.lower_bound;
    let previousLowerBound = lowerBound;
    let more = true;

    while (more) {
      const body = {
        ...requestBody,
        lower_bound: lowerBound
      };

      if (typeof lowerBound === 'undefined') {
        delete body.lower_bound;
      }

      const response = await fetch(getApiEndpoint() + '/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error('Failed to fetch table rows');
      }

      const data = await response.json();
      rows.push(...(data.rows || []));
      more = data.more;

      if (more) {
        const nextKey = data.next_key;
        if (!nextKey || nextKey === previousLowerBound) {
          console.warn('Pagination halted early due to missing or repeating next_key');
          more = false;
        } else {
          lowerBound = nextKey;
          previousLowerBound = nextKey;
        }
      }
    }

    return rows;
  };

  // Format number with commas
  const formatNumber = (value) => {
    return new Intl.NumberFormat('en-US').format(value);
  };

  // Format USDT with 2 decimal places and commas
  const formatUSDT = (value) => {
    let amount;
    if (typeof value === 'string') {
      [amount] = value.split(' ');
      amount = parseFloat(amount);
    } else {
      amount = parseFloat(value);
    }
    // Ensure exactly 2 decimal places
    return formatNumber(amount.toFixed(2)) + ' USDT';
  };

  const parseLoanDate = (value) => {
    if (!value) return null;
    const normalized = value.endsWith('Z') ? value : `${value}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const calculateDaysRemaining = (loan) => {
    const startTime = parseLoanDate(loan.start_time);
    const durationSec = loan?.terms?.loan_duration_sec;
    if (!startTime || !durationSec) return 0;

    const endTime = new Date(startTime.getTime() + durationSec * 1000);
    const diffMs = endTime.getTime() - Date.now();
    if (diffMs <= 0) return 0;

    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
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

  const fetchPoolStats = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get available balance directly from currency balance
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
      const availableAmount = parseFloat(balanceData[0]?.split(' ')[0] || 0);

      // Get global stats for outstanding amount (utilized)
      const globalStatsResponse = await fetch(getApiEndpoint() + '/v1/chain/get_table_rows', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          code: 'loan',
          table: 'globalstats',
          scope: 'loan',
          limit: 1,
          json: true
        })
      });

      if (!globalStatsResponse.ok) {
        throw new Error('Failed to fetch global stats');
      }

      const globalStatsData = await globalStatsResponse.json();
      
      // Get utilized amount from outstanding_amount in globalstats
      const utilizedAmount = parseFloat(
        globalStatsData.rows[0]?.outstanding_amount?.split(' ')[0] || 0
      );
      
      // Calculate total as available + utilized
      const totalAmount = availableAmount + utilizedAmount;
      
      // Store values in state
      setPoolStats({
        total: totalAmount,
        available: availableAmount,
        utilized: utilizedAmount
      });
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

      const rows = await fetchAllTableRows({
        code: 'loan',
        table: 'loan',
        scope,
        limit: 1000,
        json: true
      });
      return rows;
    } catch (error) {
      console.error(`Error fetching ${scope} loans:`, error);
      setError(`Failed to fetch ${scope} loans. ` + error.message);
      return [];
    }
  };

  const fetchLiquidations = async (scope) => {
    try {
      const rows = await fetchAllTableRows({
        code: 'loan',
        table: 'liquidation',
        scope: scope,
        limit: 1000,
        json: true
      });
      return rows;
    } catch (error) {
      console.error('Error fetching liquidations:', error);
      setError('Failed to fetch liquidation data. ' + error.message);
      return [];
    }
  };

  const fetchVaultAccounts = async () => {
    try {
      const rows = await fetchAllTableRows({
        code: 'loan',
        table: 'vault',
        scope: 'loan',
        limit: 1000,
        json: true
      });
      const vaults = {};
      rows.forEach(row => {
        vaults[row.owner] = row.vault;
      });
      return vaults;
    } catch (error) {
      console.error('Error fetching vault accounts:', error);
      setError('Failed to fetch vault data. ' + error.message);
      return {};
    }
  };

  const fetchAllVaultAddresses = async () => {
    try {
      const rows = await fetchAllTableRows({
        code: 'v.libre',
        table: 'accounts',
        scope: 'v.libre',
        limit: 1000,
        json: true
      });
      const addressMap = {};
      rows.forEach(row => {
        addressMap[row.account] = row.btc_address;
      });
      return addressMap;
    } catch (error) {
      console.error('Error fetching vault addresses:', error);
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
          limit: 1000,
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
    console.log(`Calculating value for ${totalBTC} BTC at price $${formatNumber(btcPrice)}: $${formatNumber(value)}`);
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

  const calculateUtilizationPercentage = () => {
    if (poolStats.total <= 0) return 0;
    return (poolStats.utilized / poolStats.total) * 100;
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

        // Fetch all vault addresses in one request
        const allVaultAddresses = await fetchAllVaultAddresses();
        
        // Map owner accounts to their bitcoin addresses
        const ownerAddresses = {};
        Object.entries(vaults).forEach(([owner, vault]) => {
          if (allVaultAddresses[vault]) {
            ownerAddresses[owner] = allVaultAddresses[vault];
          }
        });
        setVaultAddresses(ownerAddresses);
        
        // Only fetch balances for active loans (not all vaults)
        const balances = {};
        if (activeLoans.length > 0) {
          // Get unique vault accounts from active loans only
          const activeVaultAccounts = [...new Set(activeLoans.map(loan => vaults[loan.account]).filter(Boolean))];
          
          await Promise.all(
            activeVaultAccounts.map(async (vault) => {
              balances[vault] = await fetchVaultBalance(vault);
            })
          );
        }
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
            <td>${formatNumber((parseFloat(liq.collateral_usd_price) / 100000000).toFixed(2))}</td>
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
    <div className="container-fluid">
      <div className="d-flex justify-content-center">
        <div style={{ width: '100%' }}>
          <h2 className="mb-4">Loan Overview</h2>
          
          <div className="alert alert-info mb-4">
            <i className="bi bi-info-circle me-2"></i>
            Monitor USDT loans and BTC collateral on the Libre blockchain. Track pool statistics, active loans, and liquidations.
          </div>
          
          <div style={{ maxWidth: '300px' }} className="mb-4">
            <NetworkSelector
              network={network}
              setNetwork={setNetwork}
              customEndpoint={customEndpoint}
              setCustomEndpoint={setCustomEndpoint}
              customEndpointError={''}
              setCustomEndpointError={() => {}}
            />
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
                  <h5 className="card-title">Tether Pool Size</h5>
                  <p className="card-text h3">{formatUSDT(poolStats.total)}</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Available</h5>
                  <p className="card-text h3">{formatUSDT(poolStats.available)}</p>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card">
                <div className="card-body">
                  <h5 className="card-title">Utilized</h5>
                  <p className="card-text h3">
                    {formatNumber(calculateUtilizationPercentage().toFixed(2))}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {view === 'active' && (
            <div className="row mb-4">
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">Outstanding Loans</h5>
                    <p className="card-text h3">{calculateTotalAmount(activeLoans)}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">BTC Collateral Value</h5>
                    <p className="card-text h3">${formatNumber(calculateTotalCollateralValue(activeLoans).toFixed(2))}</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card">
                  <div className="card-body">
                    <h5 className="card-title">Collateralization Ratio</h5>
                    <p className="card-text h3">{formatNumber(calculateCollateralizationRatio(activeLoans).toFixed(2))}%</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="card">
            <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                {view === 'completed' ? 'Completed Loans' : 
                 view === 'liquidations' ? 'Liquidations' : 
                 'Active Loans'}
              </h5>
              <div>
                <Dropdown className="d-inline-block">
                  <Dropdown.Toggle variant="primary" id="view-selector">
                    {view === 'active' ? 'Active' : 
                     view === 'completed' ? 'Completed' : 'Liquidations'}
                  </Dropdown.Toggle>
                  <Dropdown.Menu>
                    <Dropdown.Item 
                      active={view === 'active'} 
                      onClick={() => handleViewChange('active')}
                    >
                      Active
                    </Dropdown.Item>
                    <Dropdown.Item 
                      active={view === 'completed'} 
                      onClick={() => handleViewChange('completed')}
                    >
                      Completed
                    </Dropdown.Item>
                    <Dropdown.Item 
                      active={view === 'liquidations'} 
                      onClick={() => handleViewChange('liquidations')}
                    >
                      Liquidations
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
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
                            <th>Days Remaining</th>
                          </>
                        )}
                        {view === 'completed' && <th>Completion Date</th>}
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(view === 'completed' ? completedLoans : activeLoans).map(loan => {
                        const collateral = getCollateralBTC(loan);
                        const collateralValue = calculateCollateralValue(loan);
                        const ltv = calculateLoanLTV(loan);
                        const daysRemaining = calculateDaysRemaining(loan);
                        
                        return (
                          <tr key={loan.id}>
                            <td>{loan.id}</td>
                            <td>
                              {view === 'active' && vaultAddresses[loan.account] ? (
                                <a 
                                  href={`https://mempool.space/address/${vaultAddresses[loan.account]}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary"
                                >
                                  {loan.account}
                                </a>
                              ) : (
                                loan.account
                              )}
                            </td>
                            <td>{formatUSDT(loan.initial_amount)}</td>
                            <td>{formatUSDT(loan.outstanding_amount)}</td>
                            <td>{(loan.terms?.apr / 100).toFixed(2)}%</td>
                            {view === 'active' && (
                              <>
                                <td>
                                  {vaultAddresses[loan.account] ? (
                                    <a 
                                      href={`https://mempool.space/address/${vaultAddresses[loan.account]}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-primary"
                                    >
                                      {parseFloat(collateral.total).toFixed(8)} BTC
                                    </a>
                                  ) : (
                                    `${parseFloat(collateral.total).toFixed(8)} BTC`
                                  )}
                                </td>
                                <td>${formatNumber(collateralValue.toFixed(2))}</td>
                                <td>{formatNumber(ltv.toFixed(2))}%</td>
                                <td>{daysRemaining} days</td>
                              </>
                            )}
                            {view === 'completed' && (
                              <td>{new Date(loan.end_time).toLocaleString()}</td>
                            )}
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
      </div>
    </div>
  );
};

export default LoanTracker;
