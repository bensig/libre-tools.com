import React, { useState } from "react";
import { Form, Button, Table, Alert, Spinner, Modal, Button as ModalButton } from "react-bootstrap";

const LibreExplorer = () => {
  const NETWORK_ENDPOINTS = {
    mainnet: 'https://lb.libre.org',
    testnet: 'https://testnet.libre.org',
  };

  const [network, setNetwork] = useState('mainnet');
  const [customEndpoint, setCustomEndpoint] = useState('');
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
  const [warningMessage, setWarningMessage] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [firstKey, setFirstKey] = useState(null);
  const [searchKey, setSearchKey] = useState('');
  const [searchField, setSearchField] = useState('');
  const [isSearchable, setIsSearchable] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [customEndpointError, setCustomEndpointError] = useState('');
  const [showCustomEndpoint, setShowCustomEndpoint] = useState(false);

  const getApiEndpoint = (baseUrl) => {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    return `${cleanUrl}/v1/chain`;
  };

  const formatEndpoint = (url) => {
    // Remove any trailing slashes
    let cleanUrl = url.trim().replace(/\/$/, '');
    
    // If no protocol specified, add https://
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    
    return cleanUrl;
  };

  const isValidUrl = (url) => {
    try {
      // Format the URL first
      const formattedUrl = formatEndpoint(url);
      new URL(formattedUrl);
      return true;
    } catch {
      return false;
    }
  };

  const fetchWithCorsHandling = async (baseEndpoint, path, options = {}) => {
    try {
      const formattedEndpoint = formatEndpoint(baseEndpoint);
      const apiEndpoint = getApiEndpoint(formattedEndpoint);
      const url = `${apiEndpoint}${path}`;
      console.log('Fetching from:', url);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          'Accept': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
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
      const abiResponse = await fetchWithCorsHandling(
        network === 'custom' ? customEndpoint : NETWORK_ENDPOINTS[network],
        '/get_abi',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_name: accountName }),
        }
      );
      const abiData = await abiResponse.json();
      if (abiData.error) {
        throw new Error(abiData.error.details?.[0]?.message || 'Invalid account');
      }
      
      const abiTables = abiData.abi?.tables || [];
      console.log('ABI Tables:', abiTables);
      
      // Get scope data
      console.log('Fetching scope data...');
      const scopeResponse = await fetchWithCorsHandling(
        network === 'custom' ? customEndpoint : NETWORK_ENDPOINTS[network],
        '/get_table_by_scope',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            code: accountName,
            limit: 100
          }),
        }
      );
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
    
    // Reset ALL state
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    setFirstKey(null);
    setWarningMessage(null);
    setError(null);
    setIsInitialLoad(true);
    setSearchKey('');
    setIsSearching(false);
    setScope(null);  // Clear scope
    
    if (!table) {
      console.log('No table selected, returning');
      return;
    }

    setSelectedTable(table);
    setRows([]);
    
    try {
      // Get all scopes for this table from the initial scope data
      console.log('Fetching scope data for table:', table);
      const response = await fetchWithCorsHandling(
        network === 'custom' ? customEndpoint : NETWORK_ENDPOINTS[network],
        `/get_table_by_scope`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            code: accountName,
            table: table,
            limit: 100
          }),
        }
      );
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

  const determineSearchField = (rows) => {
    if (!rows || rows.length === 0) return null;
    
    // Get the first row to examine its structure
    const firstRow = rows[0];
    
    // Common searchable fields and their display names
    const searchableFields = {
      'account': 'account name',
      'id': 'ID',
      'from': 'sender',
      'to': 'recipient'
    };
    
    // Find the first searchable field
    const field = Object.keys(firstRow).find(key => searchableFields.hasOwnProperty(key));
    
    return field ? { field, displayName: searchableFields[field] } : null;
  };

  const fetchTableRows = async (direction = 'forward', scopeOverride = null, tableOverride = null, append = false) => {
    console.log('=== fetchTableRows called ===');
    console.log('Direction:', direction);
    console.log('Scope override:', scopeOverride);
    console.log('Append:', append);
    
    const currentScope = scopeOverride || scope;
    const currentTable = tableOverride || selectedTable;
    
    console.log('Current state - Table:', currentTable, 'Scope:', currentScope);
    
    if (!currentTable || !currentScope) {
      console.log('Missing table or scope, returning');
      return;
    }

    try {
      const params = {
        code: accountName,
        table: currentTable,
        scope: currentScope,
        limit: 10,
        json: true,
        reverse: direction === 'backward'
      };

      // Handle search parameters if searching
      if (searchKey && searchField) {
        params.lower_bound = searchKey;
        params.upper_bound = searchKey;
      } else if (isInitialLoad) {
        // Don't add any bounds for initial load
      } else if (direction === 'forward' && nextKey) {
        params.lower_bound = nextKey;
      } else if (direction === 'backward' && previousKeys.length > 0 && currentPage > 0) {
        params.upper_bound = previousKeys[previousKeys.length - 1];
      }

      console.log('Fetching rows with params:', params);
      const apiEndpoint = network === 'custom' ? customEndpoint : NETWORK_ENDPOINTS[network];
      const response = await fetchWithCorsHandling(
        apiEndpoint,
        `/get_table_rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
      
      const data = await response.json();
      console.log('Table rows response:', data);
      
      if (data.error) {
        throw new Error(data.error.details?.[0]?.message || 'Error fetching rows');
      }

      if (!data.rows || data.rows.length === 0) {
        if (isSearching) {
          setWarningMessage(`No results found for ${searchField}: "${searchKey}"`);
        } else {
          const curlCommand = `curl -X POST ${apiUrl}/get_table_rows -H "Content-Type: application/json" -d '${JSON.stringify(params)}'`;
          setWarningMessage(`No data found in scope "${currentScope}". You can verify using:\n${curlCommand}`);
        }
        setRows([]);
        return;
      } else {
        setWarningMessage(null);
      }

      if (isInitialLoad) {
        setFirstKey(data.rows[0]?.account || null);
        setIsInitialLoad(false);
      }

      // Update page counter only when not on initial load
      if (!append && !isInitialLoad) {
        if (direction === 'forward') {
          setCurrentPage(prev => prev + 1);
        } else if (direction === 'backward' && currentPage > 0) {
          setCurrentPage(prev => prev - 1);
        }
      }

      // Handle rows based on append flag and direction
      if (append) {
        setRows(prevRows => [...prevRows, ...data.rows]);
      } else {
        setRows(data.rows);
      }
      
      setNextKey(data.next_key);
      
      if (direction === 'forward' && !append) {
        setPreviousKeys(prev => [...prev, data.next_key]);
      } else if (direction === 'backward' && currentPage > 0) {
        setPreviousKeys(prev => prev.slice(0, -1));
      }

      // Check if table is searchable after getting first results
      if (isInitialLoad && data.rows.length > 0) {
        const searchInfo = determineSearchField(data.rows);
        setIsSearchable(!!searchInfo);
        if (searchInfo) {
          setSearchField(searchInfo.field);
        }
      }
    } catch (error) {
      console.error('Error in fetchTableRows:', error);
      if (error.message.includes('CORS')) {
        setError('CORS error: Unable to access API. Please try a different endpoint or use a CORS proxy.');
      } else {
        setError(error.message);
      }
      setRows([]);
    } finally {
      setIsLoading(false);
      setIsSearching(false);
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

  const handleScopeChange = (newScope) => {
    setScope(newScope);
    setWarningMessage(null);
    setError(null);
    setRows([]);
    fetchTableRows('forward', newScope, selectedTable);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchKey.trim()) return;
    
    setIsSearching(true);
    setWarningMessage(null);
    setError(null);
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    setRows([]);
    fetchTableRows('forward');
  };

  // Add refresh function
  const refreshCurrentView = async () => {
    setIsLoading(true);
    setWarningMessage(null);
    setError(null);

    // If we have more than 100 rows, reset to first 10
    if (rows.length > 100) {
      setRows([]);
      setCurrentPage(0);
      setPreviousKeys([]);
      setNextKey(null);
      await fetchTableRows('forward');
      return;
    }

    // Otherwise refresh current view
    try {
      const params = {
        code: accountName,
        table: selectedTable,
        scope: scope,
        limit: 10,
        json: true
      };

      // Add search params if searching
      if (searchKey && searchField) {
        params.lower_bound = searchKey;
        params.upper_bound = searchKey;
      }

      console.log('Refreshing with params:', params);
      
      const response = await fetchWithCorsHandling(
        network === 'custom' ? customEndpoint : NETWORK_ENDPOINTS[network],
        `/get_table_rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
      
      const data = await response.json();
      
      if (!data.rows || data.rows.length === 0) {
        setWarningMessage(`No data found in scope "${scope}"`);
        setRows([]);
      } else {
        setRows(data.rows);
        setNextKey(data.next_key);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Update clear search function to explicitly fetch new data
  const clearSearch = async () => {
    setIsLoading(true);
    
    // Clear search state
    setSearchKey('');
    setIsSearching(false);
    
    // Clear pagination state
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    
    // Clear any errors or warnings
    setWarningMessage(null);
    setError(null);
    
    // Clear rows to show loading state
    setRows([]);
    
    try {
      const params = {
        code: accountName,
        table: selectedTable,
        scope: scope,
        limit: 10,
        json: true
      };
      
      console.log('Clearing search, fetching with params:', params);
      
      const response = await fetchWithCorsHandling(
        network === 'custom' ? customEndpoint : NETWORK_ENDPOINTS[network],
        `/get_table_rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
      
      const data = await response.json();
      
      if (!data.rows || data.rows.length === 0) {
        setWarningMessage(`No data found in scope "${scope}"`);
        setRows([]);
      } else {
        setRows(data.rows);
        setNextKey(data.next_key);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchABI = async () => {
    setIsLoading(true);
    setError(null);

    const baseEndpoint = network === 'custom' ? customEndpoint : NETWORK_ENDPOINTS[network];

    // Validate custom endpoint
    if (network === 'custom') {
      if (!customEndpoint) {
        setCustomEndpointError('API endpoint is required');
        setIsLoading(false);
        return;
      }
      if (!isValidUrl(customEndpoint)) {
        setCustomEndpointError('Must be a valid domain name');
        setIsLoading(false);
        return;
      }
    }

    try {
      const response = await fetchWithCorsHandling(
        baseEndpoint,
        '/get_abi',
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_name: accountName }),
        }
      );

      const data = await response.json();
      // ... rest of the function
    } catch (error) {
      console.error('Error fetching ABI:', error);
      setError(`Error fetching ABI: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Libre Table Explorer</h1>
      
      <Form className="mb-4">
        <Form.Group className="mb-3">
          <Form.Label>Network</Form.Label>
          <Form.Select
            value={network}
            onChange={(e) => {
              setNetwork(e.target.value);
              setCustomEndpointError('');
              if (e.target.value === 'custom') {
                setShowCustomEndpoint(true);
              } else {
                setShowCustomEndpoint(false);
                setCustomEndpoint('');
              }
            }}
          >
            <option value="mainnet">Mainnet</option>
            <option value="testnet">Testnet</option>
            <option value="custom">Custom Endpoint</option>
          </Form.Select>
          {showCustomEndpoint && (
            <div className="mt-2">
              <Form.Control
                type="text"
                placeholder="Enter API endpoint (e.g., api.example.com)"
                value={customEndpoint}
                onChange={(e) => {
                  setCustomEndpoint(e.target.value);
                  setCustomEndpointError('');
                }}
                isInvalid={!!customEndpointError}
              />
              <Form.Control.Feedback type="invalid">
                {customEndpointError}
              </Form.Control.Feedback>
              <Form.Text className="text-muted">
                HTTPS will be used by default if protocol is not specified
              </Form.Text>
            </div>
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

        {selectedTable && scopes.length > 0 && (
          <Form.Group className="mb-3">
            <Form.Label>Scope</Form.Label>
            <div className="d-flex gap-2">
              <Form.Select
                value={scope || ''}
                onChange={(e) => handleScopeChange(e.target.value)}
              >
                <option value="">Select a scope</option>
                {scopes.map((scopeOption) => (
                  <option key={scopeOption.scope} value={scopeOption.scope}>
                    {scopeOption.scope} ({scopeOption.count} rows)
                  </option>
                ))}
              </Form.Select>
              {rows.length > 0 && (
                <Button 
                  variant="outline-primary"
                  onClick={refreshCurrentView}
                  disabled={isLoading}
                >
                  <i className="bi bi-arrow-clockwise me-1"></i>
                  Refresh
                </Button>
              )}
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

      {/* Add search form */}
      {isSearchable && rows.length > 0 && (
        <Form onSubmit={handleSearch} className="mt-3">
          <Form.Group className="d-flex gap-2">
            <Form.Control
              type="text"
              placeholder={`Search by ${searchField}`}
              value={searchKey}
              onChange={(e) => setSearchKey(e.target.value)}
            />
            <Button type="submit" variant="primary" disabled={isLoading}>
              Search
            </Button>
            {searchKey && (
              <Button 
                variant="secondary" 
                onClick={clearSearch}
                disabled={isLoading}
              >
                Clear
              </Button>
            )}
          </Form.Group>
          <Form.Text className="text-muted">
            Enter exact {searchField} to search
          </Form.Text>
        </Form>
      )}

      <div className="table-container">
        {isLoading ? (
          <div className="text-center p-4">
            <Spinner animation="border" role="status">
              <span className="visually-hidden">Loading...</span>
            </Spinner>
          </div>
        ) : isSearching ? (
          <div className="fade mb-3 alert alert-info show">
            Searching for {searchField}: "{searchKey}"...
          </div>
        ) : (
          <>
            {warningMessage && (
              <div className="fade mb-3 alert alert-warning show">
                <pre>{warningMessage}</pre>
              </div>
            )}

            {error && !warningMessage && (
              <div className="alert alert-danger mt-3">
                <pre>{error}</pre>
              </div>
            )}

            {selectedTable && scope && rows.length === 0 ? (
              <Alert variant="warning" className="mb-3">
                <pre style={{ whiteSpace: 'pre-wrap', marginBottom: 0, fontSize: '0.9em' }}>
                  No data found in scope "{scope}" for table "{selectedTable}".
                </pre>
              </Alert>
            ) : rows.length > 0 ? (
              <>
                <div className="table-responsive mt-3">
                  <table className="table table-striped table-sm">
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
                  </table>
                </div>
                
                {/* Pagination buttons */}
                <div className="d-flex justify-content-between align-items-center mt-3">
                  <div className="d-flex gap-2">
                    {(!isInitialLoad && currentPage > 0 && firstKey) ? (
                      <Button 
                        variant="primary" 
                        onClick={() => fetchTableRows('backward')}
                        disabled={isLoading}
                      >
                        Previous
                      </Button>
                    ) : (
                      <Button 
                        variant="secondary" 
                        disabled
                      >
                        Previous
                      </Button>
                    )}
                    {nextKey ? (
                      <Button 
                        variant="primary" 
                        onClick={() => fetchTableRows('forward')}
                        disabled={isLoading}
                      >
                        Next
                      </Button>
                    ) : (
                      <Button 
                        variant="secondary" 
                        disabled
                      >
                        Next
                      </Button>
                    )}
                  </div>
                  
                  {/* Load More button */}
                  {nextKey && (
                    <Button 
                      variant="primary" 
                      onClick={() => fetchTableRows('forward', null, null, true)}
                      disabled={isLoading}
                    >
                      Load More Rows
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
};

export default LibreExplorer; 