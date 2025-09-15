// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title Credential Types
 * @dev Data structures for Verifiable Credentials following W3C VC Data Model v2.0
 * @notice These structures are designed to be gas-efficient and storage-optimized
 * while adhering to the W3C Verifiable Credentials Data Model v2.0 specification.
 */

/**
 * @title CredentialRecord
 * @dev Holds the verifiable credential data and its associated metadata.
 *
 * @param issuer - Address of the issuer of the credential
 * @param metadata - Additional metadata associated with the credential
 */
struct CredentialRecord {
    address issuer;                 // Issuer of the credential (20 bytes)
    CredentialMetadata metadata;    // Metadata associated with the credential
}

/**
 * @title CredentialMetadata
 * @dev Holds essential metadata for a verifiable credential.
 * Storage-optimized by packing related fields together to minimize slot usage.
 * @notice This structure is designed to be gas-efficient while providing necessary information about the credential.
 * @notice The fields are ordered to optimize storage packing and reduce gas costs.
 *
 * @param issuanceDate - Timestamp indicating when the credential was issued
 * @param expirationDate - Timestamp indicating when the credential expires (0 for no expiration)
 * @param status - Reserved for future credential status flags (1 = default)
 * Provided space for future storage extensibility (10/32 bytes of the slot)
 */
struct CredentialMetadata {
    uint40 issuanceDate;        // 5 bytes - reduced from uint256 since Unix timestamps fit in uint40
    uint32 expirationDate;      // 4 bytes - reduced from uint256 for the same reason
    CredentialStatus status;    // 1 byte - added for extensibility while optimizing packing
}

/**
 * @title CredentialStatus
 * @dev Defines the possible states of a Verifiable Credential
 * @dev CredentialStatus defines the possible states of a Verifiable Credential
 * @notice This enum is used to track the lifecycle of a credential, allowing for future extensibility.
 */
enum CredentialStatus {
    NONE,       // Not created/invalid
    ACTIVE,     // Valid and usable
    REVOKED,    // Credential has been revoked and is no longer valid
    SUSPENDED   // No longer usable but record is maintained
}