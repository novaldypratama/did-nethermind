const { Web3 } = require('web3');
// const axios = require('axios');

async function main() {
  try {
    // Try to connect to the node
    const web3 = new Web3('http://localhost:8545');

    // Check if node is synced
    const syncing = await web3.eth.isSyncing();
    if (syncing !== false) {
      console.error('Node is still syncing');
      process.exit(1);
    }

    // Check block height
    const blockNumber = await web3.eth.getBlockNumber();
    console.log(`Current block number: ${blockNumber}`);

    console.log('Nethermind node is ready for benchmarking!');
    process.exit(0);
  } catch (error) {
    console.error('Error checking Nethermind node:', error.message);
    process.exit(1);
  }
}

main();
