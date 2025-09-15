'use strict';

const crypto = require('crypto');
const { ethers } = require('ethers');
const { ConfigUtil } = require('@hyperledger/caliper-core');

// SSI Entity Types
const SSI_ENTITY_TYPES = {
  ROLE: 'role',
  DID: 'did', 
  CREDENTIAL: 'credential'
};

// SSI Role Types (based on RoleControl contract)
const SSI_ROLES = {
  NONE: 0,
  ISSUER: 1, 
  HOLDER: 2,
  TRUSTEE: 3
};

// Special addresses
const DEPLOYER_ADDRESS = '0xc9c913c8c3c1cd416d80a0abf475db2062f161f6';

// Static cache to persist accounts between round initializations
const GLOBAL_ACCOUNT_CACHE = new Map();

/**
 * Simplified SSI State Manager
 * Generates transaction arguments for SSI operations without complex state tracking
 */
class SimplifiedSSIStateManager {
  /**
   * Initializes the simplified SSI state manager
   * @param {number} workerIndex - Worker index
   * @param {string} primaryEntityType - Primary entity type for this workload
   * @param {Object} config - SSI configuration
   */
  constructor(workerIndex, primaryEntityType, config = {}) {
    this.workerIndex = workerIndex;
    this.primaryEntityType = primaryEntityType;
    this.config = config;
    
    // Generate worker-specific prefix for unique identifiers
    this.workerPrefix = `w${workerIndex}`;
    
    // Basic entity counters
    this.counters = {
      [SSI_ENTITY_TYPES.ROLE]: 0,
      [SSI_ENTITY_TYPES.DID]: 0,
      [SSI_ENTITY_TYPES.CREDENTIAL]: 0
    };
    
    // Minimal state tracking
    this.entities = {
      roles: new Map(),
      dids: new Map(),
      credentials: new Map()
    };
    
    // Predefined accounts for stable testing
    this.predefinedAccounts = new Map();
    
    // Flag to track if we've fully loaded accounts
    this.accountsLoaded = false;
    
    // Initialize predefined accounts from Caliper network configuration
    this.initializePredefinedAccounts()
      .then(accounts => {
        this.predefinedAccounts = accounts;
        
        // Merge with any accounts from the global cache
        if (GLOBAL_ACCOUNT_CACHE.size > 0) {
          console.log(`📥 Loading ${GLOBAL_ACCOUNT_CACHE.size} previously generated accounts from cache`);
          
          // Add each cached account to predefined accounts if not already present
          for (const [address, accountData] of GLOBAL_ACCOUNT_CACHE.entries()) {
            if (!this.predefinedAccounts.has(address)) {
              this.predefinedAccounts.set(address, accountData);
              
              // If this account has a DID, initialize it in our local tracking too
              if (accountData.hasDid) {
                // Add a placeholder DID entry so _addressHasDid will return true
                this.entities.dids.set(address, {
                  importedFromCache: true,
                  createdAt: Date.now()
                });
                console.log(`📎 Added cached account with DID: ${accountData.name} (${address.substring(0, 10)}...)`);
              } else {
                console.log(`📎 Added cached account: ${accountData.name} (${address.substring(0, 10)}...)`);
              }
            }
          }
          
          // Count how many accounts have DIDs
          const cachedDids = Array.from(GLOBAL_ACCOUNT_CACHE.entries())
            .filter(([_, accountData]) => accountData.hasDid)
            .length;
            
          console.log(`📊 Found ${cachedDids} accounts with DIDs in global cache`);
        }
        
        this.accountsLoaded = true;
        console.log(`📊 Loaded ${this.predefinedAccounts.size} accounts total (${accounts.size} from Caliper network config + ${GLOBAL_ACCOUNT_CACHE.size} from cache)`);
      })
      .catch(error => {
        console.error(`❌ Failed to load accounts from Caliper network config via ConfigUtil: ${error.message}`);
        
        // Fallback to default predefined accounts
        this.predefinedAccounts = this.getDefaultPredefinedAccounts();
        
        // Also merge with any accounts from the global cache
        if (GLOBAL_ACCOUNT_CACHE.size > 0) {
          console.log(`📥 Loading ${GLOBAL_ACCOUNT_CACHE.size} previously generated accounts from cache (fallback mode)`);
          
          // Add each cached account to predefined accounts if not already present
          for (const [address, accountData] of GLOBAL_ACCOUNT_CACHE.entries()) {
            if (!this.predefinedAccounts.has(address)) {
              this.predefinedAccounts.set(address, accountData);
              
              // If this account has a DID, initialize it in our local tracking too
              if (accountData.hasDid) {
                // Add a placeholder DID entry so _addressHasDid will return true
                this.entities.dids.set(address, {
                  importedFromCache: true,
                  createdAt: Date.now()
                });
                console.log(`📎 Added cached account with DID: ${accountData.name} (${address.substring(0, 10)}...)`);
              } else {
                console.log(`📎 Added cached account: ${accountData.name} (${address.substring(0, 10)}...)`);
              }
            }
          }
          
          // Count how many accounts have DIDs
          const cachedDids = Array.from(GLOBAL_ACCOUNT_CACHE.entries())
            .filter(([_, accountData]) => accountData.hasDid)
            .length;
            
          console.log(`📊 Found ${cachedDids} accounts with DIDs in global cache (fallback mode)`);
        }
        
        this.accountsLoaded = true;
        console.log(`⚠️ Using ${this.predefinedAccounts.size} accounts (default + cached)`);
      });
    
    console.log(`🗃️ Simplified SSI State Manager initialized for worker ${workerIndex}`);
  }
  
