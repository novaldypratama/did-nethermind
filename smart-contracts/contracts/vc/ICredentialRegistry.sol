// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { CredentialRecord, CredentialMetadata, CredentialStatus } from "./CredentialType.sol";

/**
 * @title ICredentialRegistry
 * @dev Interface for W3C Verifiable Credentials Registry following VC Data Model v2.0
 * 
 * This interface defines the core functionality for managing Verifiable Credentials
 * on-chain while maintaining compliance with W3C standards and optimizing for
 * Ethereum's storage and gas cost constraints.
 * 
 * Key Design Principles:
 * - W3C VC Data Model v2.0 compliance
 * - Role-based access control (Trustee/Endorser/Steward)
 * - Gas-efficient operations with batch support
 * - Comprehensive credential lifecycle management
 * - Support for credential status lists and revocation
 */
interface ICredentialRegistry {

    // ========================================================================
    // EVENTS - W3C VC LIFECYCLE TRACKING
    // ========================================================================

    /**
     * @dev Emitted when a Verifiable Credential is issued
     * @param credentialId keccak256 hash of the credential content
     * @param actor Address that issued the credential
     * @param identity Ethereum address of the holder
     * @param credentialCid Content Identifier (CID) pointing to the full credential data
     */
    event CredentialIssued(
        bytes32 indexed credentialId,
        address indexed actor,
        address indexed identity,
        string credentialCid
    );

    /**
     * @dev Emitted when a Verifiable Credential status is updated
     * @param credentialId keccak256 hash of the credential
     * @param previousStatus Previous status of the credential
     * @param newStatus New status of the credential
     * @param updatedBy Address that performed the update
     */
    event CredentialStatusUpdated(
        bytes32 indexed credentialId,
        CredentialStatus previousStatus,
        CredentialStatus newStatus,
        address indexed updatedBy
    );

    /**
     * @dev Emitted when a Verifiable Credential is revoked
     * @param credentialHash keccak256 hash of the revoked credential
     * @param revokedAt Unix timestamp of revocation
     */
    event CredentialRevoked(
        bytes32 indexed credentialHash,
        uint64 revokedAt
    );

    /**
     * @dev Emitted when a Verifiable Credential is suspended
     * @param credentialHash keccak256 hash of the suspended credential
     * @param suspendedAt Unix timestamp of suspension
     */
    event CredentialSuspended(
        bytes32 indexed credentialHash,
        uint64 suspendedAt
    );

    /**
     * @dev Emitted when a Verifiable Credential is reactivated from suspended status
     * @param credentialHash keccak256 hash of the reactivated credential
     * @param reactivatedAt Unix timestamp of reactivation
     */
    event CredentialReactivated(
        bytes32 indexed credentialHash,
        uint64 reactivatedAt
    );

    // // ========================================================================
    // // CORE CREDENTIAL MANAGEMENT FUNCTIONS
    // // ========================================================================

    /**
     * @dev Issues a new Verifiable Credential
     * @notice Issues a new credential
     * 
     * Requirements:
     * - Caller must have TRUSTEE, ENDORSER, or STEWARD role
     * - Issuer must be registered and active
     * - Credential must not already exist
     * - Credential must follow W3C VC Data Model v2.0 format
     * - Issuance date must not be in the future
     * - Expiration date must be after issuance date (if set)
     * 
     * @param identity Ethereum address of the holder
     * @param credentialId The keccak256 hash of the credential
     * @param credentialCid The content identifier (CID) pointing to the full credential data
     * 
     * Emits: CredentialIssued event
     * 
     * Reverts with:
     * - CredentialAlreadyExists if credential hash already exists
     * - IssuerNotFound if issuer is not registered
     * - IssuerNotAuthorized if issuer is not active
     * - InvalidIssuanceDate if issuance date is invalid
     * - InvalidExpirationDate if expiration date is before issuance date
     * - InsufficientRole if caller lacks required role
     */
    function issueCredential(
        address identity,
        bytes32 credentialId,
        string calldata credentialCid
    ) external;

