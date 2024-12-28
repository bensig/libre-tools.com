import React, { useState } from "react";
import { Form, Button, Table, Alert, Spinner, Modal, Button as ModalButton } from "react-bootstrap";

const LibreExplorer = () => {
  const NETWORKS = {
    mainnet: "https://lb.libre.org/v1/chain",
    testnet: "https://testnet.libre.org/v1/chain",
    custom: "custom"
  };

  const [networkType, setNetworkType] = useState('mainnet');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [apiUrl, setApiUrl] = useState(NETWORKS.mainnet);
  const [accountName, setAccountName] = useState("");
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [scope, setScope] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [nextKey, setNextKey] = useState(null);
  const [previousKeys, setPreviousKeys] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [limit] = useState(10);
  const [showCustomScopeModal, setShowCustomScopeModal] = useState(false);
  const [customScopeInput, setCustomScopeInput] = useState('');

  const handleNetworkChange = (type) => {
    setNetworkType(type);
    if (type === 'custom') {
      if (customEndpoint) {
        setApiUrl(customEndpoint);
      }
    } else {
      setApiUrl(NETWORKS[type]);
    }
    // Reset state when changing networks
    setTables([]);
    setSelectedTable("");
    setScope("");
    setRows([]);
    setScopes([]);
  };

  const handleCustomEndpointChange = (endpoint) => {
    setCustomEndpoint(endpoint);
    if (networkType === 'custom') {
      setApiUrl(endpoint);
      // Reset state when changing endpoint
      setTables([]);
      setSelectedTable("");
      setScope("");
      setRows([]);
      setScopes([]);
    }
  };

  const fetchTables = async () => {
    if (!accountName) return;
    
    setError(null);
    setIsLoading(true);
    console.log('=== Starting fetchTables for account:', accountName, '===');
    
    try {
      // Get ABI tables
      console.log('Fetching ABI...');
      const abiResponse = await fetch(`${apiUrl}/get_abi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_name: accountName }),
      });
      const abiData = await abiResponse.json();
      if (abiData.error) {
        throw new Error(abiData.error.details?.[0]?.message || 'Invalid account');
      }
      
      const abiTables = abiData.abi?.tables || [];
      console.log('ABI Tables:', abiTables);
      
      // Get scope data
      console.log('Fetching scope data...');
      const scopeResponse = await fetch(`${apiUrl}/get_table_by_scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          code: accountName,
          limit: 100
        }),
      });
      const scopeData = await scopeResponse.json();
      console.log('Raw scope data:', scopeData.rows);
      
      // Create a map of base tables to their best scopes
      const tableData = {};
      
      // First, add all ABI tables to ensure we don't miss any
      abiTables.forEach(table => {
        tableData[table.name] = {
          table: table.name,
          scope: accountName, // default scope
          count: 0
        };
      });
      
      // Then update with actual scope data
      scopeData.rows.forEach(row => {
        const baseTable = row.table.replace(/\.\.\.?\d+$/, '');
        if (!tableData[baseTable] || tableData[baseTable].count < row.count) {
          tableData[baseTable] = {
            table: baseTable,
            scope: row.scope,
            count: row.count
          };
        }
      });
      
      console.log('Processed table data:', tableData);

      // Get all available tables from ABI
      const availableTables = abiTables
        .map(table => table.name)
        .sort();

      console.log('Final available tables:', availableTables);
      setTables(availableTables);

      // Auto-select first table
      if (availableTables.length > 0) {
        const firstTable = availableTables[0];
        console.log('Auto-selecting first table:', firstTable);
        // Set the table state first
        setSelectedTable(firstTable);
        // Then fetch data with the known table value
        await handleTableSelect({ target: { value: firstTable } });
      }
    } catch (error) {
      console.error('Error in fetchTables:', error);
      setError(error.message);
      setTables([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTableSelect = async (e) => {
    const table = e.target.value;
    console.log('=== handleTableSelect called with table:', table, '===');
    if (!table) {
      console.log('No table selected, returning');
      return;
    }

    // Update state synchronously
    setSelectedTable(table);
    setRows([]);
    setNextKey(null);
    setPreviousKeys([]);
    
    try {
      // Get all scopes for this table from the initial scope data
      console.log('Fetching scope data for table:', table);
      const response = await fetch(`${apiUrl}/get_table_by_scope`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          code: accountName,
          table: table,
          limit: 100
        }),
      });
      const data = await response.json();
      console.log('Raw scope data for table:', data.rows);
      
      // Filter scopes for this table (including variants with dots)
      const validScopes = data.rows
        .filter(row => row.table.replace(/\.\.\.?\d+$/, '') === table)
        .reduce((acc, row) => {
          const baseScope = row.scope;
          if (!acc[baseScope] || acc[baseScope].count < row.count) {
            acc[baseScope] = row;
          }
          return acc;
        }, {});

      const scopeList = Object.values(validScopes)
        .sort((a, b) => b.count - a.count);
      
      console.log('Sorted scope list:', scopeList);

      // Always include the contract account as a scope option if not already present
      if (!scopeList.find(s => s.scope === accountName)) {
        scopeList.push({
          code: accountName,
          scope: accountName,
          table: table,
          payer: accountName,
          count: 0
        });
      }

      setScopes(scopeList);

      // Select the scope with the most rows, or default to contract account
      const bestScope = scopeList.length > 0 ? 
        (scopeList.find(s => s.count > 0)?.scope || accountName) : 
        accountName;
      
      console.log('Selected scope:', bestScope);
      setScope(bestScope);
      
      // Use the current table value directly
      await fetchTableRows('forward', bestScope, table);
    } catch (error) {
      console.error('Error in handleTableSelect:', error);
      setError(error.message);
    }
  };

  const handleAccountSubmit = (e) => {
    e.preventDefault(); // Prevent form submission
    fetchTables();
  };

  const fetchTableRows = async (direction = 'forward', scopeOverride = null, tableOverride = null) => {
    console.log('=== fetchTableRows called ===');
    console.log('Direction:', direction);
    console.log('Scope override:', scopeOverride);
    console.log('Current state - Table:', selectedTable, 'Scope:', scope);
    
    setError(null);
    setIsLoading(true);
    try {
      const currentScope = scopeOverride || scope || accountName;
      const params = {
        code: accountName,
        table: tableOverride || selectedTable,
        scope: currentScope,
        limit: limit,
        json: true,
        reverse: direction === 'backward'
      };

      console.log('Fetching rows with params:', params);
      const response = await fetch(`${apiUrl}/get_table_rows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      
      const data = await response.json();
      console.log('Table rows response:', data);
      
      if (data.error) {
        throw new Error(data.error.details?.[0]?.message || 'Error fetching rows');
      }

      if (!data.rows || data.rows.length === 0) {
        const curlCommand = `curl -X POST ${apiUrl}/get_table_rows -H "Content-Type: application/json" -d '${JSON.stringify(params)}'`;
        console.log('No rows found. Curl command:', curlCommand);
        setError(`No data found in scope "${currentScope}". You can verify using:\n${curlCommand}`);
        setRows([]);
        return;
      }

      setRows(data.rows);
      setNextKey(data.next_key);
      
      if (direction === 'forward' && data.next_key) {
        setPreviousKeys([...previousKeys, data.next_key]);
      } else if (direction === 'backward') {
        setPreviousKeys(previousKeys.slice(0, -1));
      }
    } catch (error) {
      console.error('Error in fetchTableRows:', error);
      setError(error.message);
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to format cell values
  const formatCellValue = (value) => {
    if (value === null || value === undefined) return '';
    
    // If it's an object or array, stringify it with proper formatting
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    
    // For simple values, just convert to string
    return String(value);
  };

  const handleCustomScopeSubmit = async () => {
    if (!customScopeInput.trim()) return;
    
    setShowCustomScopeModal(false);
    setScope(customScopeInput);
    setRows([]);
    setError(null);
    await fetchTableRows('forward', customScopeInput, selectedTable);
    setCustomScopeInput('');
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Libre Table Explorer</h1>
      
      <Form className="mb-4">
        <Form.Group className="mb-3">
          <Form.Label>Network</Form.Label>
          <div className="mb-3">
            <Form.Check
              inline
              type="radio"
              name="network"
              label="Mainnet"
              checked={networkType === 'mainnet'}
              onChange={() => handleNetworkChange('mainnet')}
            />
            <Form.Check
              inline
              type="radio"
              name="network"
              label="Testnet"
              checked={networkType === 'testnet'}
              onChange={() => handleNetworkChange('testnet')}
            />
            <Form.Check
              inline
              type="radio"
              name="network"
              label="Custom"
              checked={networkType === 'custom'}
              onChange={() => handleNetworkChange('custom')}
            />
          </div>
          {networkType === 'custom' && (
            <Form.Control
              type="text"
              value={customEndpoint}
              onChange={(e) => handleCustomEndpointChange(e.target.value)}
              placeholder="Enter API endpoint (e.g., http://localhost:8888/v1/chain)"
              className="mb-3"
            />
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Account Name</Form.Label>
          <div className="d-flex gap-2">
            <Form.Control
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Enter account name"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  fetchTables();
                }
              }}
            />
            <Button 
              variant="primary"
              onClick={fetchTables}
              disabled={isLoading}
            >
              {isLoading ? <Spinner size="sm" /> : 'Fetch Tables'}
            </Button>
          </div>
        </Form.Group>

        {tables.length > 0 && (
          <Form.Group className="mb-3">
            <Form.Label>Select Table</Form.Label>
            <Form.Select 
              value={selectedTable}
              onChange={handleTableSelect}
            >
              <option value="">-- Select Table --</option>
              {tables.map((table) => (
                <option key={table} value={table}>{table}</option>
              ))}
            </Form.Select>
          </Form.Group>
        )}

        {selectedTable && (
          <Form.Group className="mb-3">
            <Form.Label>Scope</Form.Label>
            <div className="d-flex gap-2">
              <Form.Select
                value={scope}
                onChange={(e) => {
                  if (e.target.value === 'custom') {
                    setShowCustomScopeModal(true);
                  } else {
                    setScope(e.target.value);
                    setRows([]);
                    setError(null);
                    fetchTableRows('forward', e.target.value, selectedTable);
                  }
                }}
              >
                {scopes.map(({ scope: scopeOption, count }) => (
                  <option key={scopeOption} value={scopeOption}>
                    {scopeOption} ({count.toLocaleString()} rows)
                  </option>
                ))}
                <option value="custom">Custom Scope...</option>
              </Form.Select>
            </div>
          </Form.Group>
        )}

        {/* Custom Scope Modal */}
        <Modal show={showCustomScopeModal} onHide={() => setShowCustomScopeModal(false)}>
          <Modal.Header closeButton>
            <Modal.Title>Enter Custom Scope</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Form.Group>
              <Form.Label>Scope Name</Form.Label>
              <Form.Control
                type="text"
                value={customScopeInput}
                onChange={(e) => setCustomScopeInput(e.target.value)}
                placeholder="Enter scope name"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCustomScopeSubmit();
                  }
                }}
              />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <ModalButton variant="secondary" onClick={() => setShowCustomScopeModal(false)}>
              Cancel
            </ModalButton>
            <ModalButton variant="primary" onClick={handleCustomScopeSubmit}>
              Try Scope
            </ModalButton>
          </Modal.Footer>
        </Modal>
      </Form>

      <div className="table-container">
        {isLoading ? (
          <div className="text-center p-4">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
          </div>
        ) : error || (selectedTable && scope && rows.length === 0) ? (
          <Alert variant="warning" className="mb-3">
            <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0, fontSize: '0.9em' }}>
              {error || `No data found in scope "${scope}" for table "${selectedTable}".`}
            </pre>
          </Alert>
        ) : rows.length > 0 ? (
          <>
            <div className="d-flex gap-2 mb-3">
              <Button
                variant="secondary"
                onClick={() => fetchTableRows('backward')}
                disabled={!previousKeys.length || isLoading}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => fetchTableRows('forward')}
                disabled={!nextKey || isLoading}
              >
                Next
              </Button>
            </div>

            <Table striped bordered hover>
              <thead>
                <tr>
                  {Object.keys(rows[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index}>
                    {Object.values(row).map((value, idx) => (
                      <td key={idx} style={{ whiteSpace: 'pre-wrap' }}>
                        {formatCellValue(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default LibreExplorer; 