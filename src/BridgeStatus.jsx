import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Nav, Table, Badge, Alert, Form, Spinner } from 'react-bootstrap';
import {
  API_ENDPOINTS, BRIDGE_CONTRACTS, PEGOUT_TABLE, PEGIN_TABLE, fetchBridgeTable,
} from './utils/bridgeStatus';
import { fetchOpenProposals, matchProposalsToRows } from './utils/bridgeStatusMsig';

const TABS = ['review', 'pegouts', 'pegins'];
const ZERO_HASH = /^0+$/;

const rowHash = (row) => row.btc_hash || row.eth_tx_hash || row.tx_hash || '';

function HashCell({ hash = '', contract, network }) {
  if (!hash || ZERO_HASH.test(hash.replace(/^0x/, ''))) return <span className="text-muted">—</span>;
  const short = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
  if (network !== 'mainnet') return <code>{short}</code>;
  const href = contract === 't.libre'
    ? `https://etherscan.io/tx/${hash.startsWith('0x') ? hash : `0x${hash}`}`
    : `https://mempool.space/tx/${hash}`;
  return <a href={href} target="_blank" rel="noopener noreferrer"><code>{short}</code></a>;
}

HashCell.propTypes = {
  hash: PropTypes.string,
  contract: PropTypes.string.isRequired,
  network: PropTypes.string.isRequired,
};

function MsigBadge({ match = null }) {
  if (!match) return <Badge bg="secondary">no proposal yet</Badge>;
  const { proposal, level } = match;
  return (
    <a href="/multisig" className="text-decoration-none">
      <Badge bg={level === 'exact' ? 'success' : 'info'}>
        {proposal.proposalName} ({proposal.provided}/{proposal.provided + proposal.requested})
        {level === 'contract' ? ' ?' : ''}
      </Badge>
    </a>
  );
}

MsigBadge.propTypes = {
  match: PropTypes.shape({
    proposal: PropTypes.shape({
      proposalName: PropTypes.string.isRequired,
      provided: PropTypes.number.isRequired,
      requested: PropTypes.number.isRequired,
    }).isRequired,
    level: PropTypes.oneOf(['exact', 'contract']).isRequired,
  }),
};

