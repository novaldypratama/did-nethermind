// deploy.js - Optimized deployment script for SSI/DID contracts

// Helper function to estimate gas with headroom
async function estimateWithHeadroom(contractFactory, constructorArgs = [], headroom = 1.3) {
  try {
    // Use the contract factory's estimateGas method which properly handles deployment
    const deployTransaction = await contractFactory.getDeployTransaction(...constructorArgs);
    const est = await contractFactory.runner.provider.estimateGas(deployTransaction);
    return (est * BigInt(Math.ceil(headroom * 10))) / 10n; // ~×1.3
  } catch (error) {
    console.warn(`   Gas estimation failed, using fallback: ${error.message}`);
    // Fallback to a reasonable default with headroom
    return BigInt(6500000); // 6.5M gas as fallback
  }
}

async function main() {
  console.log("Starting SSI/DID Trust Triangle deployment...");

  // Get the deployer's signer
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Log deployer balance
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer balance:", ethers.formatEther(balance), "ETH");

  // Define base deployment parameters
  const baseDeploymentOptions = {
    gasPrice: ethers.parseUnits("1", "gwei")  // Higher gas price for faster mining
  };

  // Set a reasonable timeout for deployments
  const DEPLOYMENT_TIMEOUT = 60000; // 60 seconds

  // Gas tracking variables
  let totalGasUsed = 0n;
  let totalGasCost = 0n;
  const gasReport = [];

  try {
    // 1. Deploy RoleControl contract first (no dependencies)
    console.log("\n1. Deploying RoleControl...");
    const RoleControl = await ethers.getContractFactory("RoleControl");

    // Estimate gas for RoleControl deployment
    console.log("   Estimating gas for deployment...");
    const roleControlEstimatedGas = await estimateWithHeadroom(RoleControl, []);
    
    const roleControlDeploymentOptions = {
      ...baseDeploymentOptions,
      gasLimit: roleControlEstimatedGas
    };
    
    console.log(`   Estimated gas: ${roleControlEstimatedGas.toLocaleString()} (with 30% headroom)`);
    console.log("   Sending deployment transaction...");
    const roleControl = await RoleControl.deploy(roleControlDeploymentOptions);

    console.log("   Waiting for deployment confirmation...");
    try {
      await Promise.race([
        roleControl.waitForDeployment(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("RoleControl deployment timeout")), DEPLOYMENT_TIMEOUT)
        )
      ]);

      const roleControlAddress = await roleControl.getAddress();
      console.log("✅ RoleControl deployed at:", roleControlAddress);
      console.log("   Deployer assigned TRUSTEE role by default");

      // Calculate gas usage for RoleControl
      const roleControlReceipt = await ethers.provider.getTransactionReceipt(roleControl.deploymentTransaction().hash);
      const roleControlGasUsed = roleControlReceipt.gasUsed;
      const roleControlGasCost = roleControlGasUsed * baseDeploymentOptions.gasPrice;
      
      totalGasUsed += roleControlGasUsed;
      totalGasCost += roleControlGasCost;
      
      gasReport.push({
        contract: "RoleControl",
        gasUsed: roleControlGasUsed.toString(),
        gasEstimated: roleControlEstimatedGas.toString(),
        gasPrice: ethers.formatUnits(baseDeploymentOptions.gasPrice, "gwei") + " gwei",
        gasCost: ethers.formatEther(roleControlGasCost) + " ETH",
        address: roleControlAddress
      });

      console.log("   Gas used:", roleControlGasUsed.toLocaleString());
      console.log("   Gas cost:", ethers.formatEther(roleControlGasCost), "ETH");
    } catch (error) {
      console.error("❌ RoleControl deployment failed:", error.message);
      process.exit(1);
    }

    // 2. Deploy DidRegistry (depends on RoleControl)
    console.log("\n2. Deploying DidRegistry...");
    const DidRegistry = await ethers.getContractFactory("DidRegistry");

    const roleControlAddress = await roleControl.getAddress();
    console.log("   Using RoleControl at:", roleControlAddress);
    
    // Estimate gas for DidRegistry deployment
    console.log("   Estimating gas for deployment...");
    const didRegistryEstimatedGas = await estimateWithHeadroom(DidRegistry, [roleControlAddress]);
    
    const didRegistryDeploymentOptions = {
      ...baseDeploymentOptions,
      gasLimit: didRegistryEstimatedGas
    };
    
    console.log(`   Estimated gas: ${didRegistryEstimatedGas.toLocaleString()} (with 30% headroom)`);
    console.log("   Sending deployment transaction...");

    const didRegistry = await DidRegistry.deploy(
      roleControlAddress,
      didRegistryDeploymentOptions
    );

    console.log("   Waiting for deployment confirmation...");
    try {
      await Promise.race([
        didRegistry.waitForDeployment(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("DidRegistry deployment timeout")), DEPLOYMENT_TIMEOUT)
        )
      ]);

      const didRegistryAddress = await didRegistry.getAddress();
      console.log("✅ DidRegistry deployed at:", didRegistryAddress);

      // Calculate gas usage for DidRegistry
      const didRegistryReceipt = await ethers.provider.getTransactionReceipt(didRegistry.deploymentTransaction().hash);
      const didRegistryGasUsed = didRegistryReceipt.gasUsed;
      const didRegistryGasCost = didRegistryGasUsed * baseDeploymentOptions.gasPrice;
      
      totalGasUsed += didRegistryGasUsed;
      totalGasCost += didRegistryGasCost;
      
      gasReport.push({
        contract: "DidRegistry",
        gasUsed: didRegistryGasUsed.toString(),
        gasEstimated: didRegistryEstimatedGas.toString(),
        gasPrice: ethers.formatUnits(baseDeploymentOptions.gasPrice, "gwei") + " gwei",
        gasCost: ethers.formatEther(didRegistryGasCost) + " ETH",
        address: didRegistryAddress
      });

      console.log("   Gas used:", didRegistryGasUsed.toLocaleString());
      console.log("   Gas cost:", ethers.formatEther(didRegistryGasCost), "ETH");
    } catch (error) {
      console.error("❌ DidRegistry deployment failed:", error.message);
      process.exit(1);
    }

    // 3. Deploy CredentialRegistry (depends on both RoleControl and DidRegistry)
    console.log("\n3. Deploying CredentialRegistry...");
    const CredentialRegistry = await ethers.getContractFactory("CredentialRegistry");

    const didRegistryAddress = await didRegistry.getAddress();
    console.log("   Using RoleControl at:", roleControlAddress);
    console.log("   Using DidRegistry at:", didRegistryAddress);
    
    // Estimate gas for CredentialRegistry deployment
    console.log("   Estimating gas for deployment...");
    const credentialRegistryEstimatedGas = await estimateWithHeadroom(
      CredentialRegistry, 
      [roleControlAddress, didRegistryAddress]
    );
    
    const credentialRegistryDeploymentOptions = {
      ...baseDeploymentOptions,
      gasLimit: credentialRegistryEstimatedGas
    };
    
    console.log(`   Estimated gas: ${credentialRegistryEstimatedGas.toLocaleString()} (with 30% headroom)`);
    console.log("   Sending deployment transaction...");

    const credentialRegistry = await CredentialRegistry.deploy(
      roleControlAddress,
      didRegistryAddress,
      credentialRegistryDeploymentOptions
    );

    console.log("   Waiting for deployment confirmation...");
    try {
      await Promise.race([
        credentialRegistry.waitForDeployment(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("CredentialRegistry deployment timeout")), DEPLOYMENT_TIMEOUT)
        )
      ]);

      const credentialRegistryAddress = await credentialRegistry.getAddress();
      console.log("✅ CredentialRegistry deployed at:", credentialRegistryAddress);

      // Calculate gas usage for CredentialRegistry
      const credentialRegistryReceipt = await ethers.provider.getTransactionReceipt(credentialRegistry.deploymentTransaction().hash);
      const credentialRegistryGasUsed = credentialRegistryReceipt.gasUsed;
      const credentialRegistryGasCost = credentialRegistryGasUsed * baseDeploymentOptions.gasPrice;
      
      totalGasUsed += credentialRegistryGasUsed;
      totalGasCost += credentialRegistryGasCost;
      
      gasReport.push({
        contract: "CredentialRegistry",
        gasUsed: credentialRegistryGasUsed.toString(),
        gasEstimated: credentialRegistryEstimatedGas.toString(),
        gasPrice: ethers.formatUnits(baseDeploymentOptions.gasPrice, "gwei") + " gwei",
        gasCost: ethers.formatEther(credentialRegistryGasCost) + " ETH",
        address: credentialRegistryAddress
      });

      console.log("   Gas used:", credentialRegistryGasUsed.toLocaleString());
      console.log("   Gas cost:", ethers.formatEther(credentialRegistryGasCost), "ETH");
    } catch (error) {
      console.error("❌ CredentialRegistry deployment failed:", error.message);
      process.exit(1);
    }

    // Log deployment summary
    console.log("\n----- DEPLOYMENT SUMMARY -----");
    console.log("RoleControl:        ", await roleControl.getAddress());
    console.log("DidRegistry:        ", await didRegistry.getAddress());
    console.log("CredentialRegistry: ", await credentialRegistry.getAddress());
    console.log("-----------------------------");

    // Log comprehensive gas usage report
    console.log("\n----- GAS USAGE REPORT -----");
    gasReport.forEach(report => {
      const gasUsed = BigInt(report.gasUsed);
      const gasEstimated = BigInt(report.gasEstimated);
      const efficiency = (Number(gasUsed * 100n) / Number(gasEstimated)).toFixed(2);
      
      console.log(`${report.contract}:`);
      console.log(`  Address:       ${report.address}`);
      console.log(`  Gas Estimated: ${gasEstimated.toLocaleString()} (with 30% headroom)`);
      console.log(`  Gas Used:      ${gasUsed.toLocaleString()}`);
      console.log(`  Efficiency:    ${efficiency}% of estimated`);
      console.log(`  Gas Price:     ${report.gasPrice}`);
      console.log(`  Gas Cost:      ${report.gasCost}`);
      console.log("");
    });
    
    console.log("TOTAL DEPLOYMENT COSTS:");
    console.log(`  Total Gas Used:  ${totalGasUsed.toLocaleString()}`);
    console.log(`  Total Gas Cost:  ${ethers.formatEther(totalGasCost)} ETH`);
    console.log(`  Gas Price Used:  ${ethers.formatUnits(baseDeploymentOptions.gasPrice, "gwei")} gwei`);
    
    // Calculate USD cost (example with ETH price - could be made dynamic)
    const ethPriceUSD = 3500; // This could be fetched from an API
    const totalCostUSD = parseFloat(ethers.formatEther(totalGasCost)) * ethPriceUSD;
    console.log(`  Estimated Cost:  $${totalCostUSD.toFixed(4)} USD (at $${ethPriceUSD}/ETH)`);
    console.log("-----------------------------");

    // Save deployment addresses to file for future reference
    const fs = require("fs");
    const deploymentInfo = {
      contracts: {
        roleControl: await roleControl.getAddress(),
        didRegistry: await didRegistry.getAddress(),
        credentialRegistry: await credentialRegistry.getAddress()
      },
      gasUsage: {
        totalGasUsed: totalGasUsed.toString(),
        totalGasCost: ethers.formatEther(totalGasCost),
        gasPrice: ethers.formatUnits(baseDeploymentOptions.gasPrice, "gwei"),
        estimatedCostUSD: totalCostUSD.toFixed(4),
        contractBreakdown: gasReport
      },
      network: network.name,
      timestamp: new Date().toISOString()
    };

    fs.writeFileSync(
      "deployment-info.json",
      JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("Deployment information saved to deployment-info.json");

    return deploymentInfo;

  } catch (error) {
    console.error("Deployment failed:", error);
    process.exit(1);
  }
}

// Execute the deployment
main()
  .then((deployedContracts) => {
    console.log("Deployment completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Deployment error:", error);
    process.exit(1);
  });
