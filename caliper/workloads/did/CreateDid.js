'use strict';

const SimplifiedSSIOperationBase = require('../utils/ssi-operation');
const SimplifiedSSIStateManager = require('../utils/ssi-state');

/**
 * Simplified DID Creation Workload for Caliper Benchmarking
 * Integrates with Web3Signer for Besu security architecture
 */
class SimplifiedCreateDid extends SimplifiedSSIOperationBase {
  /**
   * Initialize the workload module
   */
  constructor() {
    super();
    this.operationType = 'createDid';
  }

  /**
   * Create an SSI state manager instance
   * @returns {SimplifiedSSIStateManager} State manager instance
   */
  createSSIState() {
    return new SimplifiedSSIStateManager(this.workerIndex, 'did', this.ssiConfig);
  }

  /**
   * Execute a single transaction
   * @returns {Promise} Transaction result
   */
  async submitTransaction() {
    try {
      console.log(`Worker ${this.workerIndex}: Starting DID creation...`);
      
      // Get DID creation arguments from state manager - now async
      const didArgs = await this.ssiState.getDIDCreationArguments();
      
      if (!didArgs) {
        throw new Error('Failed to generate DID creation arguments');
      }
      
      console.log(`DID creation args:`, {
        caller: didArgs.caller.substring(0, 10) + '...',
        identity: didArgs.identity.substring(0, 10) + '...',
        docHash: `${didArgs.docHash.substring(0, 10)}...`,
        cidLength: didArgs.docCid.length
      });
      
      // Execute DID creation operation using WebSocket provider
      // For createDid(address identity, bytes32 docHash, string calldata docCid)
      // Note that we exclude 'caller' from the args since it's used for the fromAddress
      const createDidArgs = {
        identity: didArgs.identity,
        docHash: didArgs.docHash,
        docCid: didArgs.docCid
      };
      
      const result = await this.executeSSIOperation(
        SimplifiedSSIOperationBase.CONTRACTS.DID_REGISTRY,
        SimplifiedSSIOperationBase.OPERATIONS.CREATE_DID,
        createDidArgs,
        // The caller address (fromAddress) is now handled by the contract via msg.sender
      );
      
      console.log(`✅ DID creation successful for Worker ${this.workerIndex}`);
      
      return result;
    } catch (error) {
      console.error(`❌ DID creation failed for Worker ${this.workerIndex}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Create a new workload module instance
 * @returns {SimplifiedCreateDid} Workload module instance
 */
function createWorkloadModule() {
  return new SimplifiedCreateDid();
}

module.exports.createWorkloadModule = createWorkloadModule;