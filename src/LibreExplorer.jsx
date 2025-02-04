import React, { useState, useEffect, useRef } from "react";
import { Form, Button, Table, Alert, Spinner, Modal, Button as ModalButton } from "react-bootstrap";
import { WalletPluginBitcoinLibre } from "@libre-chain/wallet-plugin-bitcoin-libre";
import { SessionKit } from "@wharfkit/session";
import { WalletPluginAnchor } from "@wharfkit/wallet-plugin-anchor";
import NetworkSelector from './components/NetworkSelector';
import { useParams, useNavigate } from 'react-router-dom';
import { WebRenderer } from "@wharfkit/web-renderer";

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
  const [walletSession, setWalletSession] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [txNotification, setTxNotification] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [actionParams, setActionParams] = useState({});
  const [paramErrors, setParamErrors] = useState({});

  const networks = {
    mainnet: {
      chainId: 'aca376f206b8fc25a6ed44dbdc66547c8af0a623a0a5f35e2c27c4c0aaea3808',
      rpcEndpoint: 'https://lb.libre.org',
    },
    testnet: {
      chainId: '73e2c46a3cb531e3e981e5ac2e4c0dcd4a286cb649aeaf8c087f370eb44e7e2c',
      rpcEndpoint: 'https://testnet.libre.org',
    }
  };

  // Network config first
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

  // Helper functions need to be defined before components that use them
  const getBlockExplorerUrl = (txId) => {
    if (!txId || typeof txId !== 'string') {
      console.log('Invalid txId for explorer URL:', txId);
      return '';
    }
    const baseUrl = NETWORK_CONFIG[network]?.explorer;
    return baseUrl ? `${baseUrl}/tx/${txId}` : '';
  };

  const truncateTxId = (txId) => {
    if (!txId || typeof txId !== 'string') {
      console.log('Invalid txId received:', txId);
      return '';
    }
    return `${txId.slice(0, 4)}-${txId.slice(-4)}`;
  };

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

  // Modify the useEffect for accountName changes to debounce the fetch
  useEffect(() => {
    let timeoutId;
    
    if (accountName) {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      // Set a new timeout to fetch tables
      timeoutId = setTimeout(() => {
        console.log('Account name set, fetching tables:', accountName);
        fetchTables();
      }, 500); // 500ms debounce
    }
    
    // Cleanup function
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
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
  }, [selectedTable, accountName]);

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

  // Add this useEffect for accountName changes
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

  useEffect(() => {
    console.log('ABI Data changed:', abiData);
  }, [abiData]);

  useEffect(() => {
    console.log('Actions changed:', actions);
  }, [actions]);

  // Fetch chain ID when network changes
  useEffect(() => {
    const fetchChainId = async () => {
      try {
        const response = await fetch(`${getApiEndpoint()}/v1/chain/get_info`);
        const data = await response.json();
        setChainId(data.chain_id);
        console.log('Chain ID:', data.chain_id);
      } catch (error) {
        console.error('Error fetching chain ID:', error);
      }
    };

    fetchChainId();
  }, [network, customEndpoint]); // Trigger when network or customEndpoint changes

  // Add debug logging for notification state changes
  useEffect(() => {
    console.log('Transaction notification changed:', txNotification);
  }, [txNotification]);

  // Add network to dependency array for wallet connection
  useEffect(() => {
    // Disconnect wallet when network changes
    if (walletSession && network) {
      disconnectWallet();
    }
  }, [network]);

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
          // Only throw the network error if we're actually fetching account data
          if (path.includes('get_abi')) {
            throw new Error('Account not found - are you on the right network?');
          }
          throw new Error(`Request failed with status ${response.status}`);
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
    
    // Don't fetch if we're already loading
    if (isLoading) {
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
      console.log('Full ABI data:', abiData);
      
      if (!abiData.abi) {
        console.log('No ABI found for account:', accountName);
        setError(`No ABI found for account: ${accountName}`);
        setTables([]);
        setActions([]);
        return;
      }

      setAbiData(abiData);
      
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
      setActions([]);
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
    
    // Clear all state when changing accounts
    setSelectedTable(null);
    setScope(null);
    setRows([]);
    setScopes([]);
    setView('tables'); // Reset to tables view
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    setWarningMessage(null);
    setError(null);
    setIsInitialLoad(true);
    setSearchKey('');
    setIsSearching(false);
    
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

  // Add lowercase enforcement to account name input and clear state immediately
  const handleAccountNameChange = (e) => {
    const value = e.target.value.toLowerCase();
    
    // Clear all state as soon as user starts typing
    setSelectedTable(null);
    setScope(null);
    setRows([]);
    setScopes([]);
    setView('tables');
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    setWarningMessage(null);
    setError(null);
    setIsInitialLoad(true);
    setSearchKey('');
    setIsSearching(false);
    setTables([]);
    setActions([]);
    
    setAccountName(value);
    
    // Only update URL and fetch ABI if we have at least 4 characters
    // or if the field is completely empty
    if (value.length >= 4 || value.length === 0) {
      // Immediately update URL with just the network and new account name
      const baseUrl = '/explorer/' + network;
      navigate(network === 'custom' ? 
        `${baseUrl}/${customEndpoint}/${value}` : 
        `${baseUrl}/${value}`
      );
    }
  };

  // Update useEffect for fetching ABI to respect the 4-character minimum
  useEffect(() => {
    if (accountName && accountName.length >= 4) {
      console.log('Account name set, fetching tables:', accountName);
      fetchABI();
    } else if (accountName.length === 0) {
      // Clear ABI data when account name is empty
      setAbiData(null);
      setTables([]);
      setActions([]);
    }
  }, [accountName]);

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

  const findStructForAction = (actionName) => {
    console.log('Finding struct for action:', actionName);
    console.log('ABI data:', abiData);
    
    if (!abiData?.abi?.structs) {
      console.log('No ABI structs found');
      return [];
    }
    
    // First find the action to get its type
    const action = abiData.abi.actions.find(a => a.name === actionName);
    console.log('Found action:', action);
    
    if (!action) {
      console.log('No action found for name:', actionName);
      return [];
    }
    
    // Then find the struct using the action's type
    const struct = abiData.abi.structs.find(s => s.name === action.type);
    console.log('Found struct:', struct);
    
    return struct?.fields || [];
  };

  const handleActionSelect = (action) => {
    console.log('Selecting action:', action);
    
    // Store just the action name since that's what we need for lookup
    setSelectedAction(action.name);
    setActionParams({});
    setParamErrors({});
    setShowActionCommand(false);
    
    // Update URL with action name
    let url = `/explorer/${network}`;
    if (network === 'custom') {
      url += `/${customEndpoint}`;
    }
    url += `/${accountName}/actions/${action.name}`;
    
    console.log('Navigating to:', url);
    navigate(url);
  };

  const handleParamChange = (field, value) => {
    setActionParams(prev => ({
      ...prev,
      [field]: value
    }));

    const fields = findStructForAction(selectedAction);
    const fieldDef = fields.find(f => f.name === field);
    const error = validateField(fieldDef.type, value);

    setParamErrors(prev => ({
      ...prev,
      [field]: error
    }));
  };

  // Add this helper function to format parameter values
  const formatParamValue = (type, value) => {
    if (!value) return value;
    
    if (type === 'params' || type.includes('json')) {
      try {
        // Parse the input JSON
        const parsed = JSON.parse(value);
        
        // Simply stringify the parsed object, no additional wrapping
        return JSON.stringify(parsed);
      } catch (e) {
        console.warn('Failed to parse JSON parameter:', e);
        return value;
      }
    }
    
    return value;
  };

  // Update handleLocalSubmit to use the formatter
  const handleLocalSubmit = async () => {
    if (!walletSession) {
      let params;
      try {
        // If we have a single parameter that's a JSON string, parse it first
        if (Object.entries(actionParams).length === 1) {
          const value = Object.values(actionParams)[0];
          // Parse the input and get just the array part if it's wrapped in a p property
          const parsed = typeof value === 'string' ? JSON.parse(value) : value;
          params = parsed.p || parsed;  // Use the array directly, whether it's in p or not
        } else {
          params = actionParams;
        }
        
        // Create command with the array directly, not wrapped in an object
        const cleosCommand = `cleos -u ${getApiEndpoint()} push action ${accountName} ${selectedAction} '${JSON.stringify(params)}' -p ${accountName}@active`;
        setActionCommand(cleosCommand);
        setShowActionCommand(true);
      } catch (e) {
        console.warn('Failed to parse JSON parameter:', e);
        params = actionParams;
      }
      return;
    }
    
    // Only call handleSubmit if wallet is connected
    handleSubmit();
  };

  const handleSubmit = async () => {
    console.log('ActionsList handleSubmit called');
    
    // Update URL with parameters before submitting
    let url = `/explorer/${network}`;
    if (network === 'custom') {
      url += `/${customEndpoint}`;
    }
    url += `/${accountName}/actions/${selectedAction}`;
    
    // Add non-empty parameters to URL
    const nonEmptyParams = Object.entries(actionParams)
      .filter(([_, value]) => value !== '')
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {});
    
    if (Object.keys(nonEmptyParams).length > 0) {
      const queryString = Object.entries(nonEmptyParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      url += `?${queryString}`;
    }
    
    navigate(url);
    
    if (walletSession) {
      try {
        console.log('Starting transaction in ActionsList...');
        setTxNotification({ type: 'info', message: 'Transaction in progress...' });
        
        const action = {
          account: accountName,
          name: selectedAction,
          authorization: [{ 
            actor: walletSession.actor.toString(), 
            permission: 'active' 
          }],
          data: actionParams
        };

        console.log('Sending transaction:', action);
        const result = await walletSession.transact(
          { actions: [action] },
          { broadcast: true }
        );
        
        // Debug log the full result structure
        console.log('Full transaction result:', result);
        
        // Extract transaction ID from the response structure
        const txId = result?.response?.transaction_id || 
                    result?.resolved?.response?.transaction_id ||
                    result?.resolved?.transaction?.id;
        
        console.log('Extracted transaction ID:', txId, 'Type:', typeof txId);
        
        if (!txId || typeof txId !== 'string') {
          console.warn('Invalid transaction ID received:', txId);
          setTxNotification({
            type: 'success',
            message: 'Transaction successful! (Transaction ID unavailable)'
          });
          return;
        }
        
        // Show success notification with explorer link
        setTxNotification({
          type: 'success',
          message: 'Transaction successful!',
          txId: txId
        });
        
      } catch (error) {
        console.error('Transaction error:', error);
        setTxNotification({
          type: 'error',
          message: error.message || 'Transaction failed'
        });
      }
    } else {
      // Show cleos command if no wallet is connected
      const cleosCommand = `cleos -u ${getApiEndpoint()} push action ${accountName} ${selectedAction} '${JSON.stringify(actionParams)}' -p ${accountName}@active`;
      setActionCommand(cleosCommand);
      setShowActionCommand(true);
    }
  };

  // Update handleViewChange to immediately update URL when switching views
  const handleViewChange = (newView) => {
    console.log('Switching view to:', newView);
    
    // Clear table-related state when switching views
    setSelectedTable(null);
    setScope(null);
    setRows([]);
    setScopes([]);
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    // Clear action-related state too
    setSelectedAction(null);
    setActionParams({});
    
    // Set the new view
    setView(newView);
    
    // Immediately construct and navigate to new URL
    let url = '/explorer';
    if (network) {
      url += `/${network}`;
      if (accountName) {
        if (network === 'custom') {
          url += `/${customEndpoint}/${accountName}`;
        } else {
          url += `/${accountName}`;
        }
        url += `/${newView}`; // Add the new view to URL
      }
    }
    
    console.log('Navigating to:', url);
    navigate(url);
  };

  // Update handleActionParamChange to include parameters in URL
  const handleActionParamChange = (paramName, value) => {
    const newParams = {
      ...actionParams,
      [paramName]: value
    };
    
    // Remove empty parameters
    Object.keys(newParams).forEach(key => {
      if (!newParams[key]) {
        delete newParams[key];
      }
    });
    
    setActionParams(newParams);
    
    // Construct URL with parameters
    let url = `/explorer/${network}`;
    if (network === 'custom') {
      url += `/${customEndpoint}`;
    }
    url += `/${accountName}/actions/${selectedAction}`;
    
    // Add parameters to URL if they exist
    if (Object.keys(newParams).length > 0) {
      const queryString = Object.entries(newParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
      url += `?${queryString}`;
    }
    
    console.log('Updating URL with params:', url);
    navigate(url);
  };

  // Update useEffect to handle URL parameters when loading
  useEffect(() => {
    if (urlView === 'actions' && urlItem) {
      console.log('Loading action from URL:', urlItem);
      setView('actions');
      setSelectedAction(urlItem);
      
      // Parse URL parameters
      const queryParams = new URLSearchParams(window.location.search);
      const params = {};
      queryParams.forEach((value, key) => {
        params[key] = value;
      });
      
      if (Object.keys(params).length > 0) {
        console.log('Loading parameters from URL:', params);
        setActionParams(params);
      }
    }
  }, [urlView, urlItem]);

  // Update updateURL to handle action paths
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
          
          if (view === 'tables' && selectedTable && scope) {
            // Handle tables view URL
            url += `/${selectedTable}/${scope}`;
          } else if (view === 'actions' && selectedAction) {
            // Handle actions view URL
            url += `/${selectedAction}`;
            
            // Add action parameters to URL if they exist
            if (Object.keys(actionParams).length > 0) {
              url += '/data';
              const params = new URLSearchParams();
              Object.entries(actionParams).forEach(([key, value]) => {
                if (value !== '') {
                  params.append(key, value);
                }
              });
              const paramString = params.toString();
              if (paramString) {
                url += `?${paramString}`;
              }
            }
          }
        }
      }
    }
    
    navigate(url);
  };

  // Update handleNetworkChange to disconnect wallet
  const handleNetworkChange = (newNetwork) => {
    setNetwork(newNetwork);
    // Clear all state when changing networks
    setAccountName('');
    setSelectedTable(null);
    setScope(null);
    setRows([]);
    setScopes([]);
    setView('tables');
    setCurrentPage(0);
    setPreviousKeys([]);
    setNextKey(null);
    setWarningMessage(null);
    setError(null);
    setIsInitialLoad(true);
    setSearchKey('');
    setIsSearching(false);
    // Disconnect wallet when changing networks
    if (walletSession) {
      disconnectWallet();
    }
    updateURL();
  };

  const handleSessionKitLogin = async (type) => {
    if (!chainId) {
      console.error('Chain ID not available');
      return;
    }

    try {
      setIsConnecting(true);
      setShowWalletModal(false);
      
      const sessionKitArgs = {
        appName: "Libre Explorer",
        chains: [{
          id: chainId,
          url: getApiEndpoint()
        }],
        ui: new WebRenderer(),
        walletPlugins: [new WalletPluginBitcoinLibre(), new WalletPluginAnchor()]
      };

      const sessionKit = new SessionKit(sessionKitArgs);
      const { session } = await sessionKit.login({
        walletPlugin: type,
      });

      if (session && session.permissionLevel) {
        setWalletSession(session);
        console.log('Wallet connected:', session);
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error);
    } finally {
      setIsConnecting(false);
    }
  };

  const connectWallet = () => setShowWalletModal(true);

  const disconnectWallet = async () => {
    if (walletSession) {
      try {
        const sessionKitArgs = {
          appName: "Libre Explorer",
          chains: [{
            id: chainId,
            url: getApiEndpoint()
          }],
          walletPlugins: [new WalletPluginBitcoinLibre(), new WalletPluginAnchor()]
        };
        
        const sessionKit = new SessionKit(sessionKitArgs);
        await sessionKit.logout(walletSession);
      } catch (error) {
        console.error('Error disconnecting wallet:', error);
      }
    }
    setWalletSession(null);
  };

  // Modify TransactionNotification to add debug info and prevent auto-dismiss
  const TransactionNotification = ({ notification, onClose }) => {
    console.log('Rendering notification:', notification);
    
    if (!notification) return null;

    const borderColors = {
      info: '#0d6efd',    // Bootstrap primary blue
      success: '#198754', // Bootstrap success green
      error: '#dc3545'    // Bootstrap danger red
    };

    const handleCopy = async (txId) => {
      try {
        await navigator.clipboard.writeText(txId);
        console.log('Transaction ID copied:', txId);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    };

    return (
      <Alert 
        dismissible 
        onClose={onClose}
        className="position-fixed bottom-0 end-0 m-3 bg-white"
        style={{ 
          zIndex: 1050,
          minWidth: '300px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          border: `2px solid ${borderColors[notification.type]}`,
          color: '#212529', // Bootstrap default text color
          padding: '1rem'
        }}
      >
        <div className="d-flex flex-column gap-2">
          <div>
            {notification.type === 'success' && notification.txId ? (
              <>Transaction Successful: {truncateTxId(notification.txId)}</>
            ) : (
              notification.message
            )}
          </div>
          {notification.txId && (
            <div className="d-flex gap-2">
              <Button
                size="sm"
                variant="outline-primary"
                onClick={() => handleCopy(notification.txId)}
                className="btn-sm"
              >
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline-primary"
                href={getBlockExplorerUrl(notification.txId)}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-sm"
              >
                View TX
              </Button>
            </div>
          )}
        </div>
      </Alert>
    );
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4" style={{ marginRight: '20%' }}>
        <h2 className="text-3xl font-bold">Smart Contract Explorer</h2>
        <Button
          variant={walletSession ? "success" : "outline-primary"}
          onClick={walletSession ? disconnectWallet : connectWallet}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <>
              <Spinner size="sm" className="me-2" />
              Connecting...
            </>
          ) : walletSession ? (
            <>
              <i className="bi bi-wallet2 me-2"></i>
              {walletSession.actor.toString()}
            </>
          ) : (
            <>
              <i className="bi bi-wallet2 me-2"></i>
              Connect Wallet
            </>
          )}
        </Button>
      </div>
      <div className="d-flex justify-content-end" style={{ marginRight: '20%' }}>
        <div style={{ width: '100%' }}>
          <div className="alert alert-info mb-4 d-flex">
            <i className="bi bi-info-circle me-2"></i>
            <div>
              Enter a contract account name to explore its tables and actions.
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
                    placeholder="Enter contract account name"
                    autoComplete="off"
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
                            onClick={() => handleViewChange('tables')}
                        >
                            Tables {tables.length > 0 && `(${tables.length})`}
                        </Button>
                        <Button
                            variant={view === 'actions' ? 'primary' : 'outline-primary'}
                            onClick={() => handleViewChange('actions')}
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
                    <ActionsView 
                        actions={actions} 
                        abiData={abiData} 
                        selectedAction={selectedAction} 
                        setSelectedAction={setSelectedAction} 
                        actionParams={actionParams} 
                        setActionParams={setActionParams} 
                        network={network} 
                        customEndpoint={customEndpoint} 
                        accountName={accountName}
                        navigate={navigate}
                        handleParamChange={handleParamChange}
                        handleSubmit={handleLocalSubmit}
                        paramErrors={paramErrors}
                        setParamErrors={setParamErrors}
                        setShowActionCommand={setShowActionCommand}
                        walletSession={walletSession}
                        setActionCommand={setActionCommand}
                        actionCommand={actionCommand}
                        showActionCommand={showActionCommand}
                        getApiEndpoint={getApiEndpoint}
                    />
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

      {/* Add Wallet Selection Modal */}
      <Modal show={showWalletModal} onHide={() => setShowWalletModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Select Wallet</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="d-grid gap-2">
            <Button
              variant="outline-primary"
              onClick={() => handleSessionKitLogin("bitcoin-libre")}
              disabled={isConnecting}
            >
              <i className="bi bi-wallet2 me-2"></i>
              Bitcoin Libre Wallet
            </Button>
            <Button
              variant="outline-primary"
              onClick={() => handleSessionKitLogin("anchor")}
              disabled={isConnecting}
            >
              <i className="bi bi-wallet2 me-2"></i>
              Anchor Wallet
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      {/* Add TransactionNotification component with debug info */}
      {txNotification && (
        <div className="debug-info" style={{ display: 'none' }}>
          Notification active: {JSON.stringify(txNotification)}
        </div>
      )}
      <TransactionNotification 
        notification={txNotification}
        onClose={() => {
          console.log('Closing notification');
          setTxNotification(null);
        }}
      />
    </div>
  );
};

