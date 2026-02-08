import { useState, useEffect, useRef } from "react";
import { Table, Alert, Spinner, Dropdown, Badge } from "react-bootstrap";
import { useParams, useNavigate } from "react-router-dom";

const DexAnalysis = () => {
  const { pair: urlPair } = useParams();
  const navigate = useNavigate();
  const initialized = useRef(false);

  const API_ENDPOINT = "https://lb.libre.org";

  const [pair, setPair] = useState("btcusdt");
  const [orders, setOrders] = useState({ btcusdt: [], librebtc: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const PAIR_CONFIG = {
    btcusdt: {
      label: "BTC/USDT",
      baseSymbol: "BTC",
      quoteSymbol: "USDT",
      baseDecimals: 8,
      quoteDecimals: 2,
      priceDecimals: 2,
    },
    librebtc: {
      label: "LIBRE/BTC",
      baseSymbol: "LIBRE",
      quoteSymbol: "BTC",
      baseDecimals: 4,
      quoteDecimals: 8,
      priceDecimals: 10,
    },
  };

  useEffect(() => {
    if (!initialized.current) {
      if (urlPair && (urlPair === "btcusdt" || urlPair === "librebtc")) {
        setPair(urlPair);
      }
      initialized.current = true;
    }
  }, [urlPair]);

  useEffect(() => {
    navigate(`/dex-analysis/${pair}`);
  }, [pair, navigate]);

  const fetchAllTableRows = async (requestBody) => {
    const rows = [];
    let lowerBound = requestBody.lower_bound;
    let more = true;

    while (more) {
      const body = { ...requestBody, lower_bound: lowerBound };
      if (typeof lowerBound === "undefined") delete body.lower_bound;

      const response = await fetch(API_ENDPOINT + "/v1/chain/get_table_rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Failed to fetch table rows");

      const data = await response.json();
      rows.push(...(data.rows || []));
      more = data.more;

      if (more && data.next_key) {
        lowerBound = data.next_key;
      } else {
        more = false;
      }
    }

    return rows;
  };

  const parseAssetAmount = (asset) => {
    if (!asset) return 0;
    const [amount] = asset.split(" ");
    return parseFloat(amount) || 0;
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat("en-US").format(value);
  };

  const formatUSD = (value) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getMidPrice = (orderList) => {
    const bids = orderList.filter((o) => o.type === "buy");
    const asks = orderList.filter((o) => o.type === "sell");

    if (bids.length === 0 || asks.length === 0) return null;

    const highestBid = Math.max(...bids.map((o) => parseFloat(o.price)));
    const lowestAsk = Math.min(...asks.map((o) => parseFloat(o.price)));

    return (highestBid + lowestAsk) / 2;
  };

  const fetchOrders = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [btcusdtOrders, librebtcOrders] = await Promise.all([
        fetchAllTableRows({
          code: "dex.libre",
          table: "orderbook2",
          scope: "btcusdt",
          limit: 1000,
          json: true,
        }),
        fetchAllTableRows({
          code: "dex.libre",
          table: "orderbook2",
          scope: "librebtc",
          limit: 1000,
          json: true,
        }),
      ]);

      setOrders({
        btcusdt: btcusdtOrders,
        librebtc: librebtcOrders,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const getMarketStats = (orderList, pairKey) => {
    const config = PAIR_CONFIG[pairKey];
    const bids = orderList.filter((o) => o.type === "buy");
    const asks = orderList.filter((o) => o.type === "sell");

    // Bid depth is in quote asset, ask depth is in base asset
    const bidDepth = bids.reduce(
      (sum, o) => sum + parseAssetAmount(o.quoteAsset),
      0
    );
    const askDepth = asks.reduce(
      (sum, o) => sum + parseAssetAmount(o.baseAsset),
      0
    );

    // Group by account
    const accountStats = {};
    orderList.forEach((order) => {
      if (!accountStats[order.account]) {
        accountStats[order.account] = {
          bids: 0,
          asks: 0,
          bidValue: 0,
          askValue: 0,
        };
      }
      if (order.type === "buy") {
        accountStats[order.account].bids++;
        accountStats[order.account].bidValue += parseAssetAmount(
          order.quoteAsset
        );
      } else {
        accountStats[order.account].asks++;
        accountStats[order.account].askValue += parseAssetAmount(
          order.baseAsset
        );
      }
    });

    return {
      bids,
      asks,
      bidDepth,
      askDepth,
      config,
      accountStats,
    };
  };

  const handlePairChange = (newPair) => {
    setPair(newPair);
  };

  const orderList = orders[pair];
  const stats = getMarketStats(orderList, pair);
  const config = PAIR_CONFIG[pair];

  // Calculate USD values for depths
  const btcUsdPrice = getMidPrice(orders.btcusdt);
  const librebtcMidPrice = getMidPrice(orders.librebtc);

  let bidDepthUSD = null;
  let askDepthUSD = null;

  if (pair === "btcusdt") {
    // Bid depth is already in USDT
    bidDepthUSD = stats.bidDepth;
    // Ask depth is in BTC, multiply by BTC price
    if (btcUsdPrice) {
      askDepthUSD = stats.askDepth * btcUsdPrice;
    }
  } else if (pair === "librebtc") {
    // Bid depth is in BTC, multiply by BTC price
    if (btcUsdPrice) {
      bidDepthUSD = stats.bidDepth * btcUsdPrice;
    }
    // Ask depth is in LIBRE, multiply by LIBRE/BTC price then by BTC price
    if (btcUsdPrice && librebtcMidPrice) {
      askDepthUSD = stats.askDepth * librebtcMidPrice * btcUsdPrice;
    }
  }

  const sortedBids = [...stats.bids].sort(
    (a, b) => parseFloat(b.price) - parseFloat(a.price)
  );
  const sortedAsks = [...stats.asks].sort(
    (a, b) => parseFloat(a.price) - parseFloat(b.price)
  );
  const sortedAccounts = Object.entries(stats.accountStats).sort(
    (a, b) => b[1].bidValue + b[1].askValue - (a[1].bidValue + a[1].askValue)
  );

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-center">
        <div style={{ width: "100%" }}>
          <h2 className="mb-4">DEX Analysis</h2>

          <div className="alert alert-info mb-4">
            <div className="d-flex">
              <i className="bi bi-info-circle me-2 mt-1"></i>
              <div>
                <div>
                  Analyze open orders on the Libre DEX orderbook. View market
                  depth, individual orders, and liquidity provided by each
                  account.
                </div>
                <div className="mt-2 px-3 py-2 bg-white text-info border border-info rounded">
                  <strong className="me-1">Quick tip:</strong>
                  Click on any account to view it on the block explorer.
                </div>
              </div>
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
              {/* Summary Cards */}
              <div className="row mb-4">
                <div className="col-md-4">
                  <div className="card">
                    <div className="card-body">
                      <h5 className="card-title">Total Orders</h5>
                      <p className="card-text h3">{orderList.length}</p>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card">
                    <div className="card-body">
                      <h5 className="card-title">
                        Bid Depth ({config.quoteSymbol})
                      </h5>
                      <p className="card-text h3 text-success mb-1">
                        {formatNumber(
                          stats.bidDepth.toFixed(config.quoteDecimals)
                        )}
                      </p>
                      {bidDepthUSD !== null && (
                        <p className="card-text text-muted small mb-0">
                          {formatUSD(bidDepthUSD)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card">
                    <div className="card-body">
                      <h5 className="card-title">
                        Ask Depth ({config.baseSymbol})
                      </h5>
                      <p className="card-text h3 text-danger mb-1">
                        {formatNumber(
                          stats.askDepth.toFixed(config.baseDecimals)
                        )}
                      </p>
                      {askDepthUSD !== null && (
                        <p className="card-text text-muted small mb-0">
                          {formatUSD(askDepthUSD)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Orders Table */}
              <div className="card mb-4">
                <div className="card-header bg-primary text-white d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">
                    {config.label} Orders ({stats.bids.length} bids,{" "}
                    {stats.asks.length} asks)
                  </h5>
                  <Dropdown>
                    <Dropdown.Toggle variant="primary" id="pair-selector">
                      {config.label}
                    </Dropdown.Toggle>
                    <Dropdown.Menu>
                      <Dropdown.Item
                        active={pair === "btcusdt"}
                        onClick={() => handlePairChange("btcusdt")}
                      >
                        BTC/USDT ({orders.btcusdt.length})
                      </Dropdown.Item>
                      <Dropdown.Item
                        active={pair === "librebtc"}
                        onClick={() => handlePairChange("librebtc")}
                      >
                        LIBRE/BTC ({orders.librebtc.length})
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
                <div className="card-body">
                  <div className="row">
                    {/* Bids */}
                    <div className="col-md-6">
                      <h6 className="text-success mb-3">
                        <i className="bi bi-arrow-up-circle me-2"></i>
                        Bids (Buy Orders)
                        <Badge bg="success" className="ms-2">
                          {stats.bids.length}
                        </Badge>
                      </h6>
                      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                        <Table striped bordered hover size="sm">
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th className="text-end">{config.baseSymbol}</th>
                              <th className="text-end">{config.quoteSymbol}</th>
                              <th className="text-end">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedBids.map((order) => (
                              <tr key={order.identifier}>
                                <td>
                                  <a
                                    href={`https://www.libreblocks.io/account/${order.account}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {order.account}
                                  </a>
                                </td>
                                <td className="text-end font-monospace">
                                  {parseAssetAmount(order.baseAsset).toFixed(
                                    config.baseDecimals
                                  )}
                                </td>
                                <td className="text-end font-monospace">
                                  {parseAssetAmount(order.quoteAsset).toFixed(
                                    config.quoteDecimals
                                  )}
                                </td>
                                <td className="text-end font-monospace">
                                  {parseFloat(order.price).toFixed(
                                    config.priceDecimals
                                  )}
                                </td>
                              </tr>
                            ))}
                            {sortedBids.length === 0 && (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="text-center text-muted"
                                >
                                  No bids
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </div>

                    {/* Asks */}
                    <div className="col-md-6">
                      <h6 className="text-danger mb-3">
                        <i className="bi bi-arrow-down-circle me-2"></i>
                        Asks (Sell Orders)
                        <Badge bg="danger" className="ms-2">
                          {stats.asks.length}
                        </Badge>
                      </h6>
                      <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                        <Table striped bordered hover size="sm">
                          <thead>
                            <tr>
                              <th>Account</th>
                              <th className="text-end">{config.baseSymbol}</th>
                              <th className="text-end">{config.quoteSymbol}</th>
                              <th className="text-end">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedAsks.map((order) => (
                              <tr key={order.identifier}>
                                <td>
                                  <a
                                    href={`https://www.libreblocks.io/account/${order.account}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    {order.account}
                                  </a>
                                </td>
                                <td className="text-end font-monospace">
                                  {parseAssetAmount(order.baseAsset).toFixed(
                                    config.baseDecimals
                                  )}
                                </td>
                                <td className="text-end font-monospace">
                                  {parseAssetAmount(order.quoteAsset).toFixed(
                                    config.quoteDecimals
                                  )}
                                </td>
                                <td className="text-end font-monospace">
                                  {parseFloat(order.price).toFixed(
                                    config.priceDecimals
                                  )}
                                </td>
                              </tr>
                            ))}
                            {sortedAsks.length === 0 && (
                              <tr>
                                <td
                                  colSpan={4}
                                  className="text-center text-muted"
                                >
                                  No asks
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Account Summary */}
              <div className="card">
                <div className="card-header bg-primary text-white">
                  <h5 className="mb-0">
                    Liquidity by Account ({sortedAccounts.length} accounts)
                  </h5>
                </div>
                <div className="card-body">
                  <Table striped bordered hover responsive>
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th className="text-center">Bids</th>
                        <th className="text-end">
                          Bid Value ({config.quoteSymbol})
                        </th>
                        <th className="text-center">Offers</th>
                        <th className="text-end">
                          Offer Value ({config.baseSymbol})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedAccounts.map(([account, accountStats]) => (
                        <tr key={account}>
                          <td>
                            <a
                              href={`https://www.libreblocks.io/account/${account}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {account}
                            </a>
                          </td>
                          <td className="text-center">{accountStats.bids}</td>
                          <td className="text-end font-monospace">
                            {formatNumber(
                              accountStats.bidValue.toFixed(config.quoteDecimals)
                            )}
                          </td>
                          <td className="text-center">{accountStats.asks}</td>
                          <td className="text-end font-monospace">
                            {formatNumber(
                              accountStats.askValue.toFixed(config.baseDecimals)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DexAnalysis;
