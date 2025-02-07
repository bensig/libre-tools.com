import React, { useState, useEffect } from 'react';
import { Table, Form, Button, Alert, Spinner, Card, Badge } from 'react-bootstrap';
import { useNavigate, useParams } from 'react-router-dom';
import NetworkSelector from './components/NetworkSelector';

const MultisigProposals = () => {
  const [proposals, setProposals] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [network, setNetwork] = useState('mainnet');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customEndpointError, setCustomEndpointError] = useState('');
  const [activeProducers, setActiveProducers] = useState([]);
  const [currentSchedule, setCurrentSchedule] = useState([]);
  const { proposalId } = useParams();
  const navigate = useNavigate();

  const NETWORK_CONFIG = {
    mainnet: {
      api: 'https://lb.libre.org',
      explorer: 'https://www.libreblocks.io'
    },
    testnet: {
      api: 'https://testnet.libre.org',
      explorer: 'https://testnet.libreblocks.io'
    }
  };

  const getApiEndpoint = () => {
    if (network === 'mainnet' || network === 'testnet') {
      return NETWORK_CONFIG[network].api;
    }
    return customEndpoint;
  };

  const fetchWithTimeout = async (resource, options = {}) => {
    const { timeout = 5000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(resource, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(id);
      return response;
    } catch (error) {
      clearTimeout(id);
      throw error;
    }
  };

  const fetchProducerSchedule = async () => {
    try {
      const response = await fetchWithTimeout(`${getApiEndpoint()}/v1/chain/get_producer_schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.active) {
        const producers = data.active.producers.map(p => p.producer_name);
        console.log('Current schedule producers:', producers);
        setCurrentSchedule(producers);
      }
    } catch (error) {
      console.error('Error fetching producer schedule:', error);
    }
  };

  const fetchActiveProducers = async () => {
    try {
      const response = await fetchWithTimeout(`${getApiEndpoint()}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: true,
          code: 'eosio',
          scope: 'eosio',
          table: 'producers',
          limit: 100,
          index_position: 2,
          key_type: 'float64',
          reverse: true
        })
      });
      const data = await response.json();
      const active = data.rows
        .filter(p => p.is_active === 1)
        .sort((a, b) => parseFloat(b.total_votes) - parseFloat(a.total_votes))
        .slice(0, 21)
        .map(p => p.owner);
      console.log('Top 21 Active producers:', active);
      setActiveProducers(active);
    } catch (error) {
      console.error('Error fetching active producers:', error);
    }
  };

  const fetchProposalScopes = async () => {
    try {
      const response = await fetchWithTimeout(`${getApiEndpoint()}/v1/chain/get_table_by_scope`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: 'eosio.msig',
          table: 'proposal',
          limit: 100
        })
      });
      const data = await response.json();
      return data.rows.map(row => row.scope);
    } catch (error) {
      console.error('Error fetching proposal scopes:', error);
      return [];
    }
  };

  const fetchProposalDetails = async (scope) => {
    try {
      // Fetch proposal
      const proposalResponse = await fetchWithTimeout(`${getApiEndpoint()}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: true,
          code: 'eosio.msig',
          scope: scope,
          table: 'proposal',
          limit: 1
        })
      });
      const proposalData = await proposalResponse.json();
      
      // Fetch approvals
      const approvalsResponse = await fetchWithTimeout(`${getApiEndpoint()}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          json: true,
          code: 'eosio.msig',
          scope: scope,
          table: 'approvals2',
          limit: 1
        })
      });
      const approvalsData = await approvalsResponse.json();

      if (proposalData.rows.length > 0) {
        const proposal = proposalData.rows[0];
        const approvals = approvalsData.rows[0] || { requested_approvals: [], provided_approvals: [] };
        return {
          scope,
          ...proposal,
          ...approvals
        };
      }
      return null;
    } catch (error) {
      console.error(`Error fetching proposal details for scope ${scope}:`, error);
      return null;
    }
  };

  const fetchAllProposals = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const scopes = await fetchProposalScopes();
      const proposalPromises = scopes.map(scope => fetchProposalDetails(scope));
      const proposalResults = await Promise.all(proposalPromises);
      const validProposals = proposalResults.filter(p => p !== null);
      setProposals(validProposals);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAllProposals();
    fetchActiveProducers();
    fetchProducerSchedule();
  }, [network, customEndpoint]);

  const formatDate = (timestamp) => {
    return new Date(timestamp + 'Z').toLocaleString();
  };

  const isProducerActive = (producer) => {
    return activeProducers.includes(producer);
  };

  const isProducerInSchedule = (producer) => {
    return currentSchedule.includes(producer);
  };

  const getApprovalCounts = (proposal) => {
    const provided = proposal.provided_approvals || [];
    const requested = proposal.requested_approvals || [];
    
    // Get the list of all active producers (combining schedule and active producers)
    const allActiveProducers = [...new Set([...currentSchedule, ...activeProducers])];
    
    // Count requested approvals from active producers
    const requestedActiveProducers = requested
      .filter(a => allActiveProducers.includes(a.level.actor))
      .map(a => a.level.actor);
    
    // Count provided approvals from active producers
    const providedActiveProducers = provided
      .filter(a => allActiveProducers.includes(a.level.actor))
      .map(a => a.level.actor);

    // Total requested is the sum of current provided and pending requested
    const totalRequested = provided.length + requested.length;

    return {
      provided: {
        total: provided.length,
        active: providedActiveProducers.length,
        required: 21
      },
      requested: {
        total: requested.length,
        active: requestedActiveProducers.length,
        required: 21
      },
      totalRequired: totalRequested
    };
  };

  const getBloksUrl = (proposal) => {
    const baseUrl = 'https://local.bloks.io/msig';
    const params = new URLSearchParams({
      nodeUrl: getApiEndpoint(),
      coreSymbol: 'LIBRE',
      systemDomain: 'eosio',
      hyperionUrl: getApiEndpoint()
    });
    return `${baseUrl}/${proposal.scope}/${proposal.proposal_name}?${params.toString()}`;
  };

  const getMsigAppUrl = (proposal) => {
    return `https://msig.app/libre/${proposal.scope}/${proposal.proposal_name}/`;
  };

  const getLatestTimestamp = (proposal) => {
    const provided = proposal.provided_approvals || [];
    if (provided.length === 0) return 0;
    
    // Get the latest timestamp from provided approvals
    return Math.max(...provided.map(a => new Date(a.time).getTime()));
  };

  return (
    <div className="container">
      <h2 className="mb-4">Multisig Proposals</h2>
      
      <div className="mb-4" style={{ maxWidth: '300px' }}>
        <NetworkSelector
          network={network}
          setNetwork={setNetwork}
          customEndpoint={customEndpoint}
          setCustomEndpoint={setCustomEndpoint}
          customEndpointError={customEndpointError}
          setCustomEndpointError={setCustomEndpointError}
        />
      </div>

      {error && (
        <Alert variant="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <div className="text-center">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      ) : (
        <div>
          {proposals
            .sort((a, b) => getLatestTimestamp(b) - getLatestTimestamp(a))
            .map((proposal) => (
            <Card key={`${proposal.scope}-${proposal.proposal_name}`} className="mb-4">
              <Card.Header className="d-flex justify-content-between align-items-center">
                <div>
                  <h5 className="mb-0">
                    {proposal.proposal_name}
                    <small className="text-muted ms-2">by {proposal.scope}</small>
                  </h5>
                  {(() => {
                    const counts = getApprovalCounts(proposal);
                    return (
                      <small className="text-muted">
                        {counts.provided.total} of {counts.totalRequired} total signers ({counts.provided.active} of 21 active producers)
                      </small>
                    );
                  })()}
                </div>
                <div className="d-flex gap-2">
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => window.open(getMsigAppUrl(proposal), '_blank')}
                    disabled={network !== 'mainnet'}
                    title={network !== 'mainnet' ? 'msig.app is only available on mainnet' : ''}
                  >
                    msig.app
                  </Button>
                  <Button
                    variant="outline-primary"
                    size="sm"
                    onClick={() => window.open(getBloksUrl(proposal), '_blank')}
                  >
                    bloks.io
                  </Button>
                </div>
              </Card.Header>
              <Card.Body>
                <div className="row">
                  <div className="col-md-6">
                    <h6>
                      Requested Approvals 
                      {(() => {
                        const counts = getApprovalCounts(proposal);
                        return (
                          <small className="text-muted ms-2">
                            ({counts.requested.total} of {counts.totalRequired}, {counts.requested.active} active pending)
                          </small>
                        );
                      })()}
                    </h6>
                    <div className="d-flex flex-wrap gap-2 mb-3">
                      {proposal.requested_approvals
                        .sort((a, b) => {
                          const aIsActive = isProducerInSchedule(a.level.actor);
                          const bIsActive = isProducerInSchedule(b.level.actor);
                          if (aIsActive && !bIsActive) return -1;
                          if (!aIsActive && bIsActive) return 1;
                          return a.level.actor.localeCompare(b.level.actor);
                        })
                        .map((approval) => (
                          <Badge 
                            key={approval.level.actor}
                            bg={isProducerInSchedule(approval.level.actor) ? 'primary' : 'secondary'}
                          >
                            {approval.level.actor}
                          </Badge>
                        ))}
                    </div>
                  </div>
                  <div className="col-md-6">
                    <h6>
                      Provided Approvals
                      {(() => {
                        const counts = getApprovalCounts(proposal);
                        return (
                          <small className="text-muted ms-2">
                            ({counts.provided.total} of {counts.totalRequired} total, {counts.provided.active} of 21 active)
                          </small>
                        );
                      })()}
                    </h6>
                    <div className="d-flex flex-wrap gap-2">
                      {proposal.provided_approvals
                        .sort((a, b) => {
                          const aIsActive = isProducerInSchedule(a.level.actor);
                          const bIsActive = isProducerInSchedule(b.level.actor);
                          if (aIsActive && !bIsActive) return -1;
                          if (!aIsActive && bIsActive) return 1;
                          return new Date(b.time).getTime() - new Date(a.time).getTime();
                        })
                        .map((approval) => (
                          <Badge 
                            key={approval.level.actor}
                            bg={isProducerInSchedule(approval.level.actor) ? 'success' : 'secondary'}
                            title={new Date(approval.time).toLocaleString()}
                          >
                            {approval.level.actor} ({new Date(approval.time).toLocaleString()})
                          </Badge>
                        ))}
                    </div>
                  </div>
                </div>
              </Card.Body>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default MultisigProposals;
