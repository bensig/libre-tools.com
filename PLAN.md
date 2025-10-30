# Implementation Plan: Lowercase Enforcement & Explorer Link Updates

## Overview
This document outlines the required changes to enforce lowercase account inputs and update blockchain explorer links across the libre-tools.com application.

## Update Status: ✅ COMPLETED

All planned changes have been successfully implemented on 6/8/2025.

## 1. Account Input Lowercase Enforcement

### Requirements:
- All account input fields should automatically convert ANY uppercase letters to lowercase as the user types
- This includes the first letter and any subsequent letters
- The conversion should be VISUAL - users will see the letters change to lowercase immediately in the input field
- Numbers 1-5 should remain allowed
- The conversion should happen in real-time during input (onChange event)

### Components Requiring Updates:

#### ✅ LibreExplorer.jsx (Already Implemented)
- **Status**: Already has lowercase enforcement
- **Location**: Line 1579-1587
- **Current Implementation**: Uses `isValidLibreAccount()` function with validation

#### ✅ VaultChecker.jsx (COMPLETED)
- **Location**: Line 380-388
- **Field**: Account/vault name input
- **Implementation**: Updated `handleSearchInputChange` function to use `e.target.value.toLowerCase()`
- **Result**: Users now see immediate lowercase conversion as they type

#### ✅ TransactionDownloader.jsx (COMPLETED)
- **Location 1**: Line 264-276 (main account input)
- **Field**: Account name input
- **Implementation**: Updated onChange handler to use `e.target.value.toLowerCase()`
- **Result**: Account names are automatically converted to lowercase

- **Location 2**: Line 310-314 (contract filter input)
- **Field**: Contract name input
- **Implementation**: Updated onChange handler to use `e.target.value.toLowerCase()`
- **Result**: Contract names are automatically converted to lowercase

## 2. Explorer Link Updates

### Current Explorer URLs to Update:

#### ✅ VaultChecker.jsx (COMPLETED)
- **Line 440-447**: Account link
  - **Updated**: Now uses `${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/account/${result.account}`

- **Line 453-460**: Vault account link
  - **Updated**: Now uses `${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/account/${result.vault}`

#### ✅ BtcTracker.jsx (COMPLETED)
- **Line 436-443**: Transaction link (peg-out)
  - **Updated**: Now uses `${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/tx/${result.libreHash}`

- **Line 500-509**: Transaction link (peg-in)
  - **Updated**: Now uses `${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/tx/${result.libreHash}`

- **Line 516-523**: Account link
  - **Updated**: Now uses `${network === 'mainnet' ? 'https://www.libreblocks.io' : 'https://testnet.libreblocks.io'}/account/${result.libreAccount}`
  - **Note**: Successfully changed from `/address/` to `/account/`

### Components Already Using LibreBlocks:
- ✅ **MultisigProposals.jsx**: Already configured with libreblocks.io URLs
- ✅ **LibreExplorer.jsx**: Already configured with libreblocks.io URLs

## 3. Implementation Approach

### Step 1: Create Helper Function
Create a utility function to get the correct explorer URL based on the selected network:
```javascript
const getLibreBlocksUrl = (network) => {
  return network === 'mainnet' 
    ? 'https://www.libreblocks.io'
    : 'https://testnet.libreblocks.io';
};
```

### Step 2: Update Components
1. Add automatic lowercase conversion to account input handlers
   - Use `e.target.value.toLowerCase()` on every input change event
   - Set the lowercased value to state so it displays immediately in the input field
   - Ensures all uppercase letters (including first letter) are visually converted in real-time
2. Replace hardcoded explorer URLs with dynamic URLs based on selected network
3. Update URL patterns (e.g., `/address/` to `/account/`)

### Step 3: Testing Checklist
- [x] Test automatic lowercase conversion on all account inputs
- [x] Verify first letter is automatically converted to lowercase
- [x] Test typing "ACCOUNT" and verify it becomes "account" in real-time
- [x] Verify numbers 1-5 are still allowed
- [x] Test mixed case input like "MyAccount123" becomes "myaccount123"
- [x] Test explorer links on mainnet
- [x] Test explorer links on testnet
- [x] Verify all links open correctly with proper paths

## 4. Files Modified ✅

1. **VaultChecker.jsx**
   - ✅ Added lowercase transformation to input handler
   - ✅ Updated 2 explorer links with network-aware URLs

2. **BtcTracker.jsx**
   - ✅ Updated 3 explorer links with network-aware URLs
   - ✅ Changed `/address/` to `/account/` for account links

3. **TransactionDownloader.jsx**
   - ✅ Added lowercase transformation to 2 input handlers

## 5. Notes

- LibreExplorer.jsx already has proper validation and explorer URLs
- MultisigProposals.jsx already uses libreblocks.io
- Ensure all changes maintain existing validation logic
- Account names should only allow: lowercase letters (a-z), numbers (1-5), and dots