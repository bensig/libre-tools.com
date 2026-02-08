import { useState, useEffect } from "react";
import { Table, Alert, Spinner, Tabs, Tab, Card, Badge } from "react-bootstrap";

const DexAnalysis = () => {
  const API_ENDPOINT = "https://lb.libre.org";

  const [activeTab, setActiveTab] = useState("btcusdt");
  const [orders, setOrders] = useState({ btcusdt: [], librebtc: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const parseAssetSymbol = (asset) => {
    if (!asset) return "";
    const parts = asset.split(" ");
    return parts[1] || "";
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

  const formatNumber = (value, decimals = 2) => {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  };

  const formatPrice = (price, pair) => {
    const p = parseFloat(price);
    if (pair === "librebtc") {
      return p.toFixed(10);
    }
    return formatNumber(p, 2);
  };

  const getMarketStats = (orderList, pair) => {
    const bids = orderList.filter((o) => o.type === "buy");
    const asks = orderList.filter((o) => o.type === "sell");

    const isBtcUsdt = pair === "btcusdt";

    // For BTCUSDT: base is BTC, quote is USDT
    // For LIBREBTC: base is LIBRE, quote is BTC
    const bidDepth = bids.reduce(
      (sum, o) => sum + parseAssetAmount(isBtcUsdt ? o.quoteAsset : o.quoteAsset),
      0
    );
    const askDepth = asks.reduce(
      (sum, o) => sum + parseAssetAmount(isBtcUsdt ? o.baseAsset : o.baseAsset),
      0
    );

    // Group by account
    const accountStats = {};
    orderList.forEach((order) => {
      if (!accountStats[order.account]) {
        accountStats[order.account] = { bids: 0, asks: 0, bidValue: 0, askValue: 0 };
      }
      if (order.type === "buy") {
        accountStats[order.account].bids++;
        accountStats[order.account].bidValue += parseAssetAmount(
          isBtcUsdt ? order.quoteAsset : order.quoteAsset
        );
      } else {
        accountStats[order.account].asks++;
        accountStats[order.account].askValue += parseAssetAmount(
          isBtcUsdt ? order.baseAsset : order.baseAsset
        );
      }
    });

    return {
      bids,
      asks,
      bidDepth,
      askDepth,
      bidDepthUnit: isBtcUsdt ? "USDT" : "BTC",
      askDepthUnit: isBtcUsdt ? "BTC" : "LIBRE",
      accountStats,
    };
  };

  const renderOrderTable = (orderList, type, pair) => {
    const isBtcUsdt = pair === "btcusdt";
    const sorted = [...orderList].sort((a, b) => {
      const priceA = parseFloat(a.price);
      const priceB = parseFloat(b.price);
      return type === "buy" ? priceB - priceA : priceA - priceB;
    });

    return (
      <Table striped bordered hover size="sm" className="mb-0">
        <thead>
          <tr>
            <th>Account</th>
            <th className="text-end">{isBtcUsdt ? "BTC" : "LIBRE"}</th>
            <th className="text-end">{isBtcUsdt ? "USDT" : "BTC"}</th>
            <th className="text-end">Price</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((order) => (
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
                {formatNumber(parseAssetAmount(order.baseAsset), isBtcUsdt ? 8 : 4)}
              </td>
              <td className="text-end font-monospace">
                {formatNumber(parseAssetAmount(order.quoteAsset), isBtcUsdt ? 2 : 8)}
              </td>
              <td className="text-end font-monospace">
                {formatPrice(order.price, pair)}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-muted">
                No {type === "buy" ? "bids" : "offers"}
              </td>
            </tr>
          )}
        </tbody>
      </Table>
    );
  };

  const renderAccountStats = (accountStats, pair) => {
    const isBtcUsdt = pair === "btcusdt";
    const sorted = Object.entries(accountStats).sort(
      (a, b) => b[1].bidValue + b[1].askValue - (a[1].bidValue + a[1].askValue)
    );

    return (
      <Table striped bordered hover size="sm">
        <thead>
          <tr>
            <th>Account</th>
            <th className="text-center">Bids</th>
            <th className="text-end">Bid Value ({isBtcUsdt ? "USDT" : "BTC"})</th>
            <th className="text-center">Offers</th>
            <th className="text-end">Offer Value ({isBtcUsdt ? "BTC" : "LIBRE"})</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([account, stats]) => (
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
              <td className="text-center">{stats.bids}</td>
              <td className="text-end font-monospace">
                {formatNumber(stats.bidValue, isBtcUsdt ? 2 : 8)}
              </td>
              <td className="text-center">{stats.asks}</td>
              <td className="text-end font-monospace">
                {formatNumber(stats.askValue, isBtcUsdt ? 8 : 4)}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    );
  };

  const renderPairAnalysis = (pair) => {
    const orderList = orders[pair];
    const stats = getMarketStats(orderList, pair);
    const pairLabel = pair === "btcusdt" ? "BTC/USDT" : "LIBRE/BTC";

    return (
      <div>
        {/* Market Depth Summary */}
        <div className="row mb-4">
          <div className="col-md-4">
            <Card className="h-100">
              <Card.Body className="text-center">
                <h6 className="text-muted mb-2">Total Orders</h6>
                <h3>{orderList.length}</h3>
                <small className="text-muted">
                  {stats.bids.length} bids · {stats.asks.length} offers
                </small>
              </Card.Body>
            </Card>
          </div>
          <div className="col-md-4">
            <Card className="h-100 border-success">
              <Card.Body className="text-center">
                <h6 className="text-success mb-2">Bid Depth</h6>
                <h3 className="text-success">
                  {formatNumber(stats.bidDepth, stats.bidDepthUnit === "USDT" ? 2 : 8)}
                </h3>
                <small className="text-muted">{stats.bidDepthUnit}</small>
              </Card.Body>
            </Card>
          </div>
          <div className="col-md-4">
            <Card className="h-100 border-danger">
              <Card.Body className="text-center">
                <h6 className="text-danger mb-2">Ask Depth</h6>
                <h3 className="text-danger">
                  {formatNumber(stats.askDepth, stats.askDepthUnit === "BTC" ? 8 : 4)}
                </h3>
                <small className="text-muted">{stats.askDepthUnit}</small>
              </Card.Body>
            </Card>
          </div>
        </div>

        {/* Order Books */}
        <div className="row mb-4">
          <div className="col-md-6">
            <Card>
              <Card.Header className="bg-success text-white">
                <strong>Bids (Buy Orders)</strong>
                <Badge bg="light" text="dark" className="ms-2">
                  {stats.bids.length}
                </Badge>
              </Card.Header>
              <Card.Body className="p-0" style={{ maxHeight: "400px", overflowY: "auto" }}>
                {renderOrderTable(stats.bids, "buy", pair)}
              </Card.Body>
            </Card>
          </div>
          <div className="col-md-6">
            <Card>
              <Card.Header className="bg-danger text-white">
                <strong>Offers (Sell Orders)</strong>
                <Badge bg="light" text="dark" className="ms-2">
                  {stats.asks.length}
                </Badge>
              </Card.Header>
              <Card.Body className="p-0" style={{ maxHeight: "400px", overflowY: "auto" }}>
                {renderOrderTable(stats.asks, "sell", pair)}
              </Card.Body>
            </Card>
          </div>
        </div>

        {/* Account Summary */}
        <Card>
          <Card.Header>
            <strong>Liquidity by Account</strong>
            <Badge bg="secondary" className="ms-2">
              {Object.keys(stats.accountStats).length} accounts
            </Badge>
          </Card.Header>
          <Card.Body className="p-0">
            {renderAccountStats(stats.accountStats, pair)}
          </Card.Body>
        </Card>
      </div>
    );
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2>DEX Analysis</h2>
        <button
          className="btn btn-outline-primary"
          onClick={fetchOrders}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Spinner size="sm" className="me-2" />
              Loading...
            </>
          ) : (
            <>
              <i className="bi bi-arrow-clockwise me-2"></i>
              Refresh
            </>
          )}
        </button>
      </div>

      <Alert variant="info" className="mb-4">
        <i className="bi bi-info-circle me-2"></i>
        Analysis of open orders on the Libre DEX orderbook. Shows market depth, individual orders, and liquidity provided by each account.
      </Alert>

      {error && (
        <Alert variant="danger" className="mb-4">
          <i className="bi bi-exclamation-triangle me-2"></i>
          {error}
        </Alert>
      )}

      {isLoading && orders.btcusdt.length === 0 ? (
        <div className="text-center py-5">
          <Spinner animation="border" />
          <p className="mt-3">Loading orderbook data...</p>
        </div>
      ) : (
        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k)}
          className="mb-4"
        >
          <Tab eventKey="btcusdt" title={`BTC/USDT (${orders.btcusdt.length} orders)`}>
            {renderPairAnalysis("btcusdt")}
          </Tab>
          <Tab eventKey="librebtc" title={`LIBRE/BTC (${orders.librebtc.length} orders)`}>
            {renderPairAnalysis("librebtc")}
          </Tab>
        </Tabs>
      )}
    </div>
  );
};

export default DexAnalysis;
