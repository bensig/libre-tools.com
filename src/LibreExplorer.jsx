import React, { useState, useEffect, useRef } from "react";
import { Form, Button, Table, Alert, Spinner, Modal, Button as ModalButton, Toast, ToastContainer } from "react-bootstrap";
import NetworkSelector from './components/NetworkSelector';
import { useParams, useNavigate } from 'react-router-dom';

const LibreExplorer = () => {
  const { network: urlNetwork, contract, view: urlView, item: urlItem, scope: urlScope } = useParams();
  const navigate = useNavigate();
  const initialized = useRef(false);

  const NETWORK_ENDPOINTS = {
    mainnet: 'https://lb.libre.org',
    testnet: 'https://testnet.libre.org',
  };

  const EXAMPLE_ACCOUNTS = [
    'x.libre',
    'mining.libre',
    'dex.libre',
    'loan'
  ];

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
  const [limit] = useState(100);
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
  const [view, setView] = useState('tables');
  const [actions, setActions] = useState([]);
  const [abiData, setAbiData] = useState(null);
  const [showActionCommand, setShowActionCommand] = useState(false);
  const [actionCommand, setActionCommand] = useState('');

  // Add useEffect for autofocus
  useEffect(() => {
    document.querySelector('[name=accountName]')?.focus();
  }, []);

  // Define global function in useEffect
  useEffect(() => {
    window.handleExampleClick = (account) => {
      setError(null);  // Clear the error state
      setAccountName(account);
      setTimeout(() => fetchTables(), 0);
    };

    // Cleanup
    return () => {
      window.handleExampleClick = undefined;
    };
  }, []); // Empty dependency array means this runs once on mount

  // Add this useEffect for network changes
  useEffect(() => {
    // Clear all data when network changes
    setTables([]);
    setActions([]);
    setAbiData(null);
    setSelectedTable(null);
    setRows([]);
    setScope(null);
    setError(null);
    
    // If we have an account name, refetch the data
    if (accountName) {
        fetchTables();
    }
  }, [network, customEndpoint]); // Trigger when network or customEndpoint changes

  useEffect(() => {
    console.log('ABI Data changed:', abiData);
  }, [abiData]);

  useEffect(() => {
    console.log('Actions changed:', actions);
  }, [actions]);

  // Add this useEffect for initialization
  useEffect(() => {
    console.log('URL params:', { urlNetwork, contract, urlView, urlItem, urlScope });
    
    if (!initialized.current && urlNetwork && contract) {
      console.log('Initializing with network:', urlNetwork, 'and contract:', contract);
      
      // Prepare state updates
      let networkUpdate = 'mainnet';
      let endpointUpdate = '';
      let contractName = contract;

      if (urlNetwork === 'testnet') {
        networkUpdate = 'testnet';
      } else if (urlNetwork === 'custom') {
        networkUpdate = 'custom';
        endpointUpdate = contract;
        contractName = urlItem;
      }

      // Set all state at once
      setNetwork(networkUpdate);
      setCustomEndpoint(endpointUpdate);
      setAccountName(contractName);
      
      initialized.current = true;
    }
  }, [urlNetwork, contract]); // Only depend on network and contract

  // Add useEffect for accountName changes
  useEffect(() => {
    if (accountName) {
      console.log('Account name set, fetching tables:', accountName);
      fetchTables();
    }
  }, [accountName]);

  // Add new useEffect for contract loading
  useEffect(() => {
    if (contract && network) { // Only proceed if both network and contract are set
      console.log('Loading contract:', contract);
      const contractName = urlNetwork === 'custom' ? urlItem : contract;
      console.log('Setting account name to:', contractName);
      setAccountName(contractName);
      setError(null);  // Clear any existing errors
      setTimeout(() => fetchTables(), 100); // Increased timeout to ensure network is ready
    }
  }, [network, contract]); // Depend on network state

  // Add useEffect for table selection and scope handling
  useEffect(() => {
    const fetchScopesForTable = async (tableName) => {
      try {
        console.log('Fetching scopes for table:', tableName);
        const response = await fetchWithCorsHandling(
          '/v1/chain/get_table_by_scope',
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              code: accountName,
              table: tableName,
              limit: 100
            }),
          }
        );
        const data = await response.json();
        console.log('Raw scope data:', data.rows);
        
        // Filter scopes for this table
        const validScopes = data.rows
          .filter(row => row.table.replace(/\.\.\.?\d+$/, '') === tableName)
          .reduce((acc, row) => {
            const baseScope = row.scope;
            if (!acc[baseScope] || acc[baseScope].count < row.count) {
              acc[baseScope] = row;
            }
            return acc;
          }, {});

        const scopeList = Object.values(validScopes)
          .sort((a, b) => b.count - a.count);
        
        // Always include the contract account as a scope option
        if (!scopeList.find(s => s.scope === accountName)) {
          scopeList.push({
            code: accountName,
            scope: accountName,
            table: tableName,
            payer: accountName,
            count: 0
          });
        }

        console.log('Setting scopes:', scopeList);
        setScopes(scopeList);

        // If URL has a scope, use it; otherwise use the one with most rows
        if (!scope) {
          const scopeToUse = urlScope || 
            (scopeList.length > 0 ? 
              (scopeList.find(s => s.count > 0)?.scope || accountName) : 
              accountName);
          
          console.log('Setting initial scope:', scopeToUse);
          setScope(scopeToUse);
          fetchTableRows('forward', scopeToUse, tableName);
        }
      } catch (error) {
        console.error('Error fetching scopes:', error);
        setError(error.message);
      }
    };

    if (selectedTable && accountName) {
      console.log('Selected table changed, fetching scopes:', selectedTable);
      fetchScopesForTable(selectedTable);
    }
  }, [selectedTable, accountName]); // Depend on selectedTable and accountName

  // Add useEffect for URL-based initialization
  useEffect(() => {
    if (urlItem && urlView === 'tables' && accountName) {
      setSelectedTable(urlItem);
      if (urlScope) {
        setScope(urlScope);
        fetchTableRows('forward', urlScope, urlItem);
      }
    }
  }, [urlView, urlItem, urlScope, accountName]);

  // Add this useEffect to monitor accountName changes
  useEffect(() => {
    console.log('Account name changed to:', accountName);
  }, [accountName]);

  // Add this useEffect for table changes
  useEffect(() => {
    if (selectedTable && accountName) {
      console.log('Selected table changed to:', selectedTable);
      updateURL();
    }
  }, [selectedTable]);

  // Add this useEffect for scope changes
  useEffect(() => {
    if (scope && selectedTable && accountName) {
      console.log('Scope changed to:', scope);
      updateURL();
    }
  }, [scope]);

  const getApiEndpoint = () => {
    if (network === 'custom') {
      if (!customEndpoint) {
        throw new Error('Custom endpoint is required');
      }
      return formatEndpoint(customEndpoint);
    }
    return NETWORK_ENDPOINTS[network];
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

  const fetchWithCorsHandling = async (path, options = {}) => {
    try {
      const apiEndpoint = getApiEndpoint();
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
        if (response.status === 400) {
          throw new Error('Account not found - are you on the right network?');
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      throw error;
    }
  };

  const fetchTables = async () => {
    if (!accountName) {
        console.log('No account name set, skipping fetch');
        return;
    }
    
    setIsLoading(true);
    setError(null);
    setTables([]);
    setActions([]);
    
    try {
        console.log('Fetching ABI for account:', accountName);
        // Get ABI data
        const abiResponse = await fetchWithCorsHandling(
            '/v1/chain/get_abi',
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_name: accountName }),
            }
        );
        const abiData = await abiResponse.json();
        console.log('Full ABI data:', abiData); // Debug log
        setAbiData(abiData); // Store the full ABI data
        
        if (!abiData.abi) {
            console.log('No ABI found for account:', accountName);
            setError(`No ABI found for account: ${accountName}`);
            return;
        }

        // Get actions from the ABI
        const abiActions = abiData.abi?.actions || [];
        console.log('Setting actions:', abiActions);
        setActions(abiActions);
        
        // Get tables from the ABI
        const abiTables = abiData.abi?.tables || [];
        console.log('Setting tables:', abiTables);
        setTables(abiTables.map(table => table.name));

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
    
    // Reset state but preserve scope if it exists in URL
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    setFirstKey(null);
    setWarningMessage(null);
    setError(null);
    setIsInitialLoad(true);
    setSearchKey('');
    setIsSearching(false);
    if (!urlScope) {
      setScope(null);  // Only clear scope if not in URL
    }
    
    if (!table) {
      console.log('No table selected, returning');
      return;
    }

    setSelectedTable(table);
    setRows([]);
    updateURL();
    
    try {
      // Get all scopes for this table from the initial scope data
      console.log('Fetching scope data for table:', table);
      const response = await fetchWithCorsHandling(
        '/v1/chain/get_table_by_scope',
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
      
      // Filter scopes for this table
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

      // Always include the contract account as a scope option
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

      // If URL has a scope, use it; otherwise use the one with most rows
      const scopeToUse = urlScope || 
        (scopeList.length > 0 ? 
          (scopeList.find(s => s.count > 0)?.scope || accountName) : 
          accountName);
      
      console.log('Selected scope:', scopeToUse);
      setScope(scopeToUse);

      // Fetch rows with the selected scope
      await fetchTableRows('forward', scopeToUse, table);
    } catch (error) {
      console.error('Error in handleTableSelect:', error);
      setError(error.message);
    }
  };

  const handleAccountSubmit = (e) => {
    e.preventDefault();
    
    if (!isValidLibreAccount(accountName)) {
      setError('Invalid account name. Must be 1-12 characters, only a-z, 1-5, and dots allowed.');
      return;
    }
    
    fetchTables();
    updateURL();
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
    // Show loading state immediately
    setIsLoading(true);
    setError(null);  // Clear any previous errors
    
    const currentScope = scopeOverride || scope;
    const currentTable = tableOverride || selectedTable;
    
    if (!currentTable || !currentScope) {
      setIsLoading(false);
      return;
    }

    try {
      const params = {
        code: accountName,
        table: currentTable,
        scope: currentScope,
        limit: limit,
        json: true,
        reverse: true
      };

      // Handle search parameters if searching
      if (searchKey && searchField) {
        params.lower_bound = searchKey;
        params.upper_bound = searchKey;
      } else if (isInitialLoad) {
        // Don't add any bounds for initial load
      } else if (direction === 'forward' && nextKey) {
        params.upper_bound = nextKey;
      } else if (direction === 'backward' && previousKeys.length > 0 && currentPage > 0) {
        params.lower_bound = previousKeys[previousKeys.length - 1];
      }

      console.log('Fetching rows with params:', params);
      const response = await fetchWithCorsHandling(
        '/v1/chain/get_table_rows',
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
        setRows([]);
        return;
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
      setError(error.message);
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
    updateURL(); // Add URL update here
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

    try {
      const params = {
        code: accountName,
        table: selectedTable,
        scope: scope,
        limit: limit,
        json: true
      };

      const response = await fetchWithCorsHandling(
        `/get_table_rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
      
      const data = await response.json();
      
      if (!data.rows || data.rows.length === 0) {
        setRows([]);  // Just clear the rows without setting a warning
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
    setSearchKey('');
    setIsSearching(false);
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    setWarningMessage(null);
    setError(null);
    setRows([]);
    
    try {
      const params = {
        code: accountName,
        table: selectedTable,
        scope: scope,
        limit: limit,
        json: true
      };
      
      const response = await fetchWithCorsHandling(
        `/get_table_rows`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        }
      );
      
      const data = await response.json();
      
      if (!data.rows || data.rows.length === 0) {
        setRows([]);  // Just clear the rows without setting a warning
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

    try {
        const response = await fetchWithCorsHandling(
            '/v1/chain/get_abi',
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ account_name: accountName }),
            }
        );

        const data = await response.json();
        console.log('Full ABI data:', data); // Debug log
        setAbiData(data); // Store the full ABI data
        
        if (data.abi) {
            // Get actions from the ABI
            setActions(data.abi.actions || []);
            // Get tables from the ABI
            setTables(data.abi.tables.map(table => table.name));
        }
    } catch (error) {
        console.error('Error fetching ABI:', error);
        setError(`Error fetching ABI: ${error.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  // Add lowercase enforcement to account name input
  const handleAccountNameChange = (e) => {
    const value = e.target.value.toLowerCase();
    setAccountName(value);
  };

  // Modify handleCustomScopeChange to remove toLowerCase()
  const handleCustomScopeChange = (e) => {
    setCustomScopeInput(e.target.value); // Remove toLowerCase()
  };

  // Add lowercase enforcement to search key
  const handleSearchKeyChange = (e) => {
    setSearchKey(e.target.value.toLowerCase());
  };

  // Add this validation function
  const isValidLibreAccount = (account) => {
    if (!account) return false;
    
    // Check length (1-12 characters)
    if (account.length < 1 || account.length > 12) return false;
    
    // Check for valid characters only (a-z, 1-5, .)
    if (!/^[a-z1-5.]+$/.test(account)) return false;
    
    // Cannot start or end with a dot
    if (account.startsWith('.') || account.endsWith('.')) return false;
    
    // Cannot have multiple consecutive dots
    if (account.includes('..')) return false;
    
    return true;
  };

  const ActionsList = ({ actions, abiData }) => {
    const [selectedAction, setSelectedAction] = useState(null);
    const [actionParams, setActionParams] = useState({});
    const [paramErrors, setParamErrors] = useState({});
    const [showActionCommand, setShowActionCommand] = useState(false);
    const [actionCommand, setActionCommand] = useState('');

    const findStructForAction = (actionType) => {
        const struct = abiData?.abi?.structs?.find(s => s.name === actionType);
        return struct?.fields || [];
    };

    const handleActionSelect = (action) => {
        setSelectedAction(action);
        setActionParams({});
        setParamErrors({});
        setShowActionCommand(false); // Reset command display when selecting new action
    };

    const validateField = (type, value) => {
        // Allow empty values during typing
        if (!value) return null;

        // Extract base type and size (if any)
        const [baseType, size] = type.split('_');

        switch (baseType.toLowerCase()) {
            case 'name':
                return isValidLibreAccount(value) ? null : "Invalid account name. Must be 1-12 chars using a-z, 1-5, and dots.";

            case 'uint':
            case 'uint8':
            case 'uint16':
            case 'uint32':
            case 'uint64':
                if (!/^\d+$/.test(value)) {
                    return "Must be a positive number";
                }
                const num = BigInt(value);
                const maxValues = {
                    'uint8': BigInt('255'),
                    'uint16': BigInt('65535'),
                    'uint32': BigInt('4294967295'),
                    'uint64': BigInt('18446744073709551615'),
                    'uint': BigInt('18446744073709551615') // Default to uint64 max
                };
                const maxVal = maxValues[baseType] || maxValues.uint;
                return num <= maxVal ? null : `Must be between 0 and ${maxVal.toString()}`;

            case 'int':
            case 'int8':
            case 'int16':
            case 'int32':
            case 'int64':
                if (!/^-?\d+$/.test(value)) {
                    return "Must be a number";
                }
                const intNum = BigInt(value);
                const intMaxValues = {
                    'int8': { min: BigInt('-128'), max: BigInt('127') },
                    'int16': { min: BigInt('-32768'), max: BigInt('32767') },
                    'int32': { min: BigInt('-2147483648'), max: BigInt('2147483647') },
                    'int64': { min: BigInt('-9223372036854775808'), max: BigInt('9223372036854775807') },
                    'int': { min: BigInt('-9223372036854775808'), max: BigInt('9223372036854775807') } // Default to int64
                };
                const { min, max } = intMaxValues[baseType] || intMaxValues.int;
                return (intNum >= min && intNum <= max) ? null : `Must be between ${min.toString()} and ${max.toString()}`;

            case 'float':
            case 'double':
                return /^-?\d*\.?\d*$/.test(value) ? null : "Must be a valid decimal number";

            case 'bool':
                return /^(true|false|0|1)$/.test(value.toLowerCase()) ? null : "Must be true/false or 1/0";

            case 'asset':
                // Format: "1.0000 SYMBOL" (4 decimals, symbol 1-7 chars)
                return /^\d+\.?\d*\s[A-Z]{1,7}$/.test(value) ? null : "Invalid asset format (e.g., '1.0000 LIBRE')";

            case 'symbol':
                // Symbol format: 3,LIBRE or LIBRE
                return /^(\d+,)?[A-Z]{1,7}$/.test(value) ? null : "Invalid symbol format (e.g., '4,LIBRE' or 'LIBRE')";

            case 'time':
            case 'time_point':
            case 'time_point_sec':
                // Accept Unix timestamp or ISO date string
                return /^\d+$/.test(value) || !isNaN(Date.parse(value)) ? null : "Invalid time format (use Unix timestamp or ISO date)";

            case 'checksum256':
                return /^[a-f0-9]{64}$/.test(value) ? null : "Must be 64 hexadecimal characters";

            case 'public_key':
                // Basic EOS public key format check
                return /^(EOS|PUB_K1_)[a-zA-Z0-9]+$/.test(value) ? null : "Invalid public key format";

            case 'signature':
                // Basic EOS signature format check
                return /^SIG_K1_[a-zA-Z0-9]+$/.test(value) ? null : "Invalid signature format";

            case 'string':
                return null; // Accept any string

            default:
                // For any unspecified types, don't enforce validation
                return null;
        }
    };

    const handleParamChange = (field, value) => {
        setActionParams(prev => ({
            ...prev,
            [field]: value
        }));

        const fields = findStructForAction(selectedAction.type);
        const fieldDef = fields.find(f => f.name === field);
        const error = validateField(fieldDef.type, value);

        setParamErrors(prev => ({
            ...prev,
            [field]: error
        }));
    };

    const handleSubmit = () => {
        const paramsJson = JSON.stringify(actionParams);
        const cleosCommand = `cleos -u ${getApiEndpoint()} push action ${accountName} ${selectedAction.name} '${paramsJson}' -p ${accountName}@active`;
        setActionCommand(cleosCommand);
        setShowActionCommand(true);
    };

    return (
        <div className="mt-3">
            {/* Action Buttons */}
            <div className="mb-3">
                <label className="form-label">Actions</label>
                <div className="d-flex gap-2 flex-wrap">
                    {actions.map(action => (
                        <Button
                            key={action.name}
                            variant={selectedAction?.name === action.name ? "primary" : "outline-primary"}
                            onClick={() => handleActionSelect(action)}
                            className="mb-2"
                        >
                            {action.name}
                        </Button>
                    ))}
                </div>
            </div>

            {/* Action Parameters Form */}
            {selectedAction && (
                <div className="card">
                    <div className="card-header">
                        <h5 className="mb-0">{selectedAction.name}</h5>
                    </div>
                    <div className="card-body">
                        {findStructForAction(selectedAction.type).map(field => (
                            <div key={field.name} className="mb-3">
                                <label className="form-label">
                                    {field.name} <small className="text-muted">({field.type})</small>
                                </label>
                                <input
                                    type="text"
                                    className={`form-control ${paramErrors[field.name] ? 'is-invalid' : ''}`}
                                    value={actionParams[field.name] || ''}
                                    onChange={(e) => handleParamChange(field.name, e.target.value)}
                                    placeholder={`Enter ${field.type}`}
                                />
                                {paramErrors[field.name] && (
                                    <div className="invalid-feedback">
                                        {paramErrors[field.name]}
                                    </div>
                                )}
                            </div>
                        ))}
                        <Button 
                            variant="primary"
                            onClick={handleSubmit}
                            disabled={Object.keys(paramErrors).some(key => paramErrors[key])}
                        >
                            Submit Action
                        </Button>
                    </div>

                    {/* Command Display */}
                    {showActionCommand && (
                        <div className="card-footer">
                            <Alert variant="info" className="mb-0">
                                <div>Execute this action using:</div>
                                <code className="d-block mt-2 p-2 bg-light" style={{ overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                    {actionCommand}
                                </code>
                            </Alert>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
  };

  // Add this function to update URL when state changes
  const updateURL = () => {
    let url = '/explorer';
    
    if (network) {
      url += `/${network}`;
      
      if (accountName) {
        if (network === 'custom') {
          url += `/${customEndpoint}/${accountName}`;
        } else {
          url += `/${accountName}`;
        }
        
        if (view) {
          url += `/${view}`;
          
          if (selectedTable) {
            url += `/${selectedTable}`;
            
            if (scope) {
              url += `/${scope}`;
            }
          }
        }
      }
    }
    
    navigate(url);
  };

  // Add to your existing handleNetworkChange
  const handleNetworkChange = (newNetwork) => {
    setNetwork(newNetwork);
    updateURL();
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-end" style={{ marginRight: '20%' }}>
        <div style={{  width: '100%' }}>
          <h2 className="text-3xl font-bold mb-6">Smart Contract Explorer</h2>
          
          <div className="alert alert-info mb-4 d-flex">
            <i className="bi bi-info-circle me-2"></i>
            <div>
              Enter a contract account name to explore its tables and data
              <div className="mt-2">
                Try one of these examples:{' '}
                {EXAMPLE_ACCOUNTS.map((account, index) => (
                  <span key={account}>
                    <a 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        window.handleExampleClick(account);
                      }}
                    >
                      {account}
                    </a>
                    {index < EXAMPLE_ACCOUNTS.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <Form onSubmit={handleAccountSubmit}>
            <Form.Group className="mb-3" style={{ maxWidth: '300px' }}>
              <NetworkSelector
                network={network}
                setNetwork={handleNetworkChange}
                customEndpoint={customEndpoint}
                setCustomEndpoint={setCustomEndpoint}
                customEndpointError={customEndpointError}
                setCustomEndpointError={setCustomEndpointError}
              />
            </Form.Group>

            <Form.Group className="mb-3" style={{ maxWidth: '300px' }}>
              <Form.Label>Smart Contract Account Name</Form.Label>
              <div>
                <div className="d-flex gap-2">
                  <Form.Control
                    type="text"
                    name="accountName"
                    value={accountName}
                    onChange={handleAccountNameChange}
                    isInvalid={accountName && !isValidLibreAccount(accountName)}
                    placeholder=""
                    autoFocus
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAccountSubmit(e);
                      }
                    }}
                  />
                  <Button 
                    variant="primary"
                    onClick={fetchTables}
                    disabled={isLoading}
                  >
                    {isLoading ? <Spinner size="sm" /> : 'Explore'}
                  </Button>
                </div>
                {accountName && !isValidLibreAccount(accountName) && (
                  <div className="text-danger small mt-1">
                    Invalid account name. Must be 1-12 characters, only a-z, 1-5, and dots allowed.
                  </div>
                )}
              </div>
            </Form.Group>

            {(tables.length > 0 || actions.length > 0) && (
                <div className="mb-4">
                    <div className="btn-group">
                        <Button
                            variant={view === 'tables' ? 'primary' : 'outline-primary'}
                            onClick={() => setView('tables')}
                        >
                            Tables {tables.length > 0 && `(${tables.length})`}
                        </Button>
                        <Button
                            variant={view === 'actions' ? 'primary' : 'outline-primary'}
                            onClick={() => setView('actions')}
                        >
                            Actions {actions.length > 0 && `(${actions.length})`}
                        </Button>
                    </div>
                </div>
            )}

            {/* Only show table content when view is 'tables' */}
            {view === 'tables' ? (
                <>
                    {/* Table Selection */}
                    {tables.length > 0 && (
                        <div className="mb-3">
                            <label className="form-label">Table</label>
                            <div className="d-flex gap-2 flex-wrap">
                                {tables.map(table => (
                                    <Button
                                        key={table}
                                        variant={selectedTable === table ? "primary" : "outline-primary"}
                                        onClick={() => handleTableSelect({ target: { value: table } })}
                                        className="mb-2"
                                    >
                                        {table}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Scope Selection */}
                    {selectedTable && scopes.length > 0 && (
                        <div className="mb-3">
                            <label className="form-label">Scope</label>
                            <div className="d-flex gap-2 flex-wrap">
                                {scopes.map(scopeData => (
                                    <Button
                                        key={scopeData.scope}
                                        variant={scope === scopeData.scope ? "primary" : "outline-primary"}
                                        onClick={() => handleScopeChange(scopeData.scope)}
                                        className="mb-2"
                                    >
                                        {scopeData.scope}
                                        {scopeData.count > 0 && ` (${scopeData.count})`}
                                    </Button>
                                ))}
                                <Button
                                    variant="outline-secondary"
                                    onClick={() => setShowCustomScopeModal(true)}
                                    className="mb-2"
                                >
                                    Custom Scope
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Search Form */}
                    {isSearchable && rows.length > 0 && (
                        <div className="mt-3">
                            <div className="d-flex gap-2">
                                <Form.Control
                                    type="text"
                                    placeholder={`search by ${searchField}`}
                                    value={searchKey}
                                    onChange={handleSearchKeyChange}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSearch(e);
                                        }
                                    }}
                                />
                                <Button 
                                    variant="primary" 
                                    onClick={handleSearch}
                                    disabled={isLoading}
                                >
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
                            </div>
                            <Form.Text className="text-muted">
                                Enter exact {searchField} to search
                            </Form.Text>
                        </div>
                    )}

                    {/* Rest of table content */}
                    <div className="table-container">
                        {isLoading ? (
                            <div className="text-center p-4">
                                <Spinner animation="border" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                </Spinner>
                            </div>
                        ) : selectedTable && scope && rows.length === 0 && !error ? (
                            <Alert variant="warning" className="mb-3">
                                <div>No data found in scope "{scope}". You can verify using:</div>
                                <code className="d-block mt-2 p-2 bg-light" style={{ overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                    curl -X POST {getApiEndpoint()}/v1/chain/get_table_rows \{'\n'}
                                    -H "Content-Type: application/json" \{'\n'}
                                    -d '{JSON.stringify({
                                        code: accountName,
                                        table: selectedTable,
                                        scope: scope,
                                        limit: limit,
                                        json: true,
                                        reverse: true
                                    }, null, 2)}'
                                </code>
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

                                {/* Pagination Controls */}
                                <div className="d-flex justify-content-between align-items-center mt-3">
                                    <div>
                                        {currentPage > 0 && (
                                            <Button
                                                variant="outline-primary"
                                                onClick={() => fetchTableRows('backward')}
                                                disabled={isLoading || currentPage === 0}
                                            >
                                                Previous
                                            </Button>
                                        )}
                                    </div>
                                    <div className="text-muted">
                                        Page {currentPage + 1}
                                    </div>
                                    <div>
                                        {nextKey && (
                                            <Button
                                                variant="outline-primary"
                                                onClick={() => fetchTableRows('forward')}
                                                disabled={isLoading}
                                            >
                                                Next
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : null}
                    </div>

                    {/* Warning message for tables view */}
                    {warningMessage && (
                        <div className="alert alert-warning mt-4">
                            <i className="bi bi-exclamation-triangle me-2"></i>
                            {warningMessage}
                        </div>
                    )}

                    {/* Custom Scope Modal */}
                    <Modal show={showCustomScopeModal} onHide={() => setShowCustomScopeModal(false)}>
                        <Modal.Header closeButton>
                            <Modal.Title>Enter Custom Scope</Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <input
                                type="text"
                                className="form-control"
                                value={customScopeInput}
                                onChange={handleCustomScopeChange}
                                placeholder="Enter scope (case sensitive)"
                            />
                        </Modal.Body>
                        <Modal.Footer>
                            <Button variant="secondary" onClick={() => setShowCustomScopeModal(false)}>
                                Cancel
                            </Button>
                            <Button variant="primary" onClick={handleCustomScopeSubmit}>
                                Apply
                            </Button>
                        </Modal.Footer>
                    </Modal>
                </>
            ) : (
                <>
                    <ActionsList actions={actions} abiData={abiData} />
                    {/* Debug output */}
                    <pre style={{display: 'none'}}>
                        {JSON.stringify({
                            hasAbiData: !!abiData,
                            abiDataContent: abiData,
                            actionsLength: actions.length,
                            firstAction: actions[0],
                        }, null, 2)}
                    </pre>
                </>
            )}

            {/* Error message stays outside since it's relevant for both views */}
            {error && !isLoading && (
                <div className="alert alert-danger mt-4">
                    {error}
                </div>
            )}
          </Form>
        </div>
      </div>
    </div>
  );
};

export default LibreExplorer; 