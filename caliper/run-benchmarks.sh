#!/bin/bash

# Extract contract ABIs
echo "Extracting contract ABIs..."
# You may need to adjust these paths based on your setup
cp ../smart-contracts/artifacts/contracts/auth/RoleControl.sol/RoleControl.json benchmarks/contracts/
cp ../smart-contracts/artifacts/contracts/did/DidRegistry.sol/DidRegistry.json benchmarks/contracts/
cp ../smart-contracts/artifacts/contracts/vc/CredentialRegistry.sol/CredentialRegistry.json benchmarks/contracts/

# Check if Nethermind is ready
echo "Checking if Nethermind node is ready..."
node check-nethermind.js
if [ $? -ne 0 ]; then
  echo "Nethermind node is not ready. Please make sure it's running and synced."
  exit 1
fi

# Bind Caliper to Ethereum
echo "Binding Caliper to Nethermind..."
# Use the correct binding syntax with version
caliper bind --caliper-bind-sut ethereum:latest --caliper-bind-cwd ./ --caliper-bind-args="-g"

# Run the benchmarks with CLIQUE-specific settings
echo "Running benchmarks optimized for CLIQUE consensus..."
caliper launch manager \
  --caliper-workspace ./ \
  --caliper-benchconfig benchmarks/config.yaml \
  --caliper-networkconfig networks/ethereum/nethermind-network.json \
  --caliper-flow-only-test \
  --caliper-report-name "ssi-nethermind-clique-benchmark-$(date +%Y%m%d-%H%M%S)" \
  --caliper-worker-remote=false

echo "Benchmarking complete! Check the report HTML file for results."
