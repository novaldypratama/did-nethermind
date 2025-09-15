// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title DID Types
 * @dev Optimized data structures for DID document storage with efficient packing
 * @notice These structures are designed to minimize gas costs and storage usage
 * while adhering to the W3C DID Core v1.0 specification.
 */

/**
 * @dev DidRecord holds the DID Document and its associated metadata
 * @notice Contains the document content, its hash, and metadata
 * @param docHash The keccak256 hash of the JSON Canonicalized Serialization (JCS) of the DID document
 * @param metadata Associated metadata associated with the DID document
 */
struct DidRecord {
    bytes32 docHash;
    DidMetadata metadata;
}

/**
 * @dev DidMetadata holds additional properties associated with the DID
 * @notice Fields are ordered to optimize storage packing
    * @param owner The address of the DID owner
    * @param created Timestamp of when the DID was created
    * @param updated Timestamp of the last update to the DID
    * @param versionId The version identifier for the DID document
    * @param deactivated Indicates if the DID has been deactivated
 * @notice This structure is designed to minimize storage costs by packing related fields together
 */
struct DidMetadata {
    address owner;
    uint64 created;
    uint64 updated;
    uint32 versionId;
    DidStatus status;
}

/**
 * @dev DidDocumentStatus defines the possible states of a DID document
 * @notice This enum is used to track the lifecycle of a DID document, allowing for future extensibility.
 */
enum DidStatus {
    NONE,       // Not created/invalid
    ACTIVE,     // Valid and usable
    DEACTIVATED // No longer usable but record is maintained
}