  /**
   * Load network configuration using Caliper's ConfigUtil
   * @returns {Object} Network configuration
   * @private
   */
  _loadNetworkConfig() {
    try {
      // Use Caliper's built-in ConfigUtil to get network configuration
      const networkConfig = ConfigUtil.get(ConfigUtil.keys.NetworkConfig);
      
      if (!networkConfig) {
        throw new Error('Network configuration not found via ConfigUtil');
      }
      
      console.log(`📋 Successfully loaded network config via Caliper ConfigUtil`);
      return networkConfig;
    } catch (error) {
      console.error(`❌ Error loading network config via ConfigUtil: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Initialize predefined accounts from Caliper network configuration
   * @returns {Promise<Map>} Map of predefined accounts
   * @private
   */
  async initializePredefinedAccounts() {
    try {
      console.log(`🔑 Loading pre-funded accounts from Caliper network configuration...`);
      
      // Load network configuration using Caliper's ConfigUtil
      const networkConfig = this._loadNetworkConfig();
      
      if (!networkConfig.ethereum || !networkConfig.ethereum.accounts) {
        throw new Error("No Ethereum accounts found in Caliper network configuration");
      }
      
      const configAccounts = networkConfig.ethereum.accounts;
      console.log(`✅ Found ${configAccounts.length} pre-funded accounts in Caliper network config`);
      
      // Create account map with role assignments
      const accounts = new Map();
      
      // Assign roles based on account index (configurable pattern)
      const roleAssignments = [
        { index: 0, role: SSI_ROLES.TRUSTEE, name: 'Deployer (Trustee)' },
        { index: 1, role: SSI_ROLES.ISSUER, name: 'Primary Issuer' },
        { index: 2, role: SSI_ROLES.HOLDER, name: 'Primary Holder' },
        { index: 3, role: SSI_ROLES.ISSUER, name: 'Secondary Issuer' },
        { index: 4, role: SSI_ROLES.HOLDER, name: 'Secondary Holder' },
      ];
      
      // Assign remaining accounts to roles in round-robin fashion
      const remainingRoles = [SSI_ROLES.ISSUER, SSI_ROLES.HOLDER, SSI_ROLES.TRUSTEE];
      
      configAccounts.forEach((accountConfig, index) => {
        const address = accountConfig.address;
        
        // If this is the deployer address, always assign TRUSTEE role
        if (address.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase()) {
          accounts.set(address, {
            role: SSI_ROLES.TRUSTEE,
            name: 'Deployer (Trustee)',
            used: false,
            source: 'caliper-config',
            privateKey: accountConfig.privateKey
          });
          console.log(`🔐 Assigned TRUSTEE role to deployer address: ${address}`);
          return;
        }
        
        const assignment = roleAssignments.find(a => a.index === index);
        
        if (assignment) {
          // Use predefined assignment for this index
          accounts.set(address, {
            role: assignment.role,
            name: assignment.name,
            used: false,
            source: 'caliper-config',
            privateKey: accountConfig.privateKey
          });
          console.log(`🔹 Assigned ${assignment.name} role to: ${address.substring(0, 10)}...`);
        } else {
          // Assign a round-robin role for additional accounts
          const role = remainingRoles[index % remainingRoles.length];
          const roleName = Object.keys(SSI_ROLES).find(key => SSI_ROLES[key] === role);
          accounts.set(address, {
            role: role,
            name: `${roleName} ${Math.floor(index / 3) + 1}`,
            used: false,
            source: 'caliper-config',
            privateKey: accountConfig.privateKey
          });
          console.log(`🔹 Assigned ${roleName} role to: ${address.substring(0, 10)}...`);
        }
      });
      
      console.log(`📊 Successfully loaded ${accounts.size} pre-funded accounts from Caliper network config`);
      
      // IMPORTANT: Automatically register DIDs for all Caliper accounts to ensure they're ready for credential operations
      console.log(`🔐 Auto-registering DIDs for all ${accounts.size} Caliper accounts...`);
      for (const [address, accountData] of accounts.entries()) {
        // Generate DID data for each account
        const docHash = this._generateRandomHash(`did-doc-${address.substring(2, 10)}`);
        const docCid = this._generateRandomCid();
        
        // Store in DIDs map (local tracking)
        this.entities.dids.set(address, {
          docHash,
          docCid,
          caller: address, // Self-signed DID
          createdAt: Date.now(),
          autoGenerated: true
        });
        
        // Update account data to mark as having a DID
        accountData.hasDid = true;
        
        console.log(`✅ Auto-registered DID for ${accountData.name} (${address.substring(0, 10)}...)`);
      }
      
      // Also mirror Caliper config accounts into the Global Accounts Cache (not fallback)
      // so that identity selection can source exclusively from the cache
      for (const [address, accountData] of accounts.entries()) {
        this._updateGlobalAccountCache(address, accountData, true);
      }
      
      return accounts;
    } catch (error) {
      console.error(`Failed to load accounts from Caliper network config: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get default predefined accounts as fallback when network config is unavailable
   * @returns {Map} Map of predefined accounts
   * @private
   */
  getDefaultPredefinedAccounts() {
    const accounts = new Map();
    
    // Add predefined accounts from the known network config accounts as fallback
    const predefinedAccounts = [
      { address: '0x4c2ae482593505f0163cdefc073e81c63cda4107', role: SSI_ROLES.HOLDER, name: 'Primary Holder' },
      { address: '0xa8e8f14732658e4b51e8711931053a8a69baf2b1', role: SSI_ROLES.ISSUER, name: 'Secondary Issuer' },
      { address: '0xd9a5179f091d85051d3c982785efd1455cec8699', role: SSI_ROLES.HOLDER, name: 'Secondary Holder' },
      { address: '0xe0a2bd4258d2768837baa26a28fe71dc079f84c7', role: SSI_ROLES.ISSUER, name: 'Primary Issuer' },
      { address: '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf', role: SSI_ROLES.HOLDER, name: 'Additional Holder' },
      { address: '0x2b5ad5c4795c026514f8317c7a215e218dccd6cf', role: SSI_ROLES.HOLDER, name: 'Additional Holder' },
      { address: '0x6813eb9362372eef6200f3b1dbc3f819671cba69', role: SSI_ROLES.HOLDER, name: 'Additional Holder' },
      { address: '0xe43f47c497e0eFC3fe96a85B2041aFF2F0d317A5', role: SSI_ROLES.HOLDER, name: 'Additional Holder' }
    ];
    
    // Add accounts to map
    predefinedAccounts.forEach(account => {
      accounts.set(account.address, {
        role: account.role,
        name: account.name,
        used: false,
        source: 'caliper-fallback'
      });
    });

    console.log(`🔐 Auto-registering DIDs for ${accounts.size} fallback accounts...`);
    for (const [address, accountData] of accounts.entries()) {
      // Mark as having DID for immediate use
      accountData.hasDid = true;
      
      // Store in DIDs map for local tracking
      this.entities.dids.set(address, {
        docHash: this._generateRandomHash(`did-fallback-${address.substring(2, 10)}`),
        docCid: this._generateRandomCid(),
        caller: address,
        createdAt: Date.now(),
        autoGenerated: true
      });
      
      console.log(`✅ Auto-registered DID for fallback ${accountData.name}`);
    }
    
    return accounts;
  }
  
  /**
   * Waits for accounts to be loaded from Caliper network configuration or fallback
   * This helps ensure operations don't start until we have accounts ready
   * @param {number} maxWaitMs - Maximum time to wait in milliseconds
   * @returns {Promise<boolean>} - True if accounts were loaded, false if timed out
   */
  async waitForAccountsLoaded(maxWaitMs = 10000) {
    if (this.accountsLoaded) {
      return true;
    }
    
    console.log(`⏳ Waiting for accounts to be loaded...`);
    
    const startTime = Date.now();
    while (!this.accountsLoaded && (Date.now() - startTime) < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    if (!this.accountsLoaded) {
      console.warn(`⏰ Timed out waiting for accounts to load after ${maxWaitMs}ms`);
      return false;
    }
    
    console.log(`✅ Accounts loaded successfully (${this.predefinedAccounts.size} accounts)`);
    return true;
  }
  
  /**
   * Generate a random Ethereum address
   * Uses crypto.randomBytes to create truly random addresses
   * @returns {string} Ethereum address
   * @private
   */
  _generateRandomAddress() {
    // Generate a secure random private key and derive a valid EOA address (EIP-55 checksummed)
    // Ensures uniform distribution across the full address space
    let pk;
    do {
      pk = crypto.randomBytes(32);
    } while (pk.equals(Buffer.alloc(32, 0))); // avoid zero key
    const privateKey = '0x' + pk.toString('hex');
    return ethers.computeAddress(privateKey);
  }
  
  /**
   * Generate a random hash (bytes32)
   * @param {string} prefix - Optional prefix
   * @returns {string} Hash
   * @private
   */
  _generateRandomHash(prefix = '') {
    // Build a high-entropy buffer: 64 random bytes + worker prefix + hi-res time + optional prefix
    const rndA = crypto.randomBytes(32);
    const rndB = crypto.randomBytes(32);
    const wp = this.workerPrefix ? Buffer.from(String(this.workerPrefix), 'utf8') : Buffer.alloc(0);
    const nowMs = Buffer.from(String(Date.now()), 'utf8');
    let hr = Buffer.alloc(0);
    try {
      hr = Buffer.from(process.hrtime.bigint().toString(), 'utf8');
    } catch (_) {
      // ignore if not available
    }
    const pfx = prefix ? Buffer.from(String(prefix), 'utf8') : Buffer.alloc(0);
    const entropy = Buffer.concat([rndA, rndB, wp, nowMs, hr, pfx]);
    // Hash the entropy to produce a uniformly distributed 32-byte value
    return ethers.keccak256(entropy);
  }

  /**
   * Base32 encode (lowercase, no padding) per RFC4648 alphabet
   * @param {Buffer} buffer - bytes to encode
   * @returns {string}
   * @private
   */
  _base32Encode(buffer) {
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of buffer) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      output += alphabet[(value << (5 - bits)) & 31];
    }
    return output;
  }
  
  /**
   * Generate a random IPFS CID
   * @returns {string} CID
   * @private
   */
  _generateRandomCid() {
    // Generate CIDv1 for dag-pb with sha2-256 multihash, base32 (lowercase) without padding.
    // Bytes layout: [version=0x01, codec=0x70 (dag-pb), mh_code=0x12 (sha2-256), mh_len=0x20 (32)] + 32-byte digest
    const prefix = Buffer.from([0x01, 0x70, 0x12, 0x20]);
    const digest = crypto.randomBytes(32);
    const cidBytes = Buffer.concat([prefix, digest]); // 36 bytes total
    const base32Body = this._base32Encode(cidBytes);  // 58 chars
    const cid = `b${base32Body}`; // multibase prefix 'b' -> total 59 chars
    // Safety check to guarantee requested length
    if (cid.length !== 59) {
      return cid.length > 59 ? cid.slice(0, 59) : cid + 'a'.repeat(59 - cid.length);
    }
    return cid;
  }
  
  /**
   * Get a random role type
   * @returns {number} Role type
   * @private
   */
  _getRandomRoleType() {
    const roles = [SSI_ROLES.ISSUER, SSI_ROLES.HOLDER, SSI_ROLES.TRUSTEE];
    return roles[Math.floor(Math.random() * roles.length)];
  }
  
  /**
   * Update the global account cache with a new or updated account
   * This ensures accounts persist between rounds even if new state managers are created
   * @param {string} address - Ethereum address
   * @param {Object} accountData - Account data including role, name, etc.
   * @param {boolean} hasDid - Whether this account has a DID registered
   * @private
   * @returns {Object} The copied account data
   */
  _updateGlobalAccountCache(address, accountData, hasDid = false) {
    if (!address || !accountData) return;
    
    // Copy account data to prevent reference issues
    const accountCopy = { ...accountData };
    
    // Always set used to false in the global cache to allow reuse
    accountCopy.used = false;
    
    // Track DID status in the account data
    accountCopy.hasDid = hasDid;
    
    // Add to global cache
    GLOBAL_ACCOUNT_CACHE.set(address, accountCopy);
    
    console.log(`🔄 Added account to global cache: ${accountCopy.name} (${address.substring(0, 10)}...) ${hasDid ? '✅ with DID' : ''}`);
    console.log(`📊 Global cache now has ${GLOBAL_ACCOUNT_CACHE.size} accounts`);
    
    return accountCopy; // Return the copied account data
  }

  /**
   * Check if an address already has a DID registered
   * @param {string} address - Ethereum address to check
   * @returns {boolean} True if the address has a DID, false otherwise
   * @private
   */
  _addressHasDid(address) {
    if (!address) return false;
    
    // First check local state tracking
    if (this.entities.dids.has(address)) {
      return true;
    }
    
    // Convert address to lowercase for case-insensitive comparison
    const addressLower = address.toLowerCase();
    
    // Check all DID keys with case-insensitive comparison
    for (const didAddress of this.entities.dids.keys()) {
      if (didAddress.toLowerCase() === addressLower) {
        return true;
      }
    }
    
    // Also check the Global Account Cache for DID information
    // This is crucial for persistence between benchmark rounds
    if (GLOBAL_ACCOUNT_CACHE.has(address) && GLOBAL_ACCOUNT_CACHE.get(address).hasDid) {
      return true;
    }
    
    // Check all cached addresses with case-insensitive comparison
    for (const [cachedAddress, accountData] of GLOBAL_ACCOUNT_CACHE.entries()) {
      if (cachedAddress.toLowerCase() === addressLower && accountData.hasDid) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Get a predefined account with specific role
   * @param {number} role - Role type
   * @param {boolean} markAsUsed - Whether to mark the account as used (default: true)
   * @returns {Object|null} Account or null if not found
   * @private
   */
  _getPredefinedAccountWithRole(role, markAsUsed = true) {
    // If requesting a TRUSTEE role, prioritize the deployer address if available
    if (role === SSI_ROLES.TRUSTEE) {
      for (const [address, account] of this.predefinedAccounts.entries()) {
        if (address.toLowerCase() === DEPLOYER_ADDRESS.toLowerCase() && (!account.used || !markAsUsed)) {
          // Mark as used if requested
          if (markAsUsed) {
            account.used = true;
          }
          console.log(`🔐 Using deployer address as TRUSTEE: ${address}`);
          return { address, ...account };
        }
      }
    }
    
    // Find unused account with matching role (or any account with that role if not marking as used)
    for (const [address, account] of this.predefinedAccounts.entries()) {
      if (account.role === role && (!account.used || !markAsUsed)) {
        // Mark as used if requested
        if (markAsUsed) {
          account.used = true;
        }
        console.log(`🔹 Using ${account.source} account with role ${role}: ${account.name} (${address})`);
        return { address, ...account };
      }
    }
    
    // No matching account found
    console.log(`⚠️ No ${markAsUsed ? 'unused' : ''} accounts with role ${role} found`);
    return null;
  }

  /**
   * Get accounts that need on-chain role assignment
   * This is useful for ensuring generated accounts get their roles registered on-chain
   * @returns {Array<Object>} Array of accounts that need role assignment
   */
  getAccountsNeedingRoleAssignment() {
    const accountsNeedingRoles = [];
    
    for (const [address, account] of this.predefinedAccounts.entries()) {
      if (account.needsRoleAssignment && account.source === 'generated') {
        accountsNeedingRoles.push({
          address,
          role: account.role,
          name: account.name
        });
      }
    }
    
    console.log(`🎭 Found ${accountsNeedingRoles.length} generated accounts needing on-chain role assignment`);
    return accountsNeedingRoles;
  }

  /**
   * Mark an account as having completed role assignment
   * @param {string} address - The account address
   */
  markRoleAssignmentComplete(address) {
    if (this.predefinedAccounts.has(address)) {
      const account = this.predefinedAccounts.get(address);
      account.needsRoleAssignment = false;
      console.log(`✅ Marked role assignment complete for: ${address.substring(0, 10)}...`);
    }
  }

  // === ROLE MANAGEMENT ===
  
  /**
   * Get arguments for role assignment
   * @param {number} role - Role type (optional)
   * @param {boolean} markAsUsed - Whether to mark the account as used (default: true)
   * @returns {Object} Role assignment arguments
   */
  getRoleAssignmentArguments(role = null, markAsUsed = true) {
    const targetRole = role !== null ? role : this._getRandomRoleType();
    
    // PRIORITIZE: Check if we have any generated accounts waiting for role assignment
    const accountsNeedingRoles = this.getAccountsNeedingRoleAssignment();
    const matchingAccountNeedingRole = accountsNeedingRoles.find(acc => acc.role === targetRole);
    
    if (matchingAccountNeedingRole) {
      console.log(`🎯 Prioritizing generated account needing role assignment: ${matchingAccountNeedingRole.name}`);
      
      // Mark role assignment as complete
      this.markRoleAssignmentComplete(matchingAccountNeedingRole.address);
      
      // CRITICAL: Update the global cache to reflect that this account no longer needs role assignment
      // This ensures getDIDCreationArguments can properly identify it as ready for DID creation
      const accountData = this.predefinedAccounts.get(matchingAccountNeedingRole.address);
      if (accountData) {
        accountData.needsRoleAssignment = false; // Mark role assignment as complete
        this._updateGlobalAccountCache(matchingAccountNeedingRole.address, accountData);
        console.log(`✅ Updated global cache - account ${matchingAccountNeedingRole.address.substring(0, 10)}... role assignment complete`);
      }
      
      // Store in roles map to track that this account has been assigned a role
      this.entities.roles.set(matchingAccountNeedingRole.address, {
        role: targetRole,
        assignedAt: Date.now()
      });
      
      return {
        role: targetRole,
        account: matchingAccountNeedingRole.address
      };
    }
    
    // Try to use predefined account first
    const predefinedAccount = this._getPredefinedAccountWithRole(targetRole, markAsUsed);
    
    if (predefinedAccount) {
      console.log(`🎯 Using predefined account for role ${targetRole}: ${predefinedAccount.name}`);
      
      // Store in roles map with timestamp
      this.entities.roles.set(predefinedAccount.address, {
        role: targetRole,
        assignedAt: Date.now()
      });
      
      // Update global cache to ensure the account state is properly tracked
      const accountData = this.predefinedAccounts.get(predefinedAccount.address);
      if (accountData) {
        this._updateGlobalAccountCache(predefinedAccount.address, accountData);
      }
      
      return {
        role: targetRole,
        account: predefinedAccount.address
      };
    }
    
    // Generate random address if no predefined account available
    const address = this._generateRandomAddress();
    
    // Store in roles map with timestamp
    this.entities.roles.set(address, {
      role: targetRole,
      assignedAt: Date.now()
    });
    
    // Add to predefined accounts map so it can be reused in later rounds
    const generatedAccount = {
      role: targetRole,
      name: `Generated ${Object.keys(SSI_ROLES).find(key => SSI_ROLES[key] === targetRole)} ${this.counters[SSI_ENTITY_TYPES.ROLE] + 1}`,
      used: markAsUsed,
      source: 'generated',
      needsRoleAssignment: true // Mark that this account needs on-chain role assignment
    };
    this.predefinedAccounts.set(address, generatedAccount);
    
    // Add to global cache for persistence between rounds
    this._updateGlobalAccountCache(address, generatedAccount);
    
    // Increment counter
    this.counters[SSI_ENTITY_TYPES.ROLE]++;
    
    console.log(`🆕 Generated new address for role ${targetRole}: ${address.substring(0, 10)}... (added to predefined accounts)`);
    console.log(`🎭 Account will need on-chain role assignment before DID creation`);
    
    return {
      role: targetRole,
      account: address
    };
  }
  
  // === DID MANAGEMENT ===
  
  /**
   * Get arguments for DID creation
   * @returns {Promise<Object>} DID creation arguments
   */
  async getDIDCreationArguments() {
    // Ensure accounts are loaded before proceeding
    await this.waitForAccountsLoaded();
    
    // PRIORITY 0: Always process DEPLOYER_ADDRESS first for DID creation (unless already processed)
    // This ensures the deployer gets a DID registered on-chain before other operations
    if (!this._addressHasDid(DEPLOYER_ADDRESS)) {
      console.log(`🛡️ PRIORITY 0: Processing DEPLOYER_ADDRESS ${DEPLOYER_ADDRESS.substring(0, 10)}... for DID creation`);
      
      // Generate document hash and CID for DEPLOYER_ADDRESS
      const deployerDocHash = this._generateRandomHash('did-doc-deployer');
      const deployerDocCid = this._generateRandomCid();
      
      // Store in DIDs map
      this.entities.dids.set(DEPLOYER_ADDRESS, {
        docHash: deployerDocHash,
        docCid: deployerDocCid,
        caller: DEPLOYER_ADDRESS, // Self-signed DID
        createdAt: Date.now(),
        purpose: 'initial-deployer-setup'
      });
      
      // Update global cache to mark DEPLOYER_ADDRESS as having a DID
      const accountData = this.predefinedAccounts.get(DEPLOYER_ADDRESS) || {
        role: SSI_ROLES.TRUSTEE,
        name: 'Deployer (Trustee)',
        used: false,
        source: 'caliper-config'
      };
      this._updateGlobalAccountCache(DEPLOYER_ADDRESS, accountData, true);
      
      console.log(`🔐 Processed DID creation for DEPLOYER_ADDRESS: ${DEPLOYER_ADDRESS.substring(0, 10)}... (will be registered on-chain)`);
      
      return {
        caller: DEPLOYER_ADDRESS,
        identity: DEPLOYER_ADDRESS,
        docHash: deployerDocHash,
        docCid: deployerDocCid
      };
    }
    
    // DEPLOYER_ADDRESS already has a DID, now process other accounts from global cache
    console.log(`✅ DEPLOYER_ADDRESS ${DEPLOYER_ADDRESS.substring(0, 10)}... already has DID, proceeding with other accounts from global cache`);
    
    
    // For DID creation, we need:
    // 1. A caller/signer (actor) who has a TRUSTEE, ISSUER, or HOLDER role
    // 2. An identity address for which the DID will be created (can be same as caller for self-signed DIDs)
    
    // First, get the caller/signer from predefined accounts with appropriate role
    const callerRolePreference = [SSI_ROLES.TRUSTEE, SSI_ROLES.ISSUER, SSI_ROLES.HOLDER];
    let caller = null;
    
    // Try to find a predefined account with the preferred roles for caller
    // Prioritize TRUSTEE role (especially deployer address) as it has highest permissions
    for (const role of callerRolePreference) {
      const account = this._getPredefinedAccountWithRole(role, false); // Don't mark as used
      if (account) {
        caller = account.address;
        console.log(`🔑 Using account with role ${role} as DID creation caller: ${caller.substring(0, 10)}...`);
        break;
      }
    }
    
    if (!caller) {
      throw new Error('No suitable caller account found with required role for DID creation');
    }
    
    // Now, get a separate identity address for which the DID will be created
    // PRIORITY 1: Accounts that have been assigned roles via getRoleAssignmentArguments but don't have DIDs yet
    // These are the accounts we want to create DIDs for to complete the workflow
    const accountsWithRolesNeedingDids = Array.from(GLOBAL_ACCOUNT_CACHE.entries())
      .filter(([address, data]) => {
        if (!data) return false;
        // Must be a generated account (from getRoleAssignmentArguments)
        if (data.source !== 'generated') return false;
        // Must have completed role assignment (no longer needs role assignment)
        if (data.needsRoleAssignment) return false;
        // Must NOT already have a DID (this is what we want to create)
        if (this._addressHasDid(address)) return false;
        // Must have a role assigned in entities.roles (indicating it went through role assignment)
        if (!this.entities.roles.has(address)) return false;
        return true;
      })
      .map(([address, _]) => address);
    
    console.log(`🎯 PRIORITY: Found ${accountsWithRolesNeedingDids.length} accounts with assigned roles that need DIDs`);
    
    // Debug: Log details about prioritized accounts
    if (accountsWithRolesNeedingDids.length > 0) {
      console.log(`📋 Accounts with assigned roles needing DIDs:`);
      accountsWithRolesNeedingDids.forEach(addr => {
        const data = GLOBAL_ACCOUNT_CACHE.get(addr);
        const roleInEntities = this.entities.roles.get(addr);
        const roleName = Object.keys(SSI_ROLES).find(key => SSI_ROLES[key] === data?.role) || 'UNKNOWN';
        console.log(`  - ${data?.name || 'Unknown'} (${addr.substring(0, 10)}...) [${roleName}] - Role in entities: ${roleInEntities ? 'YES' : 'NO'}`);
      });
    }
    
    let identity;
    
    if (accountsWithRolesNeedingDids.length > 0) {
      // Prioritize accounts that have been assigned roles but don't have DIDs yet
      identity = accountsWithRolesNeedingDids[Math.floor(Math.random() * accountsWithRolesNeedingDids.length)];
      const accountData = GLOBAL_ACCOUNT_CACHE.get(identity);
      const roleName = Object.keys(SSI_ROLES).find(key => SSI_ROLES[key] === accountData.role) || 'UNKNOWN';
      console.log(`🎯 PRIORITY: Using account with assigned ${roleName} role for DID creation: ${identity.substring(0, 10)}...`);
    } else {
      // FALLBACK: Look for other available accounts (excluding fallback sources)
      const availableAddresses = Array.from(GLOBAL_ACCOUNT_CACHE.entries())
        .filter(([address, data]) => {
          if (!data) return false;
          // Exclude fallback Caliper accounts
          if (data.source === 'caliper-fallback') return false;
          // Identity for DID creation must NOT already have a DID
          if (this._addressHasDid(address)) {
            console.log(`🔍 Cached address ${address.substring(0, 10)}... already has a DID, excluding from selection`);
            return false;
          }
          return true;
        })
        .map(([address, _]) => address);
      
      if (availableAddresses.length > 0) {
        identity = availableAddresses[Math.floor(Math.random() * availableAddresses.length)];
        console.log(`👤 FALLBACK: Using existing account for DID identity: ${identity.substring(0, 10)}...`);
      } else {
        // Last resort: generate a new address
        identity = this._generateRandomAddress();
        const generatedAccount = {
          role: SSI_ROLES.HOLDER, // Default role for DID identity addresses
          name: `Generated DID Document ${this.counters[SSI_ENTITY_TYPES.DID] + 1}`,
          used: false,
          source: 'generated',
          needsRoleAssignment: true // Mark that this account needs on-chain role assignment
        };
        this.predefinedAccounts.set(identity, generatedAccount);
        // Ensure the identity exists in the Global Accounts Cache (requirement)
        this._updateGlobalAccountCache(identity, generatedAccount);
        
        // IMPORTANT: Register role assignment for this generated account in local tracking
        // This ensures the account will have the proper role on-chain when needed
        this.entities.roles.set(identity, {
          role: SSI_ROLES.HOLDER
        });
        
        console.log(`🆕 LAST RESORT: Generated new address for DID identity: ${identity.substring(0, 10)}...`);
        console.log(`🎭 Marked generated account for HOLDER role assignment: ${identity.substring(0, 10)}...`);
      }
    }
    
    // Generate document hash and CID
    const docHash = this._generateRandomHash('did-doc');
    const docCid = this._generateRandomCid();

    // Store in DIDs map
    this.entities.dids.set(identity, {
      docHash,
      docCid,
      caller,
      createdAt: Date.now()
    });
    
    // CRITICAL: Update the global account cache to track this address as having a DID
    // This ensures the DID status persists between benchmark rounds
    if (this.predefinedAccounts.has(identity)) {
      const accountData = this.predefinedAccounts.get(identity);
      this._updateGlobalAccountCache(identity, accountData, true); // true = has DID
      console.log(`🔑 Marked identity ${identity.substring(0, 10)}... as having a DID in global cache`);
    }
    
    // Log successful DID setup for better traceability
    console.log(`✅ Successfully prepared DID creation: 
    - Caller: ${caller.substring(0, 10)}...
    - Identity: ${identity.substring(0, 10)}...
    - Document Hash: ${docHash.substring(0, 10)}...
    - Document CID: ${docCid}`);
    
    // Increment counter
    this.counters[SSI_ENTITY_TYPES.DID]++;
    
    return {
      caller,      // The address that will call the createDid function (must have role)
      identity,    // The address for which the DID will be created
      docHash,
      docCid
    };
  }
  
  // === CREDENTIAL MANAGEMENT ===
  
  /**
   * Get arguments for credential issuance
   * @returns {Promise<Object>} Credential issuance arguments
   */
  async getCredentialIssuanceArguments() {
    // Ensure accounts are loaded before proceeding
    await this.waitForAccountsLoaded();
    
    // Note: DEPLOYER_ADDRESS DID registration is now handled in getDIDCreationArguments method
    // This ensures the deployer has a DID before credential issuance operations
    
    // Initialize used identity tracking if not exists
    if (!this.usedHolders) {
      this.usedHolders = new Set();
    }
    
    // For credential issuance, we only need a HOLDER (identity)
    // The issuer will be the caller/sender (msg.sender) in the contract
    let identity = null;
    
    console.log(`🔍 Looking for accounts with DIDs for credential issuance from global cache...`);
    console.log(`📊 Global cache has ${GLOBAL_ACCOUNT_CACHE.size} accounts available`);
    
    // PRIORITY 1: Accounts that went through the complete workflow (Role Assignment → DID Creation)
    // These are accounts that were generated via getRoleAssignmentArguments and then got DIDs via getDIDCreationArguments
    const workflowAccountsWithDids = Array.from(GLOBAL_ACCOUNT_CACHE.entries())
      .filter(([address, data]) => {
        if (!data) return false;
        // Must be a generated account (from the workflow)
        if (data.source !== 'generated') return false;
        // Must have completed role assignment
        if (data.needsRoleAssignment) return false;
        // Must have a DID registered
        if (!this._addressHasDid(address)) return false;
        // Must have been tracked in entities.roles (went through role assignment)
        if (!this.entities.roles.has(address)) return false;
        // STRICT: ONLY HOLDER role accounts can be credential holders
        return data.role === SSI_ROLES.HOLDER;
      })
      .map(([address, _]) => address);
    
    console.log(`🎯 PRIORITY: Found ${workflowAccountsWithDids.length} workflow HOLDER accounts with DIDs for credential holding`);
    
    // FALLBACK: All other accounts with DIDs that have HOLDER role (exclude caliper-fallback)
    const otherHoldersWithDids = Array.from(GLOBAL_ACCOUNT_CACHE.entries())
      .filter(([address, data]) => {
        if (!data) return false;
        if (data.source === 'caliper-fallback') return false; // exclude fallback
        if (!this._addressHasDid(address)) return false; // must have DID
        // Skip if already in priority list
        if (workflowAccountsWithDids.includes(address)) return false;
        // STRICT: ONLY HOLDER role accounts can be credential holders
        return data.role === SSI_ROLES.HOLDER;
      })
      .map(([address, _]) => address);
    
    // Combine priority and fallback lists
    const holdersWithDids = [...workflowAccountsWithDids, ...otherHoldersWithDids];
    
    console.log(`🔢 Found ${holdersWithDids.length} total HOLDER accounts with DIDs (${workflowAccountsWithDids.length} priority + ${otherHoldersWithDids.length} fallback)`);
    
    // Debug: Log details about available HOLDER accounts
    if (workflowAccountsWithDids.length > 0) {
      console.log(`📋 Priority workflow HOLDER accounts available for credential holding:`);
      workflowAccountsWithDids.forEach(addr => {
        const data = GLOBAL_ACCOUNT_CACHE.get(addr);
        console.log(`  - ${data?.name || 'Unknown'} (${addr.substring(0, 10)}...) [HOLDER]`);
      });
    }
    
    // Find a valid identity (holder) that hasn't been used before
    // PRIORITY: Try workflow accounts first
    let availableHolders = workflowAccountsWithDids.filter(address => {
      // Ensure this holder exists in Global Cache (should by construction)
      if (!GLOBAL_ACCOUNT_CACHE.has(address)) return false;
      // Check if it's been used before
      if (this.usedHolders.has(address.toLowerCase())) return false;
      return true;
    });
    
    // FALLBACK: If no priority accounts available, try other accounts
    if (availableHolders.length === 0) {
      console.log(`⚠️ No unused priority workflow accounts found, trying other accounts with DIDs...`);
      availableHolders = otherHoldersWithDids.filter(address => {
        // Ensure this holder exists in Global Cache (should by construction)
        if (!GLOBAL_ACCOUNT_CACHE.has(address)) return false;
        // Double-check it's not fallback
        const data = GLOBAL_ACCOUNT_CACHE.get(address);
        if (data && data.source === 'caliper-fallback') return false;
        // Check if it's been used before
        if (this.usedHolders.has(address.toLowerCase())) return false;
        return true;
      });
    }
    
    // LAST RESORT: If no available holders, use any holder with DID
    if (availableHolders.length === 0) {
      console.log(`⚠️ No unused holders found, using any holder with DID`);
      availableHolders = holdersWithDids;
    }
    
    if (availableHolders.length === 0) {
      throw new Error('No HOLDER accounts with DIDs available as credential holders. Only accounts with HOLDER role can receive credentials.');
    }
    
    // Select a holder
    identity = availableHolders[Math.floor(Math.random() * availableHolders.length)];
    
    // Mark as used
    this.usedHolders.add(identity.toLowerCase());
    
    // Log the selection with context about whether it's from the workflow
    const isWorkflowAccount = workflowAccountsWithDids.includes(identity);
    const accountData = GLOBAL_ACCOUNT_CACHE.get(identity);
    
    // Validate that selected account actually has HOLDER role (safety check)
    if (accountData?.role !== SSI_ROLES.HOLDER) {
      console.warn(`⚠️ WARNING: Selected account ${identity.substring(0, 10)}... does not have HOLDER role! Role: ${accountData?.role}`);
    }
    
    if (isWorkflowAccount) {
      console.log(`🎯 Using PRIORITY workflow HOLDER account: ${identity.substring(0, 10)}... - ${accountData?.name || 'Unknown'}`);
    } else {
      console.log(`🧑 Using FALLBACK HOLDER account: ${identity.substring(0, 10)}... - ${accountData?.name || 'Unknown'}`);
    }
    
    // Perform validation to ensure identity has a DID
    // This is essential to prevent transaction failures
    const holderHasDid = this._addressHasDid(identity);
    
    // Log warning if holder doesn't have a DID (this might cause transaction failure)
    if (!holderHasDid) {
      console.warn(`⚠️ WARNING: Selected holder ${identity.substring(0, 10)}... doesn't have a DID registered!`);
      console.warn(`   This will likely cause credential issuance transaction to fail.`);
    }
    
    // Generate credential ID and CID
    const credentialId = this._generateRandomHash('credential');
    const credentialCid = this._generateRandomCid();
    
    // Store in credentials map
    this.entities.credentials.set(credentialId, {
      holder: identity,
      credentialCid,
      issuedAt: Date.now()
    });
    
    // Ensure the account is properly saved in the global cache for reuse
    // This step is crucial for maintaining the holder relationship across test rounds
    if (this.predefinedAccounts.has(identity)) {
      this._updateGlobalAccountCache(identity, this.predefinedAccounts.get(identity));
    }
    
    // Track this credential issuance relationship for potential future use
    // This could be used to validate credential revocation or updates in later rounds
    if (!this.issuedCredentials) {
      this.issuedCredentials = new Map();
    }
    
    this.issuedCredentials.set(credentialId, {
      holder: identity,
      timestamp: Date.now(),
      hasDids: {
        holder: holderHasDid
      }
    });
    
    // Log successful credential setup for better traceability
    const deployerHasDid = this._addressHasDid(DEPLOYER_ADDRESS);
    const isWorkflowHolderAccount = workflowAccountsWithDids.includes(identity);
    
    console.log(`✅ Successfully prepared credential issuance: 
    - Deployer (Trustee): ${DEPLOYER_ADDRESS.substring(0, 10)}... (Has DID: ${deployerHasDid ? 'YES' : 'NO'})
    - Holder: ${identity.substring(0, 10)}... (Has DID: ${holderHasDid ? 'YES' : 'NO'}) ${isWorkflowHolderAccount ? '[WORKFLOW ACCOUNT]' : '[FALLBACK ACCOUNT]'}
    - Credential ID: ${credentialId.substring(0, 10)}...
    - Credential CID: ${credentialCid}`);
    
    // Warn if deployer doesn't have DID (this could cause issuer transaction failures)
    if (!deployerHasDid) {
      console.warn(`⚠️ WARNING: DEPLOYER_ADDRESS doesn't have a DID - this may cause credential issuance to fail!`);
    }
    
    // Increment counter
    this.counters[SSI_ENTITY_TYPES.CREDENTIAL]++;
    
    return {
      identity,     // The holder address that will receive the credential
      credentialId,
      credentialCid
    };
  }
  
  /**
   * Get entity state statistics
   * @returns {Object} State statistics
   */
  getStateStatistics() {
    return {
      worker: this.workerIndex,
      entityCounts: {
        roles: this.entities.roles.size,
        dids: this.entities.dids.size,
        credentials: this.entities.credentials.size
      },
      counters: { ...this.counters }
    };
  }
}

// Export constants
SimplifiedSSIStateManager.ENTITY_TYPES = SSI_ENTITY_TYPES;
SimplifiedSSIStateManager.ROLES = SSI_ROLES;
SimplifiedSSIStateManager.DEPLOYER_ADDRESS = DEPLOYER_ADDRESS;

module.exports = SimplifiedSSIStateManager;