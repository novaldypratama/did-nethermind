// Node.js script to decrypt private key from keystore.json
const fs = require('fs');
const { Wallet } = require('ethers');

async function decryptKeystore() {
    try {
        const json = fs.readFileSync('keystore.json', 'utf8');
        const password = 'passdword'; // Enter the keystore password here
        
        // if (!password) {
        //     console.error('Error: Password is required to decrypt the keystore');
        //     process.exit(1);
        // }
        
        const wallet = await Wallet.fromEncryptedJson(json, password);
        console.log('Address:', wallet.address);
        console.log('Private Key:', wallet.privateKey);
        
    } catch (error) {
        console.error('Error decrypting keystore:', error.message);
        process.exit(1);
    }
}

decryptKeystore();