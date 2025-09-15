'use strict';

const SimplifiedSSIOperationBase = require('../utils/ssi-operation');
const SimplifiedSSIStateManager = require('../utils/ssi-state');

/**
 * Simplified Issue Credential Workload for Caliper Benchmarking
 */
class SimplifiedIssueCredential extends SimplifiedSSIOperationBase {
  /**
   * Initialize the workload module
   */
  constructor() {
    super();
    this.operationType = 'issueCredential';
  }

  /**
   * Create an SSI state manager instance
   * @returns {SimplifiedSSIStateManager} State manager instance
   */
  createSSIState() {
    return new SimplifiedSSIStateManager(this.workerIndex, 'credential', this.ssiConfig);
  }

  /**
   * Execute a single transaction
   * @returns {Promise} Transaction result
   */
  async submitTransaction() {
    try {
      console.log(`Worker ${this.workerIndex}: Starting Issue Credential...`);
      
      // Get Issue Credential arguments from state manager - now async
      const credentialArgs = await this.ssiState.getCredentialIssuanceArguments();

      if (!credentialArgs) {
        throw new Error('Failed to generate credential arguments');
      }

      console.log(`Credential args:`, {
        identity: credentialArgs.identity.substring(0, 10) + '...',
        credentialId: `${credentialArgs.credentialId.substring(0, 10)}...`,
        cidLength: credentialArgs.credentialCid.length
      });

      // Execute credential issuance operation using WebSocket provider
      // For issueCredential(address identity, bytes32 credentialId, string calldata credentialCid)
      // The issuer is now handled by msg.sender in the contract
      const issueCredentialArgs = {
        identity: credentialArgs.identity,
        credentialId: credentialArgs.credentialId,
        credentialCid: credentialArgs.credentialCid
      };

      console.log(`args_array:`, Object.values(issueCredentialArgs));

      const result = await this.executeSSIOperation(
        SimplifiedSSIOperationBase.CONTRACTS.CREDENTIAL_REGISTRY,
        SimplifiedSSIOperationBase.OPERATIONS.ISSUE_CREDENTIAL,
        issueCredentialArgs
        // The caller address (issuer) is now handled by the contract via msg.sender
      );

      console.log(`✅ Credential issuance successful for Worker ${this.workerIndex}`);
      
      return result;
    } catch (error) {
      console.error(`❌ Credential issuance failed for Worker ${this.workerIndex}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Create a new workload module instance
 * @returns {SimplifiedIssueCredential} Workload module instance
 */
function createWorkloadModule() {
  return new SimplifiedIssueCredential();
}

module.exports.createWorkloadModule = createWorkloadModule;