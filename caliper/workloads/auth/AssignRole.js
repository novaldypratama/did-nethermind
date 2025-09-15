'use strict';

const SimplifiedSSIOperationBase = require('../utils/ssi-operation');
const SimplifiedSSIStateManager = require('../utils/ssi-state');

/**
 * Simplified Role Assignment Workload for Caliper Benchmarking
 * Leverages @hyperledger/caliper-ethereum for optimal Besu transaction handling
 */
class SimplifiedAssignRole extends SimplifiedSSIOperationBase {
  /**
   * Initialize the workload module
   */
  constructor() {
    super();
    this.operationType = 'assignRole';
  }

  /**
   * Create an SSI state manager instance
   * @returns {SimplifiedSSIStateManager} State manager instance
   */
  createSSIState() {
    return new SimplifiedSSIStateManager(this.workerIndex, 'role', this.ssiConfig);
  }

  /**
   * Execute a single transaction
   * @returns {Promise} Transaction result
   */
  async submitTransaction() {
    try {
      console.log(`Worker ${this.workerIndex}: Starting role assignment...`);
      
      // Get role assignment arguments from state manager
      const roleArgs = this.ssiState.getRoleAssignmentArguments();
      
      if (!roleArgs) {
        throw new Error('Failed to generate role assignment arguments');
      }
      
      console.log(`Role assignment args:`, {
        role: roleArgs.role,
        account: roleArgs.account
      });
      
      // Use optimized Caliper Ethereum connector for transaction submission
      const result = await this.executeSSIOperation(
        SimplifiedSSIOperationBase.CONTRACTS.ROLE_CONTROL,
        SimplifiedSSIOperationBase.OPERATIONS.ASSIGN_ROLE,
        roleArgs
      );
      
      console.log(`✅ Role assignment successful for Worker ${this.workerIndex}`);
      
      return result;
    } catch (error) {
      console.error(`❌ Role assignment failed for Worker ${this.workerIndex}: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Create a new workload module instance
 * @returns {SimplifiedAssignRole} Workload module instance
 */
function createWorkloadModule() {
  return new SimplifiedAssignRole();
}

module.exports.createWorkloadModule = createWorkloadModule;