export default function BridgeStatus() {
  const { network: urlNetwork, tab: urlTab } = useParams();
  const navigate = useNavigate();
  const network = urlNetwork === 'testnet' ? 'testnet' : 'mainnet';
  const tab = TABS.includes(urlTab) ? urlTab : 'review';

  const [pegouts, setPegouts] = useState({ rows: [], errors: {} });
  const [pegins, setPegins] = useState({ rows: [], errors: {} });
  const [msigMatches, setMsigMatches] = useState(new Map());
  const [loading, setLoading] = useState(true);
  const [contractFilter, setContractFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    // Guard against a superseded run (network switched mid-flight) writing
    // another network's data into state after this effect is cleaned up.
    let stale = false;

    const load = async () => {
      setLoading(true);
      const endpoint = API_ENDPOINTS[network];
      const [outs, ins] = await Promise.all([
        fetchBridgeTable(endpoint, PEGOUT_TABLE),
        fetchBridgeTable(endpoint, PEGIN_TABLE),
      ]);
      if (stale) return;
      setPegouts(outs);
      setPegins(ins);
      setLoading(false);
      // Msig matching is best-effort and slower; never blocks row rendering.
      const reviewRows = outs.rows.filter((r) => r.scope === 'review');
      if (reviewRows.length > 0) {
        try {
          const proposals = await fetchOpenProposals(endpoint);
          if (stale) return;
          setMsigMatches(matchProposalsToRows(proposals, reviewRows));
        } catch {
          if (!stale) setMsigMatches(new Map());
        }
      } else if (!stale) {
        setMsigMatches(new Map());
      }
    };

    load();
    return () => { stale = true; };
  }, [network]);
  useEffect(() => { navigate(`/bridge-status/${network}/${tab}`, { replace: true }); }, [network, tab, navigate]);

  const reviewRows = pegouts.rows
    .filter((r) => r.scope === 'review')
    .sort((a, b) => a.contract.localeCompare(b.contract) || b.id - a.id);
  const filterRows = (rows) => rows
    .filter((r) => contractFilter === 'all' || r.contract === contractFilter)
    .filter((r) => statusFilter === 'all' || r.scope === statusFilter)
    .sort((a, b) => b.id - a.id);

  const activeErrors = tab === 'pegins' ? pegins.errors : pegouts.errors;

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Bridge Status</h2>
        <Form.Select
          style={{ width: 'auto' }}
          value={network}
          onChange={(e) => navigate(`/bridge-status/${e.target.value}/${tab}`)}
        >
          <option value="mainnet">Mainnet</option>
          <option value="testnet">Testnet</option>
        </Form.Select>
      </div>

      <Nav variant="tabs" activeKey={tab} className="mb-3"
        onSelect={(k) => navigate(`/bridge-status/${network}/${k}`)}>
        <Nav.Item>
          <Nav.Link eventKey="review">
            Review{' '}
            <Badge bg={reviewRows.length > 0 ? 'warning' : 'secondary'} text={reviewRows.length > 0 ? 'dark' : undefined}>
              {reviewRows.length}
            </Badge>
          </Nav.Link>
        </Nav.Item>
        <Nav.Item><Nav.Link eventKey="pegouts">Peg-outs</Nav.Link></Nav.Item>
        <Nav.Item><Nav.Link eventKey="pegins">Peg-ins</Nav.Link></Nav.Item>
      </Nav>

      {Object.entries(activeErrors).map(([contract, message]) => (
        <Alert key={contract} variant="danger" className="py-2">
          {contract}: {message}
        </Alert>
      ))}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : tab === 'review' ? (
        <>
          <p className="text-muted">
            Peg-outs awaiting multisig approval. Verify each is legitimate, then approve via{' '}
            <a href="/multisig">Multisig</a>.
          </p>
          <Table striped hover responsive size="sm">
            <thead>
              <tr>
                <th>Contract</th><th>ID</th><th>From</th><th>To</th><th>Quantity</th><th>Msig proposal</th>
              </tr>
            </thead>
            <tbody>
              {reviewRows.map((row) => (
                <tr key={`${row.contract}:${row.id}`} className="table-warning">
                  <td>{row.contract}</td>
                  <td>{row.id}</td>
                  <td>{row.from}</td>
                  <td><code>{row.to}</code></td>
                  <td>{row.quantity}</td>
                  <td><MsigBadge match={msigMatches.get(`${row.contract}:${row.id}`)} /></td>
                </tr>
              ))}
              {reviewRows.length === 0 && (
                <tr><td colSpan={6} className="text-center text-muted">Nothing awaiting review</td></tr>
              )}
            </tbody>
          </Table>
        </>
      ) : (
        <>
          <div className="d-flex gap-2 mb-3">
            <Form.Select style={{ width: 'auto' }} value={contractFilter}
              onChange={(e) => setContractFilter(e.target.value)}>
              <option value="all">All contracts</option>
              {BRIDGE_CONTRACTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </Form.Select>
            {tab === 'pegouts' && (
              <Form.Select style={{ width: 'auto' }} value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="review">review</option>
                <option value="completed">completed</option>
                <option value="canceled">canceled</option>
              </Form.Select>
            )}
          </div>
          <Table striped hover responsive size="sm">
            <thead>
              <tr>
                <th>Contract</th><th>Status</th><th>ID</th>
                {tab === 'pegouts' && <th>From</th>}
                <th>To</th><th>Quantity</th><th>Net</th><th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {filterRows(tab === 'pegouts' ? pegouts.rows : pegins.rows).map((row) => (
                <tr key={`${row.contract}:${row.scope}:${row.id}`}
                  className={row.scope === 'review' ? 'table-warning' : undefined}>
                  <td>{row.contract}</td>
                  <td>
                    <Badge bg={{ review: 'warning', completed: 'success', canceled: 'secondary', confirmed: 'success' }[row.scope] || 'light'}
                      text={row.scope === 'review' ? 'dark' : undefined}>
                      {row.scope}
                    </Badge>
                  </td>
                  <td>{row.id}</td>
                  {tab === 'pegouts' && <td>{row.from}</td>}
                  <td><code>{row.to}</code></td>
                  <td>{row.quantity}</td>
                  <td>{row.net_amount}</td>
                  <td><HashCell hash={rowHash(row)} contract={row.contract} network={network} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </Container>
  );
}
