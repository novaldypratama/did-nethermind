'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

// SSI Contract names - must match network configuration
const SSI_CONTRACTS = {
  ROLE_CONTROL: 'RoleControl',
  DID_REGISTRY: 'DidRegistry',
  CREDENTIAL_REGISTRY: 'CredentialRegistry'
};

// SSI Operation types
const SSI_OPERATIONS = {
  // Role operations
  ASSIGN_ROLE: 'assignRole',
  REVOKE_ROLE: 'revokeRole',
  GET_ROLE: 'getRole',

  // DID operations  
  CREATE_DID: 'createDid',
  UPDATE_DID: 'updateDid',
  RESOLVE_DID: 'resolveDid',

  // Credential operations
  ISSUE_CREDENTIAL: 'issueCredential',
  UPDATE_CREDENTIAL_STATUS: 'updateCredentialStatus',
  RESOLVE_CREDENTIAL: 'resolveCredential'
};

// Read-only operations (don't require gas/transaction)
const READ_ONLY_OPERATIONS = new Set([
  SSI_OPERATIONS.GET_ROLE,
  SSI_OPERATIONS.RESOLVE_DID,
  SSI_OPERATIONS.RESOLVE_CREDENTIAL
]);

// SSI Role Constants
const SSI_ROLES = {
  NONE: 0,
  ISSUER: 1,
  HOLDER: 2,
  TRUSTEE: 3
};

/**
 * Simplified SSI Operation Base with Caliper Ethereum Integration
 * Leverages @hyperledger/caliper-ethereum for optimal Besu transaction handling
 */
