/**
 * Decodes a symbol code from scope format to string
 * @param {string} scope - The scope string (e.g., "........chc54", ".........1c54")
 * @returns {string} - The decoded symbol (e.g., "TP", "TPC", "CBTC")
 */
export function decodeSymbolCodeFromHex(scope) {
  if (!scope) return scope;
  
  // Extract the non-dot part
  let encodedPart = scope.replace(/\./g, '');
  if (encodedPart.length === 0) return scope;
  
  // First check if we have a known symbol mapping
  const knownSymbol = decodeEosNameToSymbol(encodedPart);
  if (knownSymbol && knownSymbol !== encodedPart) {
    return knownSymbol;
  }
  
  // Then try as hex (for cases not in our known list)
  if (/^[0-9a-fA-F]+$/.test(encodedPart)) {
    try {
      // Pad to even length
      if (encodedPart.length % 2 !== 0) {
        encodedPart = '0' + encodedPart;
      }
      
      let result = '';
      // Convert hex pairs to bytes (little-endian: process from right to left)
      for (let i = encodedPart.length - 2; i >= 0; i -= 2) {
        const byte = parseInt(encodedPart.substr(i, 2), 16);
        // Only include valid printable characters for token symbols
        if (byte !== 0 && 
            ((byte >= 48 && byte <= 57) ||  // 0-9
             (byte >= 65 && byte <= 90) ||  // A-Z
             (byte >= 97 && byte <= 122))) { // a-z
          result += String.fromCharCode(byte);
        }
      }
      
      if (result.length > 0) return result;
    } catch (error) {
      // Fall through to return original
    }
  }
  
  // If all else fails, return the original scope
  return scope;
}

/**
 * Decodes an EOS name-encoded symbol to string
 * @param {string} name - The EOS name (e.g., "che42", "2gche42")
 * @returns {string} - The decoded symbol or null if failed
 */
function decodeEosNameToSymbol(name) {
  // Known symbol mappings (can be expanded as we discover more)
  const knownSymbols = {
    // BTC family
    'che42': 'BTC',
    '2gche42': 'BTCL',
    '23el143': 'CBTC',
    
    // TP family  
    '1c54': 'TP',
    'c5c54': 'TPA',
    'cdc54': 'TPB',
    'chc54': 'TPC',
    
    // Other tokens
    'lemcd4og': 'LIBRE',
    '2ocldp5': 'USDT'
  };
  
  // Check known mappings first
  if (knownSymbols[name]) {
    return knownSymbols[name];
  }
  
  // Try EOS name conversion for unknown symbols
  try {
    // Standard EOS name to uint64 conversion
    let value = 0n;
    for (let i = 0; i < Math.min(name.length, 12); i++) {
      const char = name[i];
      let charValue = 0;
      
      if (char === '.') {
        charValue = 0;
      } else if (char >= '1' && char <= '5') {
        charValue = char.charCodeAt(0) - 48; // '1' = 1, '5' = 5
      } else if (char >= 'a' && char <= 'z') {
        charValue = char.charCodeAt(0) - 97 + 6; // 'a' = 6, 'z' = 31
      } else {
        return null; // Invalid character for EOS name
      }
      
      value = (value << 5n) | BigInt(charValue);
    }
    
    // Pad to 64 bits if name is shorter than 12 characters
    if (name.length < 12) {
      value = value << BigInt(5 * (12 - name.length));
    }
    
    // Extract symbol characters from the lower bytes (little endian)
    let result = '';
    for (let i = 0; i < 8; i++) {
      const byte = Number((value >> BigInt(8 * i)) & 0xFFn);
      if (byte !== 0 && 
          ((byte >= 48 && byte <= 57) ||  // 0-9
           (byte >= 65 && byte <= 90) ||  // A-Z
           (byte >= 97 && byte <= 122))) { // a-z
        result += String.fromCharCode(byte);
      }
    }
    
    return result.length > 0 ? result : null;
  } catch (error) {
    console.error('Error decoding EOS name to symbol:', error);
    return null;
  }
}

/**
 * Encodes a symbol code string to hex format
 * @param {string} str - The symbol string (e.g., "TP")
 * @returns {string} - The hex encoded string (e.g., "0000000050540000")
 */
export function encodeSymbolCode(str) {
  let value = BigInt(0);
  
  // Encode up to 8 characters
  for (let i = 0; i < Math.min(str.length, 8); i++) {
    value |= BigInt(str.charCodeAt(i)) << BigInt(8 * i);
  }
  
  return value.toString(16).padStart(16, '0');
}

/**
 * Checks if a table type is currency_stats based on ABI
 * @param {object} abiData - The ABI data
 * @param {string} tableName - The table name to check
 * @returns {boolean} - True if the table is of type currency_stats
 */
export function isCurrencyStatsTable(abiData, tableName) {
  if (!abiData?.abi?.tables) return false;
  
  const table = abiData.abi.tables.find(t => t.name === tableName);
  return table?.type === 'currency_stats';
}

/**
 * Formats a scope for display, decoding if it's a currency symbol
 * @param {string} scope - The scope value
 * @param {boolean} isCurrencyStats - Whether this is a currency stats table
 * @returns {string} - The formatted scope for display
 */
export function formatScopeDisplay(scope, isCurrencyStats) {
  if (!isCurrencyStats) return scope;
  
  // Try to decode as symbol
  const decoded = decodeSymbolCodeFromHex(scope);
  
  // If decoded is different and looks like a valid symbol, use it
  if (decoded !== scope && decoded.length > 0 && decoded.length <= 8) {
    return decoded;
  }
  
  return scope;
}