    /**
     * @dev Issues a Verifiable Credential with off-chain signature (meta-transaction)
     * 
     * This function enables gasless credential issuance where the issuer signs
     * the transaction off-chain and another party submits it on their behalf.
     * 
     * @param identity Ethereum address of the holder
     * @param sigV ECDSA signature recovery id (v)
     * @param sigR ECDSA signature part R
     * @param sigS ECDSA signature part S
     * @param credentialId keccak256 hash of the credential content
     * @param credentialCid Content Identifier (CID) pointing to the full credential data
     * 
     * Emits: CredentialIssued event
     * 
     * Reverts with:
     * - SignatureVerificationFailed if signature is invalid
     * - InvalidNonce if nonce is incorrect or already used
     */
    function issueCredentialSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS,
        bytes32 credentialId,
        string calldata credentialCid
    ) external;

    /**
    * @notice Updates the status of a Verifiable Credential following W3C VC Data Model v2.0
    * @dev Implements comprehensive status transitions with proper validation and authorization
    * @dev This function follows the trust triangle approach requiring proper authorization
    * 
    * Requirements:
    * - Credential must exist
    * - Caller must have authorized role (TRUSTEE or ISSUER)
    * - Actor must be a valid issuer
    * - Actor must be the original issuer of the credential or have TRUSTEE privileges
    * - Status transition must be valid according to W3C VC lifecycle
    * - Previous status must match current status (optimistic concurrency control)
    * 
    * @param credentialId keccak256 hash of the credential to update
    * @param previousStatus Expected current status (for optimistic concurrency control)
    * @param newStatus Desired new status to set
    * 
    * @custom:security This function implements multiple layers of security:
    * - Role-based access control via modifiers
    * - Issuer validation and authorization
    * - Optimistic concurrency control
    * - Status transition validation
    * 
    * Emits: CredentialStatusUpdated event
    * 
    * Reverts with:
    * - CredentialNotFound if credential doesn't exist
    * - Unauthorized if caller lacks required role
    * - IssuerNotAuthorized if actor lacks permission or issuer validation fails
    * - InvalidStatusTransition if status change is not allowed or current status mismatch
    */
    function updateCredentialStatus(
        bytes32 credentialId,
        CredentialStatus previousStatus,
        CredentialStatus newStatus
    ) external;

    /**
     * @dev Resolves a Verifiable Credential by its ID
     * 
     * Retrieves the complete credential record including metadata.
     * 
     * @param credentialId keccak256 hash of the credential to resolve
     * @return credentialRecord Complete credential record with metadata
     * 
     * Reverts with:
     * - CredentialNotFound if credential doesn't exist
     *
     * Note: This function is used to retrieve the credential data and metadata
     * for display or verification purposes. It does not perform any validation.
    */
    function resolveCredential(
        bytes32 credentialId
    ) external view returns (CredentialRecord memory credentialRecord);

    // /**
    //  * @dev Retrieves a Verifiable Credential by its hash
    //  * 
    //  * @param credentialHash keccak256 hash of the credential to retrieve
    //  * @return credentialRecord Complete credential record with metadata
    //  * 
    //  * Reverts with:
    //  * - CredentialNotFound if credential doesn't exist
    //  */
    // function getCredential(bytes32 credentialHash) 
    //     external 
    //     view 
    //     returns (CredentialRecord memory credentialRecord);

    // /**
    //  * @dev Verifies if a Verifiable Credential is valid and active
    //  * 
    //  * Performs comprehensive validation including:
    //  * - Credential existence
    //  * - Expiration checking
    //  * - Status validation (not revoked/suspended)
    //  * - Issuer status validation
    //  * 
    //  * @param credentialHash keccak256 hash of the credential to verify
    //  * @return isValid True if credential is valid and usable
    //  * @return status Current status of the credential
    //  * @return reason Human-readable reason if credential is invalid
    //  * 
    //  * Note: This function does not revert for invalid credentials,
    //  * but returns the validation result and reason.
    //  */
    // function verifyCredential(bytes32 credentialHash)
    //     external
    //     view
    //     returns (
    //         bool isValid,
    //         CredentialStatus status,
    //         string memory reason
    //     );
}