class SimplifiedSSIOperationBase extends WorkloadModuleBase {
  /**
   * Initialize the SSI workload module
   */
  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);

    // Initialize basic configuration
    this.workerIndex = workerIndex;
    this.totalWorkers = totalWorkers;
    this.roundIndex = roundIndex;

    // Validate connector is Ethereum
    this.assertConnectorType();

    // Initialize SSI configuration
    this.initializeSSIConfiguration();

    // Setup account management
    await this.setupAccountManagement();

    // Validate required contracts exist
    this.validateContractAvailability();

    // Initialize state manager if needed (must be implemented by subclass)
    this.ssiState = this.createSSIState();

    // Store reference as stateManager for consistency across methods
    this.stateManager = this.ssiState;

    console.log(`🔗 Worker ${this.workerIndex} initialized with account: ${this.fromAddress}`);
  }

  /**
   * Override to provide an SSI State Manager instance
   * @protected
   */
  createSSIState() {
    throw new Error('createSSIState must be implemented by subclass');
  }

  /**
   * Ensures the connector type is Ethereum
   * @protected
   */
  assertConnectorType() {
    this.connectorType = this.sutAdapter.getType();
    if (this.connectorType !== 'ethereum') {
      throw new Error(`SSI workload error: Connector type ${this.connectorType} is not supported; expected: ethereum`);
    }
  }

  /**
   * Initialize SSI configuration from round arguments
   * @protected
   */
  initializeSSIConfiguration() {
    // Extract required configuration (simplified for Caliper Ethereum)
    const requiredSettings = ['besuEndpoint', 'chainId'];

    requiredSettings.forEach(setting => {
      if (!this.roundArguments.hasOwnProperty(setting)) {
        throw new Error(`SSI workload error: required setting "${setting}" is missing from benchmark configuration`);
      }
    });

    // Store SSI configuration optimized for Caliper Ethereum
    this.ssiConfig = {
      chainId: this.roundArguments.chainId || 1337,
      besuEndpoint: this.roundArguments.besuEndpoint,
      contractAddresses: this.roundArguments.contractAddresses || {},
      gasConfig: this.roundArguments.gasConfig || {},
      // Additional Caliper Ethereum specific configurations
      gasPrice: this.roundArguments.gasPrice || 2000000000
    };

    console.log(`⚙️ SSI Configuration loaded for worker ${this.workerIndex}`);
  }

  /**
   * Setup account management with Caliper Ethereum integration
   * @protected
   */
  async setupAccountManagement() {
    // Initialize nonce tracker
    this.nonceTracker = {};

    // Try to use available accounts from network config or adapter
    const networkAccounts = this.getNetworkAccounts();

    if (networkAccounts && networkAccounts.length > 0) {
      // Select account based on worker index
      const availableAccounts = networkAccounts.length;
      this.clientIdx = this.workerIndex % availableAccounts;
      this.fromAddress = networkAccounts[this.clientIdx].address;

      console.log(`👤 Worker ${this.workerIndex} using network account ${this.clientIdx}: ${this.fromAddress}`);
    } else {
      // Fallback to connector's default account
      this.fromAddress = this.sutAdapter.defaultAccount || null;

      if (!this.fromAddress) {
        throw new Error('No accounts available from network config or connector defaults');
      }

      console.log(`👤 Worker ${this.workerIndex} using default account: ${this.fromAddress}`);
    }

    // Initialize nonce tracker for this account
    this.nonceTracker[this.fromAddress] = 0;
  }

  /**
   * Get accounts from network configuration
   * @returns {Array|null} Array of account objects or null if not found
   * @protected
   */
  getNetworkAccounts() {
    try {
      // Try multiple paths to network accounts
      if (this.sutAdapter.context?.networkConfiguration?.ethereum?.accounts) {
        return this.sutAdapter.context.networkConfiguration.ethereum.accounts;
      }

      if (this.sutAdapter.networkConfiguration?.ethereum?.accounts) {
        return this.sutAdapter.networkConfiguration.ethereum.accounts;
      }

      if (this.sutAdapter.ethereumConfig?.accounts) {
        return this.sutAdapter.ethereumConfig.accounts;
      }

      return null;
    } catch (error) {
      console.warn(`⚠️ Could not access network accounts: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate that required contracts are available
   * @protected
   */
  validateContractAvailability() {
    console.log(`🔍 Validating contract availability...`);

    // Ensure contracts exist in sutAdapter
    if (!this.sutAdapter.ethereumConfig?.contracts) {
      throw new Error('sutAdapter.ethereumConfig.contracts is missing');
    }

    // Check for required SSI contracts
    const requiredSSIContracts = Object.values(SSI_CONTRACTS);

    for (const contractName of requiredSSIContracts) {
      const contract = this.sutAdapter.ethereumConfig.contracts[contractName];

      if (!contract) {
        throw new Error(`${contractName} contract not found in sutAdapter`);
      }

      if (typeof contract !== 'object') {
        throw new Error(`${contractName} is not a valid contract object`);
      }

      console.log(`✅ ${contractName} contract validated`);
    }
  }

  /**
   * Create a Caliper-compatible request for SSI operations
   * Leverages @hyperledger/caliper-ethereum for proper transaction handling
   * @param {string} contractName - Contract name matching network config
   * @param {string} operation - Contract function to call
   * @param {Object} args - Function arguments
   * @param {Object} options - Additional options
   * @returns {Object} Caliper connector request
   * @protected
   */
  createSSIRequest(contractName, operation, args, options = {}) {
    const isReadOnly = READ_ONLY_OPERATIONS.has(operation);
    // const limit = this.getGasLimitFromConfig(contractName, operation);

    // if (typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 100000) {
    //   throw new Error(`Invalid gas limit resolved for ${contractName}.${operation}: ${limit}`);   
    // }

    // Create basic request optimized for Caliper Ethereum
    const request = {
      contract: contractName,
      verb: operation,
      args: Object.values(args),
      readOnly: isReadOnly,
      ...options
    };

    // Add transaction-specific fields for write operations
    if (!isReadOnly) {
      // Use Caliper Ethereum's gas configuration
      request.gas = {
        limit: this.getGasLimitFromConfig(contractName, operation),
        price: this.ssiConfig.gasPrice
      };

      // // Caliper Ethereum expects flat fields: gas (limit) and gasPrice
      // request.gas = limit;
      // request.gasPrice = this.ssiConfig.gasPrice;

      // Let Caliper Ethereum handle transaction signing and nonce management
    }

    return request;
  }

  /**
   * Get gas limit from configuration with fallbacks
   * @param {string} contractName - Contract name
   * @param {string} operation - Operation name
   * @returns {number} Gas limit
   * @protected
   */
  getGasLimitFromConfig(contractName, operation) {
    // Try custom gas config first
    if (this.ssiConfig.gasConfig?.[contractName]?.[operation]) {
      return this.ssiConfig.gasConfig[contractName][operation];
    }

    // Try to get from network contract configuration
    try {
      const contractConfig = this.sutAdapter.ethereumConfig.contracts[contractName];
      if (contractConfig?.gas?.limit) {
        return contractConfig.gas.limit;
      }

      if (contractConfig?.functions?.[operation]?.gas) {
        return contractConfig.functions[operation].gas;
      }
    } catch (error) {
      // Continue to fallback values
    }

    // Fallback to reasonable defaults optimized for SSI operations
    const defaultGasLimits = {
      'assignRole': 100000,
      'revokeRole': 70000,
      'createDid': 140000,
      'updateDid': 80000,
      'issueCredential': 130000,
      'updateCredentialStatus': 100000,
      // Read operations (should not be used as they're read-only)
      'getRole': 20000,
      'resolveDid': 20000,
      'resolveCredential': 20000
    };

    return defaultGasLimits[operation] || 250000;
  }

  /**
   * Execute an SSI operation using Caliper Ethereum connector
   * @param {string} contractName - Contract name
   * @param {string} operation - Operation name
   * @param {Object} args - Operation arguments
   * @param {Object|string} options - Additional options or caller address
   * @returns {Promise} Operation result
   * @protected
   */
  async executeSSIOperation(contractName, operation, args, options = {}) {
    const startTime = Date.now();
    let result;

    // Handle case where options is actually a caller address string
    if (typeof options === 'string' && options.startsWith('0x')) {
      options = { fromAddress: options };
    }

    try {
      // Create optimized request for Caliper Ethereum
      const request = this.createSSIRequest(contractName, operation, args, options);

      console.log('Caliper request gas:', request.gas);

      // Use sutAdapter.sendRequests for optimal Besu interaction
      result = await this.sutAdapter.sendRequests(request);

      const executionTime = Date.now() - startTime;
      console.log(`✅ ${contractName}.${operation} completed in ${executionTime}ms`);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`❌ ${contractName}.${operation} failed after ${executionTime}ms: ${error.message}`);

      // Add transaction details to error for better debugging
      if (error.originalError) {
        console.error(`Original error: ${error.originalError.message || JSON.stringify(error.originalError)}`);
      }

      throw error;
    }
  }

  /**
   * Get current nonce for the from address
   * Uses Caliper Ethereum's nonce management
   * @returns {Promise<number>} Current nonce
   * @protected
   */
  async getCurrentNonce() {
    try {
      // Let Caliper Ethereum handle nonce management
      return await this.sutAdapter.getNonce(this.fromAddress);
    } catch (error) {
      // Fallback to local tracking
      return this.nonceTracker[this.fromAddress] || 0;
    }
  }

  /**
   * Increment nonce tracker (for fallback scenarios)
   * @protected
   */
  incrementNonce() {
    this.nonceTracker[this.fromAddress] = (this.nonceTracker[this.fromAddress] || 0) + 1;
  }
}

// Export constants for use in workload modules
SimplifiedSSIOperationBase.CONTRACTS = SSI_CONTRACTS;
SimplifiedSSIOperationBase.OPERATIONS = SSI_OPERATIONS;
SimplifiedSSIOperationBase.ROLES = SSI_ROLES;

module.exports = SimplifiedSSIOperationBase;
