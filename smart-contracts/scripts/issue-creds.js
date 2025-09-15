const Web3 = require('web3');
const axios = require('axios');
const FormData = require('form-data');
const { v4: uuidv4 } = require('uuid');

// Import ABIs
const CredentialRegistryABI = require('../artifacts/contracts/vc/CredentialRegistry.json').abi;

// Configure Web3 connection (replace with your node URL)
const web3 = new Web3('http://localhost:21001');

// Contract address (replace with your deployed contract address)
const CREDENTIAL_REGISTRY_ADDRESS = '0x9d13C6D3aFE1721BEef56B55D303B09E021E27ab'; // Example address

// Initialize contract
const credentialRegistry = new web3.eth.Contract(
  CredentialRegistryABI,
  CREDENTIAL_REGISTRY_ADDRESS
);

// IPFS configuration - using Infura as the primary gateway with fallbacks
// Replace with your own API key if using Infura
const IPFS_CONFIG = {
  uploadEndpoint: 'https://ipfs.infura.io:5001/api/v0/add',
  apiKey: process.env.INFURA_IPFS_API_KEY || '', // Set via environment variable
  projectId: process.env.INFURA_IPFS_PROJECT_ID || '', // Set via environment variable
  // Public IPFS gateway URLs for fetching content (fallbacks)
  publicGateways: [
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://dweb.link/ipfs/'
  ]
};

/**
 * Simple canonicalization function for JSON objects
 * @param {*} obj - The object to canonicalize
 * @returns {string} - The canonicalized JSON string
 */
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

/**
 * Creates a DID hash from an Ethereum address
 * @param {string} ethAddress - Ethereum address
 * @returns {string} - keccak256 hash of "did:ethr:{address}"
 */
function createDidHash(ethAddress) {
  return web3.utils.soliditySha3(
    { t: 'string', v: 'did:ethr:' },
    { t: 'address', v: ethAddress }
  );
}

/**
 * Generates a W3C VC Data Model v2.0 compliant JSON-LD object
 * @param {string} issuerAddress - Ethereum address of the issuer
 * @param {string} holderAddress - Ethereum address of the holder
 * @returns {object} - JSON-LD VC object
 */
function generateVCPayload(issuerAddress, holderAddress) {
  const issuanceDate = new Date().toISOString();

  return {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://www.w3.org/ns/credentials/examples/v2"
    ],
    "id": `urn:uuid:${uuidv4()}`,
    "type": ["VerifiableCredential", "IdentityCredential"],
    "issuer": {
      "id": `did:ethr:${issuerAddress}`,
      "name": "Example Issuer Organization"
    },
    "validFrom": issuanceDate,
    "credentialSubject": {
      "id": `did:ethr:${holderAddress}`,
      "type": "Person",
      "name": "Example Subject",
      "attributes": {
        "firstName": "John",
        "lastName": "Doe",
        "dateOfBirth": "1990-01-01",
        "nationality": "US"
      }
    },
    // Static data for consistent size
    "evidence": {
      "type": "DocumentVerification",
      "verificationMethod": "Automated",
      "verificationDate": issuanceDate,
      "staticData": "X".repeat(500) // Static block for consistent size
    }
  };
}

/**
 * Canonicalizes and hashes a JSON-LD credential using simple canonicalization
 * @param {object} jsonldObj - JSON-LD object to hash
 * @returns {string} - keccak256 hash of the canonicalized JSON
 */
function hashCredential(jsonldObj) {
  // Canonicalize the JSON-LD using our simple function
  const canonicalizedJson = simpleCanonicalizeJSON(jsonldObj);

  if (!canonicalizedJson) {
    throw new Error("Failed to canonicalize JSON-LD object");
  }

  // Hash the canonicalized JSON with keccak256
  return web3.utils.soliditySha3(canonicalizedJson);
}

/**
 * Uploads a JSON-LD object to IPFS using public gateway
 * @param {object} jsonldObj - JSON-LD object to upload
 * @returns {Promise<string>} - IPFS CID
 */
