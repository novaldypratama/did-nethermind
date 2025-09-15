// assign-issuer-role.js - Script to assign Issuer role to an address

async function main() {
  try {
    console.log("Starting ISSUER role assignment process...");

    // Get signers (deployer has the TRUSTEE role by default)
    const [deployer] = await ethers.getSigners();
    console.log("Using admin account:", deployer.address);

    // Display account balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Admin balance:", ethers.formatEther(balance), "ETH");

    // The address to which we want to assign the ISSUER role
    // Replace this with the actual address you want to assign the role to
    const newIssuerAddress = "0x2b5ad5c4795c026514f8317c7a215e218dccd6cf";
    console.log("Assigning ISSUER role to:", newIssuerAddress);

    // Load the deployed RoleControl contract
    // Replace this with your actual deployed contract address
    const roleControlAddress = "0xBca0fDc68d9b21b5bfB16D784389807017B2bbbc";
    console.log("RoleControl contract address:", roleControlAddress);

    // Get the contract instance
    const RoleControl = await ethers.getContractFactory("RoleControl");
    const roleControl = RoleControl.attach(roleControlAddress);

    // First check if the address already has any role
    const currentRole = await roleControl.getRole(newIssuerAddress);
    console.log("\nCurrent role:", currentRole.toString());

    if (currentRole.toString() === "1") {
      console.log("Address already has ISSUER role (1). No action needed.");
      return;
    }

    // Set transaction options
    const txOptions = {
      gasLimit: 110000,
      gasPrice: ethers.parseUnits("1", "gwei")
    };

    // Assign ISSUER role (role = 1 as per the enum ROLES in the contract)
    console.log("\nAssigning ISSUER role...");
    const roleEnum = 1; // ISSUER role has index 1 in ROLES enum
    const tx = await roleControl.assignRole(roleEnum, newIssuerAddress, txOptions);

    // Wait for the transaction to be mined
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was assigned correctly
    const assignedRole = await roleControl.getRole(newIssuerAddress);
    const hasRole = await roleControl.hasRole(roleEnum, newIssuerAddress);

    console.log("\n----- ROLE ASSIGNMENT RESULTS -----");
    console.log("Address:", newIssuerAddress);
    console.log("Assigned Role (enum value):", assignedRole.toString());
    console.log("Has ISSUER role:", hasRole);
    console.log("----------------------------------");

    // Get current issuer count
    const issuerCount = await roleControl.getRoleCount(roleEnum);
    console.log("Total ISSUER count:", issuerCount.toString());
    console.log("----------------------------------");

    if (hasRole) {
      console.log("✅ ISSUER role successfully assigned!");
    } else {
      console.log("❌ Role assignment failed!");
    }

    // Test if the address passes the isIssuer check
    try {
      await roleControl.isIssuer(newIssuerAddress);
      console.log("✅ Address passes isIssuer() verification");
    } catch (error) {
      console.error("❌ Address fails isIssuer() verification:", error.message);
    }

  } catch (error) {
    console.error("Error during role assignment:", error);
    process.exit(1);
  }
}

// Execute the script
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
