// create-dids.js - Create DIDs for Issuer and Holder

const { ethers } = require("hardhat");
const fs = require('fs');
const axios = require('axios'); // You might need to install this: npm install axios

// Web3Signer proxy URL
const WEB3SIGNER_URL = "http://127.0.0.1:18545";

// Simple canonicalization function
function simpleCanonicalizeJSON(obj) {
  // For arrays, recursively canonicalize each element and join
  if (Array.isArray(obj)) {
    return '[' + obj.map(simpleCanonicalizeJSON).join(',') + ']';
  }

  // For objects, sort keys and recursively canonicalize values
  if (obj && typeof obj === 'object') {
    return '{' + Object.keys(obj).sort().map(key => {
      return JSON.stringify(key) + ':' + simpleCanonicalizeJSON(obj[key]);
    }).join(',') + '}';
  }

  // For primitives, use standard JSON serialization
  return JSON.stringify(obj);
}

async function createDidDocument(address) {
  // Create a W3C compliant DID document with the dynamic address
  const didId = `did:ethr:${address}`;

  // Create a sample DID document following W3C DID Core v1.0
  const didDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "id": didId,
    "verificationMethod": [
      {
        "id": `${didId}#keys-1`,
        "type": "Ed25519VerificationKey2020",
        "controller": didId,
        "publicKeyMultibase": "z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH"
      }
    ],
    "authentication": [
      `${didId}#keys-1`
    ],
    "service": [
      {
        "id": `${didId}#endpoint-1`,
        "type": "DIDCommMessaging",
        "serviceEndpoint": "https://example.com/endpoint/8377464"
      }
    ]
  };

  return didDocument;
}

async function canonicalizeAndHash(document) {
  // Canonicalize the JSON-LD document using JCS
  const canonicalizedDoc = simpleCanonicalizeJSON(document);

  // Hash the canonicalized document with keccak256
  const docHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalizedDoc));

  return { canonicalizedDoc, docHash };
}

// Get available accounts from Web3Signer
async function getWeb3SignerAccounts() {
  try {
    console.log("Fetching accounts from Web3Signer...");

    const response = await axios({
      method: 'post',
      url: WEB3SIGNER_URL,
      headers: {
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_accounts",
        params: [],
        id: Math.floor(Math.random() * 10000)
      })
    });

    if (response.data.error) {
      throw new Error(`JSON-RPC error: ${JSON.stringify(response.data.error)}`);
    }

    console.log("Successfully retrieved accounts from Web3Signer");
    return response.data.result;
  } catch (error) {
    console.error("Error fetching accounts from Web3Signer:", error.response?.data || error.message);
    throw error;
  }
}

async function main() {
  try {
    console.log("Starting DID creation for Issuer and Holder...");

    // Get available accounts from Web3Signer
    const accounts = await getWeb3SignerAccounts();
    console.log("Available accounts from Web3Signer:", accounts);

    // Select accounts for Issuer and Holder (adjust indexes as needed)
    const issuerAddress = accounts[1]; // Using account at index 1 as Issuer
    const holderAddress = accounts[2]; // Using account at index 2 as Holder

    console.log("Selected Issuer address:", issuerAddress);
    console.log("Selected Holder address:", holderAddress);

    // Load the deployed DidRegistry contract
    // Replace with your actual deployed contract address
    const didRegistryAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
    console.log("DidRegistry contract address:", didRegistryAddress);

    const DidRegistry = await ethers.getContractFactory("DidRegistry");

    // Connect the contract with each signer
    const issuerDidRegistry = DidRegistry.attach(didRegistryAddress).connect(issuerAddress);
    const holderDidRegistry = DidRegistry.attach(didRegistryAddress).connect(holderAddress);

    // Set optimal gas parameters
    const txOptions = {
      gasLimit: 300000,
      gasPrice: ethers.parseUnits("1", "gwei")
    };

    // ISSUER SECTION
    console.log("\n1. Creating DID for Issuer...");

    // Create Issuer DID document
    const issuerDidDoc = await createDidDocument(issuerAddress);
    console.log(JSON.stringify(issuerDidDoc, null, 2));

    // Hash the document
    const { canonicalizedDoc: issuerCanonical, docHash: issuerDocHash } =
      await canonicalizeAndHash(issuerDidDoc);

    console.log("\nCanonical form (first 100 chars):", issuerCanonical.substring(0, 100) + "...");
    console.log("Generated docHash:", issuerDocHash);

    // Save to file for reference
    fs.writeFileSync(
      `issuer-did-${issuerAddress.substring(0, 8)}.json`,
      JSON.stringify(issuerDidDoc, null, 2)
    );

    // Issuer creates their own DID
    console.log("\nIssuer creating DID on-chain with their own account...");
    const issuerTx = await issuerDidRegistry.createDid(
      issuerAddress, // Self-registration
      issuerDocHash,
      txOptions
    );

    console.log("Transaction hash:", issuerTx.hash);
    const issuerReceipt = await issuerTx.wait();
    console.log("Transaction confirmed in block:", issuerReceipt.blockNumber);
    console.log("Gas used:", issuerReceipt.gasUsed.toString());

    // Verify DID was created
    const issuerDidExists = await issuerDidRegistry.didExists(issuerAddress);
    console.log("Issuer DID exists:", issuerDidExists);

    // HOLDER SECTION
    console.log("\n2. Creating DID for Holder...");

    // Create Holder DID document
    const holderDidDoc = await createDidDocument(holderAddress);
    console.log(JSON.stringify(holderDidDoc, null, 2));

    // Hash the document
    const { canonicalizedDoc: holderCanonical, docHash: holderDocHash } =
      await canonicalizeAndHash(holderDidDoc);

    console.log("\nCanonical form (first 100 chars):", holderCanonical.substring(0, 100) + "...");
    console.log("Generated docHash:", holderDocHash);

    // Save to file for reference
    fs.writeFileSync(
      `holder-did-${holderAddress.substring(0, 8)}.json`,
      JSON.stringify(holderDidDoc, null, 2)
    );

    // Holder creates their own DID
    console.log("\nHolder creating DID on-chain with their own account...");
    const holderTx = await holderDidRegistry.createDid(
      holderAddress, // Self-registration
      holderDocHash,
      txOptions
    );

    console.log("Transaction hash:", holderTx.hash);
    const holderReceipt = await holderTx.wait();
    console.log("Transaction confirmed in block:", holderReceipt.blockNumber);
    console.log("Gas used:", holderReceipt.gasUsed.toString());

    // Verify DID was created
    const holderDidExists = await holderDidRegistry.didExists(holderAddress);
    console.log("Holder DID exists:", holderDidExists);

    // Resolve DIDs to verify they were stored correctly
    console.log("\n3. Resolving DIDs to verify storage...");

    const issuerDidRecord = await DidRegistry.resolveDid(issuerAddress);
    console.log("Issuer DID stored hash:", issuerDidRecord.docHash);
    console.log("Hash matches:", issuerDidRecord.docHash === issuerDocHash);

    const holderDidRecord = await DidRegistry.resolveDid(holderAddress);
    console.log("Holder DID stored hash:", holderDidRecord.docHash);
    console.log("Hash matches:", holderDidRecord.docHash === holderDocHash);

    console.log("\n✅ DID creation through Web3Signer completed successfully!");

  } catch (error) {
    console.error("Error during DID creation:", error);
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