async function uploadToIPFS(jsonldObj) {
  try {
    const jsonString = JSON.stringify(jsonldObj, null, 2);
    const buffer = Buffer.from(jsonString);

    console.log(`Preparing to upload to IPFS, content size: ${buffer.length} bytes`);

    // Create form data for the IPFS API request
    const formData = new FormData();
    formData.append('file', buffer, {
      filename: 'credential.json',
      contentType: 'application/json',
    });

    // Set authentication if using Infura
    const headers = {};
    if (IPFS_CONFIG.apiKey && IPFS_CONFIG.projectId) {
      const auth = 'Basic ' + Buffer.from(IPFS_CONFIG.projectId + ':' + IPFS_CONFIG.apiKey).toString('base64');
      headers['Authorization'] = auth;
    }

    // Upload to IPFS via Infura or other service
    const response = await axios.post(IPFS_CONFIG.uploadEndpoint, formData, {
      headers: {
        ...formData.getHeaders(),
        ...headers
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    if (!response.data || !response.data.Hash) {
      throw new Error("Invalid response from IPFS gateway");
    }

    const cid = response.data.Hash;
    console.log(`IPFS upload successful, CID: ${cid}`);

    // Verify the content is accessible via public gateway
    await verifyIpfsContent(cid, jsonString);

    return cid;
  } catch (error) {
    console.error("IPFS upload error:", error.message);

    // Fallback to Pinata or other service if Infura fails
    // This would require additional code and API keys for these services

    throw new Error(`Failed to upload to IPFS: ${error.message}`);
  }
}

/**
 * Verifies that content is accessible on IPFS by trying to fetch it
 * @param {string} cid - The IPFS content identifier
 * @param {string} expectedContent - The expected content for verification
 */
async function verifyIpfsContent(cid, expectedContent) {
  // Try different gateways until one works
  for (const gateway of IPFS_CONFIG.publicGateways) {
    try {
      const url = `${gateway}${cid}`;
      console.log(`Verifying content availability at: ${url}`);

      const response = await axios.get(url, { timeout: 10000 });
      if (response.status === 200) {
        console.log(`Content verified available on IPFS via ${gateway}`);
        return true;
      }
    } catch (error) {
      console.warn(`Gateway ${gateway} failed, trying next...`);
    }
  }

  console.warn("Content uploaded but not immediately verifiable on public gateways. This is normal, as propagation may take time.");
  return false;
}

/**
 * Issues a credential to the CredentialRegistry contract
 * @param {string} issuerAccount - Ethereum address of the issuer
 * @param {string} holderAddress - Ethereum address of the holder
 * @returns {Promise<object>} - Transaction receipt
 */
async function issueCredential(issuerAccount, holderAddress) {
  console.log(`Issuing credential from ${issuerAccount} to ${holderAddress}`);

  // Generate the VC payload
  const vcPayload = generateVCPayload(issuerAccount, holderAddress);
  console.log("Generated VC payload:", JSON.stringify(vcPayload, null, 2));

  // Hash the credential
  const credentialId = hashCredential(vcPayload);
  console.log("Credential Hash (credentialId):", credentialId);

  // Upload to IPFS and get CID
  console.log("Uploading to IPFS...");
  const credentialCid = await uploadToIPFS(simpleCanonicalizeJSON(vcPayload));
  console.log("Credential CID:", credentialCid);

  // Create DID hashes
  const issuerDid = createDidHash(issuerAccount);
  const holderDid = createDidHash(holderAddress);

  console.log("Issuer DID Hash:", issuerDid);
  console.log("Holder DID Hash:", holderDid);

  // Check if the DIDs are valid
  if (issuerDid === holderDid) {
    throw new Error("Issuer and holder cannot be the same address");
  }

  // Estimate gas for the transaction
  const gasEstimate = await credentialRegistry.methods.issueCredential(
    holderAddress,
    credentialId,
    issuerDid,
    holderDid,
    credentialCid
  ).estimateGas({ from: issuerAccount });

  console.log("Gas estimate:", gasEstimate);

  // Send the transaction
  return credentialRegistry.methods.issueCredential(
    holderAddress,
    credentialId,
    issuerDid,
    holderDid,
    credentialCid
  ).send({
    from: issuerAccount,
    gas: Math.floor(gasEstimate * 1.2) // Add 20% buffer to gas estimate
  });
}

/**
 * Verifies if a credential exists and is valid
 * @param {string} credentialId - Credential hash to verify
 * @returns {Promise<object>} - Credential data if valid
 */
async function verifyCredential(credentialId) {
  try {
    const result = await credentialRegistry.methods.resolveCredential(credentialId).call();
    console.log("Credential verification result:", result);
    return result;
  } catch (error) {
    console.error("Credential verification failed:", error.message);
    throw new Error(`Invalid or revoked credential: ${error.message}`);
  }
}

/**
 * Retrieves the full credential data from IPFS
 * @param {string} cid - IPFS content identifier
 * @returns {Promise<object>} - The full credential data
 */
async function getCredentialFromIPFS(cid) {
  // Try different gateways
  for (const gateway of IPFS_CONFIG.publicGateways) {
    try {
      const url = `${gateway}${cid}`;
      console.log(`Attempting to fetch credential from: ${url}`);

      const response = await axios.get(url, { timeout: 10000 });
      if (response.status === 200 && response.data) {
        console.log(`Successfully retrieved credential from ${gateway}`);
        return response.data;
      }
    } catch (error) {
      console.warn(`Failed to fetch from ${gateway}, trying next...`);
    }
  }

  throw new Error("Could not retrieve credential from any IPFS gateway");
}

/**
 * Main function demonstrating credential issuance
 */
async function main() {
  try {
    const accounts = await web3.eth.getAccounts();
    const issuerAccount = accounts[0];
    const holderAccount = accounts[1];

    console.log("Issuer account:", issuerAccount);
    console.log("Holder account:", holderAccount);

    // Issue the credential
    const result = await issueCredential(issuerAccount, holderAccount);
    console.log("Transaction hash:", result.transactionHash);
    console.log("Credential issued successfully!");

    // Get credential ID from logs
    const events = await credentialRegistry.getPastEvents('CredentialIssued', {
      fromBlock: result.blockNumber,
      toBlock: result.blockNumber
    });

    if (events.length > 0) {
      const credentialId = events[0].returnValues.credentialId;
      const credentialCid = events[0].returnValues.credentialCid;
      console.log("Credential ID from event:", credentialId);
      console.log("Credential CID from event:", credentialCid);

      // Verify the credential on-chain
      const credentialData = await verifyCredential(credentialId);
      console.log("Credential is valid and active");
      console.log("Issuance date:", new Date(parseInt(credentialData.metadata.issuanceDate) * 1000));

      // Retrieve the full credential from IPFS
      console.log("Retrieving full credential data from IPFS...");
      const fullCredential = await getCredentialFromIPFS(credentialCid);
      console.log("Full credential:", JSON.stringify(fullCredential, null, 2));
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Execute the main function
main().catch(console.error);
