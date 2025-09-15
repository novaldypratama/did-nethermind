# DID Nethermind - Decentralized Identity System

A Self-Sovereign Identity (SSI) blockchain system implementing W3C DID Core and Verifiable Credentials specifications on a private Nethermind Ethereum network.

## Overview

This system creates a decentralized trust triangle between **Trustees**, **Issuers**, and **Holders** for managing digital identities and verifiable credentials.

```text
    TRUSTEE (Admin)
         │
    ┌────▼─────┐
    │  System  │
    │Governance│
    └────┬─────┘
         │
    ISSUER ────────── HOLDER
   (Creates)        (Receives)
   Credentials      Credentials
```

## Quick Start

### 1. Start the Network

```bash
docker-compose up -d
```

### 2. Deploy Smart Contracts

```bash
cd smart-contracts
npx hardhat run scripts/deploy.js --network localhost
```

### 3. Run Benchmarks

```bash
cd caliper
./run-benchmarks.sh
```

## Architecture

### Core Components

- **`smart-contracts/`** - SSI smart contracts (DID Registry, Credential Registry, Role Control)
- **`network/`** - Nethermind validator node configurations
- **`private-networking/`** - Docker-compose setup for 4 validators + 1 RPC node
- **`caliper/`** - Performance benchmarking suite using Hyperledger Caliper

### Smart Contracts

1. **RoleControl** - Manages SSI roles (Trustee, Issuer, Holder)
2. **DidRegistry** - W3C DID Core compliant identity management
3. **CredentialRegistry** - Verifiable credentials storage and verification

### Network Setup

- **4 Validator Nodes** - Clique PoA consensus (ports 21001-21004)
- **1 RPC Node** - External transaction gateway (port 8545)
- **Private Network** - Custom genesis with pre-funded accounts

## Usage

### Create DIDs

```bash
cd smart-contracts
npx hardhat run scripts/create-dids.js --network localhost
```

### Issue Credentials

```bash
npx hardhat run scripts/issue-creds.js --network localhost
```

### Assign Roles

```bash
# Assign issuer role
npx hardhat run scripts/assign-issuer-role.js --network localhost

# Assign holder role
npx hardhat run scripts/assign-holder-role.js --network localhost
```

## Testing

### Smart Contract Tests

```bash
cd smart-contracts
npx hardhat test
```

### Automated Performance Benchmarks

```bash
cd caliper
source benchmark.config
./run-benchmarks-automated.sh
```

## Ports

- **8545** - RPC Node (HTTP)
- **8546** - RPC Node (WebSocket)
- **21001-21004** - Validator Nodes
- **30303-30306** - P2P Communication

## Key Features

- ✅ W3C DID Core v1.0 compliance
- ✅ Verifiable Credentials v2.0 support
- ✅ Role-based access control
- ✅ Private Ethereum network (Nethermind)
- ✅ Performance benchmarking
- ✅ Gas optimization
- ✅ Comprehensive testing

## Development

### Prerequisites

- Docker & Docker Compose
- Node.js 18+
- pnpm

### Environment Setup

```bash
# Install dependencies
cd smart-contracts && pnpm install
cd ../caliper && pnpm install

# Start network
docker-compose up -d

---

**License**: ISC  
**Author**: novaldypratama
