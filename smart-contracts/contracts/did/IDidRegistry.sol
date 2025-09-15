// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { DidRecord, DidStatus } from "./DidType.sol";

/**
 * @title IDidRegistry
 * @dev Interface for DID document management following W3C DID Core v1.0 specification
 */
interface IDidRegistry {
    /**
     * @dev Emitted when a new DID is created
     * @param identity Address of the created DID
     * @param docHash Hash of the DID document
     * @param docCid CID of the DID document in IPFS
     */
    event DIDCreated(address indexed identity, bytes32 docHash, string docCid);

    /**
     * @dev Emitted when a DID document is updated
     * @param identity Address of the updated DID
     * @param docHash Hash of the updated DID document
     * @param versionId New version ID
     * @param docCid Updated CID of the DID document in IPFS
     */
    event DIDUpdated(address indexed identity, bytes32 docHash, uint32 versionId, string docCid);

    /**
     * @dev Emitted when a DID is deactivated
     * @param identity Address of the deactivated DID
     */
    event DIDDeactivated(address indexed identity);

    /**
     * @dev Creates a new DID with document hash
     * @param identity Address of DID identity owner
     * @param docHash Hash of DID document for integrity verification
     * @param docCid CID of the DID document for storage
     */
    function createDid(address identity, bytes32 docHash, string calldata docCid) external;

    /**
     * @dev Creates a DID with off-chain signature (for delegated transactions)
     * @param identity Address of DID identity owner
     * @param sigV Part of EcDSA signature
     * @param sigR Part of EcDSA signature
     * @param sigS Part of EcDSA signature
     * @param docHash Hash of DID document for integrity verification
     * @param docCid CID of the DID document for storage
     */
    function createDidSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS,
        bytes32 docHash,
        string calldata docCid
    ) external;

    /**
     * @dev Updates an existing DID document
     * @param identity Address of the DID to update
     * @param docHash Updated hash of DID document
     * @param docCid Updated CID of the DID document for storage
     */
    function updateDid(address identity, bytes32 docHash, string calldata docCid) external;

    /**
     * @dev Updates a DID with off-chain signature
     * @param identity Address of the DID to update
     * @param sigV Part of EcDSA signature
     * @param sigR Part of EcDSA signature
     * @param sigS Part of EcDSA signature
     * @param docHash Updated hash of DID document
     * @param docCid Updated CID of the DID document for storage
     */
    function updateDidSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS,
        bytes32 docHash,
        string calldata docCid
    ) external;

    /**
     * @dev Deactivates an existing DID
     * @param identity Address of the DID to deactivate
     */
    function deactivateDid(address identity) external;

    /**
     * @dev Deactivates a DID with off-chain signature
     * @param identity Address of the DID to deactivate
     * @param sigV Part of EcDSA signature
     * @param sigR Part of EcDSA signature
     * @param sigS Part of EcDSA signature
     */
    function deactivateDidSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS
    ) external;

    /**
     * @dev Resolves a DID to get its record
     * @param identity Address of the DID to resolve
     * @return didRecord The DID record containing hash and metadata
     */
    function resolveDid(address identity) external view returns (DidRecord memory didRecord);

    /**
    * @dev Validates a DID in a single call, returning all validation data at once
    * @param identity The address to validate
    * @return exists Whether the DID exists
    * @return active Whether the DID is active (not deactivated)
    * @return owner The owner of the DID
    */
    function validateDid(address identity) external view returns (
        bool exists,
        bool active,
        address owner
    );

    /**
     * @dev Validates if provided hash matches the stored document hash
     * @param identity Address of the DID
     * @param hash Hash to validate against the stored document hash
     * @return valid True if hashes match
     */
    function validateDocumentHash(address identity, bytes32 hash) external view returns (bool valid);
}