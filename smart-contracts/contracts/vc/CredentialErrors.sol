// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title CredentialErrors
 * @dev Custom error definitions for W3C Verifiable Credentials Registry
 * Following W3C VC Data Model v1.1 specification and gas-efficient error patterns
 */

// ============================================================================
// CREDENTIAL LIFECYCLE ERRORS
// ============================================================================

/**
 * @notice Error thrown when attempting to create a credential that already exists
 * @param credentialHash The keccak256 hash of the credential that already exists
 */
error CredentialAlreadyExists(bytes32 credentialHash);

/**
 * @notice Error thrown when attempting to access a credential that doesn't exist
 * @param credentialHash The keccak256 hash of the credential that was not found
 */
error CredentialNotFound(bytes32 credentialHash);

/**
 * @notice Error thrown when attempting to use an expired credential
 * @param credentialHash The keccak256 hash of the expired credential
 * @param expirationDate The timestamp when the credential expired
 * @param currentTime The current block timestamp
 */
error CredentialExpired(bytes32 credentialHash, uint64 expirationDate, uint64 currentTime);

/**
 * @notice Error thrown when attempting to use a revoked credential
 * @param credentialHash The keccak256 hash of the revoked credential
 * @param revokedAt The timestamp when the credential was revoked
 * @param reason The reason for revocation
 */
error CredentialIsRevoked(bytes32 credentialHash, uint64 revokedAt, string reason);

/**
 * @notice Error thrown when attempting to use a suspended credential
 * @param credentialHash The keccak256 hash of the suspended credential
 * @param suspendedAt The timestamp when the credential was suspended
 * @param reason The reason for suspension
 */
error CredentialIsSuspended(bytes32 credentialHash, uint64 suspendedAt, string reason);

/**
 * @notice Error thrown when credential status transition is invalid
 * @param credentialHash The keccak256 hash of the credential
 * @param currentStatus The current status of the credential
 * @param attemptedStatus The status that was attempted to be set
 * @param reason The reason for the invalid transition
 */
error InvalidStatusTransition(bytes32 credentialHash, uint8 currentStatus, uint8 attemptedStatus, string reason);

// ============================================================================
// ISSUER AND HOLDER ERRORS
// ============================================================================

/**
 * @notice Error thrown when an identity is not found or not registered
 * @param identity The address of the DID that is not found
 */
error IdentityNotFound(address identity);

/**
 * @notice Error thrown when an identity's registration has been deactivated
 * @param identity The address of the DID that has been deactivated
 * @param reason The reason for the deactivated identity
 */
error IdentityHasBeenDeactivated(address identity, string reason);

/**
 * @notice Error thrown when attempting to issue a credential to an invalid identity
 * @param identity The address of DID that is invalid 
 * @param reason The reason for invalid identity
 */
error InvalidIdentity(address identity, string reason);

// ============================================================================
// W3C VC DATA MODEL VALIDATION ERRORS
// ============================================================================

/**
 * @notice Error thrown when issuance date is invalid (future date or malformed)
 * @param credentialHash The keccak256 hash of the credential
 * @param issuanceDate The invalid issuance date
 * @param currentTime The current block timestamp
 */
error InvalidIssuanceDate(bytes32 credentialHash, uint64 issuanceDate, uint64 currentTime);

/**
 * @notice Error thrown when expiration date is before issuance date
 * @param credentialHash The keccak256 hash of the credential
 * @param issuanceDate The credential's issuance date
 * @param expirationDate The invalid expiration date
 */
error InvalidExpirationDate(bytes32 credentialHash, uint64 issuanceDate, uint64 expirationDate);

// ============================================================================
// ACCESS CONTROL AND PERMISSION ERRORS
// ============================================================================

/**
 * @notice Error thrown when credential operation is attempted without proper ownership
 * @param credentialHash The keccak256 hash of the credential
 * @param caller The address that attempted the operation
 * @param owner The actual owner of the credential
 */
error NotCredentialOwner(bytes32 credentialHash, address caller, address owner);

/**
 * @notice Error thrown when an address is not the expected credential issuer
 * @param caller The address that attempted the operation
 * @param expectedIssuer The expected issuer address
 */
error NotCredentialIssuer(address caller, address expectedIssuer);

/**
 * @notice Error thrown when the issuer and holder addresses are identical
 * @param issuer The address that attempted the operation
 * @param holder The address that will be issued
 * @param reason Description of what validation failed
 */
error IdenticalCallerAddress(address issuer, address holder, string reason);