const ActionsView = ({ 
  actions, 
  abiData, 
  selectedAction, 
  setSelectedAction, 
  actionParams, 
  setActionParams, 
  network, 
  customEndpoint, 
  accountName,
  navigate,
  handleParamChange,
  handleSubmit,
  paramErrors,
  setParamErrors,
  setShowActionCommand,
  walletSession,
  setActionCommand,
  actionCommand,
  showActionCommand,
  getApiEndpoint
}) => {
  // Initialize local state if needed
  const [localSelectedAction, setLocalSelectedAction] = useState(selectedAction);

  const findStructForAction = (actionName) => {
    if (!actionName || !abiData?.abi?.structs) {
      return [];
    }
    
    const action = abiData.abi.actions.find(a => a.name === actionName);
    if (!action) return [];
    
    const struct = abiData.abi.structs.find(s => s.name === action.type);
    return struct?.fields || [];
  };

  const handleActionSelect = (action) => {
    const actionName = action.name;
    setLocalSelectedAction(actionName);
    setSelectedAction(actionName);
    setActionParams({});
    setParamErrors({});
    setShowActionCommand(false);
    
    let url = `/explorer/${network}`;
    if (network === 'custom') {
      url += `/${customEndpoint}`;
    }
    url += `/${accountName}/actions/${actionName}`;
    
    navigate(url);
  };

  return (
    <div className="mt-3">
      <div className="mb-3">
        <label className="form-label">Actions</label>
        <div className="d-flex gap-2 flex-wrap">
          {actions?.map(action => (
            <Button
              key={action.name}
              variant={localSelectedAction === action.name ? "primary" : "outline-primary"}
              onClick={() => handleActionSelect(action)}
              className="mb-2"
            >
              {action.name}
            </Button>
          ))}
        </div>
      </div>

      {localSelectedAction && (
        <div className="card">
          <div className="card-header">
            <h5 className="mb-0">{localSelectedAction}</h5>
          </div>
          <div className="card-body">
            {findStructForAction(localSelectedAction).map(field => (
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
        </div>
      )}

      {/* Show cleos command if no wallet and command exists */}
      {!walletSession && showActionCommand && actionCommand && (
        <div className="mt-3">
          <div className="card">
            <div className="card-header">
              <h5 className="mb-0">CLEOS Command</h5>
            </div>
            <div className="card-body">
              <pre className="mb-0">{actionCommand}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LibreExplorer; 