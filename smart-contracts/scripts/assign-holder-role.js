// assign-holder-role.js - Script to assign Holder role to an ETH address

async function main() {
  try {
    console.log("Starting HOLDER role assignment process...");

    // Get signers (deployer has the TRUSTEE role by default)
    const [deployer] = await ethers.getSigners();
    console.log("Using admin account:", deployer.address);

    // Display account balance
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log("Admin balance:", ethers.formatEther(balance), "ETH");

    // The address to which we want to assign the HOLDER role
    // Replace this with the actual address you want to assign the role to
    const newHolderAddress = "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf";
    console.log("Assigning HOLDER role to:", newHolderAddress);

    // Load the deployed RoleControl contract
    // Replace this with your actual deployed contract address
    const roleControlAddress = "0xBca0fDc68d9b21b5bfB16D784389807017B2bbbc";
    console.log("RoleControl contract address:", roleControlAddress);

    // Get the contract instance
    const RoleControl = await ethers.getContractFactory("RoleControl");
    const roleControl = RoleControl.attach(roleControlAddress);

    // First check if the address already has any role
    const currentRole = await roleControl.getRole(newHolderAddress);
    console.log("\nCurrent role:", currentRole.toString());

    if (currentRole.toString() === "2") {
      console.log("Address already has HOLDER role (2). No action needed.");
      return;
    }

    // Set transaction options
    const txOptions = {
      gasLimit: 110000,
      gasPrice: ethers.parseUnits("1", "gwei")
    };

    // Assign HOLDER role (role = 2 as per the enum ROLES in the contract)
    console.log("\nAssigning HOLDER role...");
    const roleEnum = 2; // HOLDER role has index 2 in ROLES enum
    const tx = await roleControl.assignRole(roleEnum, newHolderAddress, txOptions);

    // Wait for the transaction to be mined
    console.log("Transaction hash:", tx.hash);
    console.log("Waiting for transaction confirmation...");
    const receipt = await tx.wait();
    console.log("Transaction confirmed in block:", receipt.blockNumber);

    // Verify the role was assigned correctly
    const assignedRole = await roleControl.getRole(newHolderAddress);
    const hasRole = await roleControl.hasRole(roleEnum, newHolderAddress);

    console.log("\n----- ROLE ASSIGNMENT RESULTS -----");
    console.log("Address:", newHolderAddress);
    console.log("Assigned Role (enum value):", assignedRole.toString());
    console.log("Has HOLDER role:", hasRole);
    console.log("----------------------------------");

    // Get current holder count
    const holderCount = await roleControl.getRoleCount(roleEnum);
    console.log("Total HOLDER count:", holderCount.toString());
    console.log("----------------------------------");

    if (hasRole) {
      console.log("✅ HOLDER role successfully assigned!");
    } else {
      console.log("❌ Role assignment failed!");
    }

    // Test if the address passes the isHolder check
    try {
      await roleControl.isHolder(newHolderAddress);
      console.log("✅ Address passes isHolder() verification");
    } catch (error) {
      console.error("❌ Address fails isHolder() verification:", error.message);
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