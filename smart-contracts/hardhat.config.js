require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.28",
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 1337,  // Fixed: chainId instead of chainID
      // gas: 6500000,
      gasPrice: 1000000000,
      // Replace 'YOUR_PRIVATE_KEY' with a valid private key string (without 0x) for local testing,
      // or use an environment variable, e.g. process.env.PRIVATE_KEY
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ["60bbe10a196a4e71451c0f6e9ec9beab454c2a5ac0542aa5b8b733ff5719fec3"]
      // accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : ["e6181caaffff94a09d7e332fc8da9884d99902c7874eb74354bdcadf411929f1"]
    }
  }
};
