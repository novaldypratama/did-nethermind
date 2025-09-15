// network-diagnostic.js - Comprehensive network diagnostics for deployment issues

const { ethers } = require("hardhat");

async function runDiagnostics() {
  console.log("🔍 NETWORK DIAGNOSTIC REPORT");
  console.log("=".repeat(60));

  try {
    // Test 1: Basic Provider Connection
    console.log("\n📡 TEST 1: Basic Provider Connection");
    console.log("-".repeat(40));

    const [deployer] = await ethers.getSigners();
    const provider = deployer.provider;

    console.log(`✅ Provider connected`);
    console.log(`   Type: ${provider.constructor.name}`);

    // Test 2: Network Information
    console.log("\n🌐 TEST 2: Network Information");
    console.log("-".repeat(40));

    const network = await provider.getNetwork();
    console.log(`✅ Network connected`);
    console.log(`   Name: ${network.name}`);
    console.log(`   Chain ID: ${network.chainId}`);

    // Test 3: Block Information
    console.log("\n📦 TEST 3: Block Information");
    console.log("-".repeat(40));

    const blockNumber = await provider.getBlockNumber();
    const latestBlock = await provider.getBlock("latest");

    console.log(`✅ Block data available`);
    console.log(`   Current block: ${blockNumber}`);
    console.log(`   Block hash: ${latestBlock.hash}`);
    console.log(`   Block timestamp: ${new Date(latestBlock.timestamp * 1000).toISOString()}`);
    console.log(`   Gas limit: ${latestBlock.gasLimit.toString()}`);
    console.log(`   Gas used: ${latestBlock.gasUsed.toString()}`);

    // Test 4: Account Information
    console.log("\n👤 TEST 4: Account Information");
    console.log("-".repeat(40));

    const deployerAddress = await deployer.getAddress();
    const balance = await provider.getBalance(deployerAddress);
    const transactionCount = await provider.getTransactionCount(deployerAddress);

    console.log(`✅ Account accessible`);
    console.log(`   Address: ${deployerAddress}`);
    console.log(`   Balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`   Nonce: ${transactionCount}`);

    // Test 5: Gas Price Information
    console.log("\n⛽ TEST 5: Gas Price Information");
    console.log("-".repeat(40));

    try {
      const feeData = await provider.getFeeData();
      console.log(`✅ Fee data available`);
      console.log(`   Gas price: ${ethers.formatUnits(feeData.gasPrice || 0n, "gwei")} gwei`);
      console.log(`   Max fee per gas: ${ethers.formatUnits(feeData.maxFeePerGas || 0n, "gwei")} gwei`);
      console.log(`   Max priority fee: ${ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, "gwei")} gwei`);
    } catch (error) {
      console.log(`⚠️  Fee data unavailable: ${error.message}`);
    }

    // Test 6: Transaction Pool Status
    console.log("\n🏊 TEST 6: Transaction Pool Status");
    console.log("-".repeat(40));

    try {
      const txPoolStatus = await provider.send("txpool_status", []);
      console.log(`✅ Transaction pool accessible`);
      console.log(`   Pending: ${parseInt(txPoolStatus.pending, 16)}`);
      console.log(`   Queued: ${parseInt(txPoolStatus.queued, 16)}`);
    } catch (error) {
      console.log(`⚠️  Transaction pool status unavailable: ${error.message}`);
    }

    // Test 7: Gas Estimation
    console.log("\n💨 TEST 7: Gas Estimation");
    console.log("-".repeat(40));

    try {
      const gasEstimate = await provider.estimateGas({
        to: ethers.ZeroAddress,
        value: 0,
        data: "0x"
      });
      console.log(`✅ Gas estimation working`);
      console.log(`   Simple transfer gas: ${gasEstimate.toString()}`);
    } catch (error) {
      console.log(`❌ Gas estimation failed: ${error.message}`);

      if (error.message.includes("insufficient funds")) {
        console.log(`   💡 This is normal - account needs ETH for gas`);
      }
    }

    // Test 8: Contract Compilation
    console.log("\n🔨 TEST 8: Contract Compilation");
    console.log("-".repeat(40));

    try {
      const RoleControl = await ethers.getContractFactory("RoleControl");
      console.log(`✅ RoleControl compiled successfully`);
      console.log(`   Bytecode length: ${RoleControl.bytecode.length} bytes`);

      const DidRegistry = await ethers.getContractFactory("DidRegistry");
      console.log(`✅ DidRegistry compiled successfully`);
      console.log(`   Bytecode length: ${DidRegistry.bytecode.length} bytes`);

      const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");
      console.log(`✅ CredentialRegistry compiled successfully`);
      console.log(`   Bytecode length: ${CredentialRegistry.bytecode.length} bytes`);
    } catch (error) {
      console.log(`❌ Contract compilation failed: ${error.message}`);
      return;
    }

    // Test 9: Simple Transaction Test
    console.log("\n📝 TEST 9: Simple Transaction Test");
    console.log("-".repeat(40));

    try {
      // Test with a simple value transfer to ourselves (should fail with insufficient funds or succeed)
      const txRequest = {
        to: deployerAddress,
        value: ethers.parseEther("0.001"),
        gasLimit: 21000,
        gasPrice: ethers.parseUnits("1", "gwei")
      };

      const estimatedGas = await provider.estimateGas(txRequest);
      console.log(`✅ Transaction estimation successful`);
      console.log(`   Estimated gas: ${estimatedGas.toString()}`);

      // Calculate cost
      const txCost = estimatedGas * txRequest.gasPrice;
      console.log(`   Transaction cost: ${ethers.formatEther(txCost)} ETH`);

      if (balance >= txCost) {
        console.log(`✅ Account has sufficient balance for transactions`);
      } else {
        console.log(`❌ Insufficient balance for transactions`);
        console.log(`   Required: ${ethers.formatEther(txCost)} ETH`);
        console.log(`   Available: ${ethers.formatEther(balance)} ETH`);
      }

    } catch (error) {
      console.log(`❌ Transaction test failed: ${error.message}`);
    }

    // Test 10: Contract Deployment Gas Estimation
    console.log("\n🚀 TEST 10: Contract Deployment Gas Estimation");
    console.log("-".repeat(40));

    try {
      const RoleControl = await ethers.getContractFactory("RoleControl");

      // Estimate deployment gas
      const deploymentData = RoleControl.getDeployTransaction();
      const deploymentGas = await provider.estimateGas({
        data: deploymentData.data,
        value: 0
      });

      console.log(`✅ Deployment gas estimation successful`);
      console.log(`   Estimated deployment gas: ${deploymentGas.toString()}`);

      // Calculate deployment cost
      const deploymentCost = deploymentGas * ethers.parseUnits("2", "gwei"); // Using 2 gwei for deployment
      console.log(`   Deployment cost (2 gwei): ${ethers.formatEther(deploymentCost)} ETH`);

      if (balance >= deploymentCost) {
        console.log(`✅ Account has sufficient balance for deployment`);
      } else {
        console.log(`❌ Insufficient balance for contract deployment`);
        console.log(`   Required: ${ethers.formatEther(deploymentCost)} ETH`);
        console.log(`   Available: ${ethers.formatEther(balance)} ETH`);
      }

    } catch (error) {
      console.log(`❌ Deployment estimation failed: ${error.message}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎯 DIAGNOSTIC SUMMARY");
    console.log("=".repeat(60));

    if (balance < ethers.parseEther("0.1")) {
      console.log("❌ ISSUE: Insufficient account balance");
      console.log("   💡 Solution: Fund the deployer account with more ETH");
    } else if (blockNumber < 3) {
      console.log("❌ ISSUE: Network not fully initialized");
      console.log("   💡 Solution: Wait for more blocks to be mined");
    } else {
      console.log("✅ Network appears ready for contract deployment");
      console.log("   💡 If deployment still fails, check detailed error messages");
    }

  } catch (error) {
    console.error("❌ DIAGNOSTIC FAILED:", error.message);
    console.error("Stack trace:", error.stack);
  }
}

// Execute diagnostics
async function main() {
  await runDiagnostics();
}

main()
  .then(() => {
    console.log("\n✅ Diagnostics completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Diagnostics failed:", error);
    process.exit(1);
  });

module.exports = { runDiagnostics };
