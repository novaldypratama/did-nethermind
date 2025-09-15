// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IRoleControl } from "../auth/IRoleControl.sol";
import { Unauthorized } from "../auth/AuthErrors.sol";

import { IDidRegistry } from "../did/IDidRegistry.sol";

import { ICredentialRegistry } from "./ICredentialRegistry.sol";
import { CredentialRecord, CredentialMetadata, CredentialStatus } from "./CredentialType.sol";

import {
    CredentialAlreadyExists,
    CredentialNotFound,
    CredentialIsRevoked,
    InvalidStatusTransition,
    IdentityNotFound,
    IdentityHasBeenDeactivated,
    InvalidIdentity,
    NotCredentialIssuer,
    IdenticalCallerAddress
} from "./CredentialErrors.sol";

contract CredentialRegistry is ICredentialRegistry {
    
    /**
    * @dev Reference to the role control contract for access management
    */
    IRoleControl private immutable _roleControl;

    /**
    * @dev Reference to the DID registry for managing issuer and holder DIDs
    */
    IDidRegistry private immutable _didRegistry;

    /**
    * @dev Mapping to store credential records by their unique identifier
    * @notice credentialId must be the keccak256 of the URDNA2015-canonical VC bytes
    */
    mapping(bytes32 credentialId => CredentialRecord credentialRecord) private _credentials;

    // ========================================================================
    // MODIFIERS FOR ACCESS CONTROL AND VALIDATION
    // ========================================================================

    /**
    * @dev Ensures caller has required role for the operation
    */
    modifier _onlyAuthorizedRole() {
        _roleControl.isTrusteeOrIssuer(msg.sender);
        _;
    }

    /**
     * @dev Ensures credential ID is unique (not already issued)
     */
    modifier _uniqueCredentialId(bytes32 credentialId){
        if (_credentials[credentialId].metadata.issuanceDate != 0) {
            revert CredentialAlreadyExists(credentialId);
        }
        _;
    }

    modifier _validCredential(bytes32 credentialId) {
        if (_credentials[credentialId].metadata.issuanceDate == 0) {
            revert CredentialNotFound(credentialId);
        }
        
        if (_credentials[credentialId].metadata.status == CredentialStatus.REVOKED) {
            revert CredentialIsRevoked(credentialId, uint64(block.timestamp), "Cannot access revoked credential");
        }
        _;
    }

    /**
    * @dev Modifier that ensures the caller is the credential issuer
    */
    modifier _onlyCredentialIssuer(bytes32 credentialId) {
        address issuer = _credentials[credentialId].issuer;
        if (issuer == address(0)) revert CredentialNotFound(credentialId);
        if (issuer != msg.sender) revert NotCredentialIssuer(msg.sender, issuer);
        _;
    }

    /**
     * @dev  Constructor to initialize the CredentialRegistry with role control and DID registry addresses
     * @param roleControlAddress The address of the RoleControl contract for access management
     * @param didRegistryAddress The address of the DidRegistry contract for managing DIDs
     * @notice This constructor ensures that both addresses are valid and not zero.
     */
    constructor(address roleControlAddress, address didRegistryAddress) {
        require(roleControlAddress != address(0), "Invalid role control address");
        require(didRegistryAddress != address(0), "Invalid DID registry address");
        
        _roleControl = IRoleControl(roleControlAddress);
        _didRegistry = IDidRegistry(didRegistryAddress);
    }

    /// @inheritdoc ICredentialRegistry
    function issueCredential(
        address identity,
        bytes32 credentialId,
        string calldata credentialCid
    ) external override {
        _issueCredential(identity, msg.sender, credentialId, credentialCid);
    }

    /// @inheritdoc ICredentialRegistry
    function issueCredentialSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS,
        bytes32 credentialId,
        string calldata credentialCid
    ) external override {
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0x19), bytes1(0), address(this), identity, "issueCredential", credentialId, credentialCid)
        );
        // Verify signature
        address actor = ecrecover(hash, sigV, sigR, sigS);

        // Call internal function to issue credential
        _issueCredential(identity, actor, credentialId, credentialCid);
    }

    /// @inheritdoc ICredentialRegistry
    function updateCredentialStatus(
        bytes32 credentialId,
        CredentialStatus previousStatus,
        CredentialStatus newStatus
    ) external override {
        // Cache storage references for gas optimization
        CredentialRecord storage credential = _credentials[credentialId];

        // Optimistic concurrency control: Verify current status matches expected
        if (credential.metadata.status != previousStatus) {
            revert InvalidStatusTransition(
                credentialId,
                uint8(credential.metadata.status),
                uint8(newStatus),
                string(abi.encodePacked(
                    "Status mismatch: expected ",
                    _statusToString(previousStatus),
                    ", found ",
                    _statusToString(credential.metadata.status)
                ))
            );
        }

        _setStatus(credentialId, credential.metadata, newStatus);
    }

    /// @inheritdoc ICredentialRegistry
    function resolveCredential(
        bytes32 credentialId
    ) external view _validCredential(credentialId) returns (CredentialRecord memory credentialRecord) {
        return _credentials[credentialId];
    }

    /**
    * @dev Internal credential issuance with optimized validation and storage
    */
    function _issueCredential(
        address identity,
        address actor,
        bytes32 credentialId,
        string calldata credentialCid
    )
        internal
        _onlyAuthorizedRole
        _uniqueCredentialId(credentialId)
    {
        // Validate both actor (issuer) and identity (holder)
        _validateExternalRequirements(actor);
        _validateExternalRequirements(identity);

        // Prevent self-issuance (critical security check)
        if (actor == identity) {
            revert IdenticalCallerAddress(
                actor,
                identity,
                "Self-issuance not allowed"
            );
        }

        _credentials[credentialId].issuer   = actor;

        CredentialMetadata storage metadata = _credentials[credentialId].metadata;
        metadata.issuanceDate               = uint40(block.timestamp);
        metadata.expirationDate             = 0; // Default to no expiration
        metadata.status                     = CredentialStatus.ACTIVE; // Default status
        
        // Emit event for credential issuance
        emit CredentialIssued(
            credentialId,
            actor,
            identity,
            credentialCid
        );
    }

    function _setStatus(
        bytes32 credentialId,
        CredentialMetadata storage metadata,
        CredentialStatus newStatus
    )
        internal
        _validCredential(credentialId)
        _onlyCredentialIssuer(credentialId)
    {

        // External validations (consolidated)
        _validateExternalRequirements(msg.sender);

        // Status transition validation
        _validateStatusTransition(credentialId, metadata.status, newStatus);

        // Prevent redundant updates (gas optimization)
        if (metadata.status == newStatus) {
            return; // No change needed
        }

        // Store previous status for event emission
        CredentialStatus oldStatus = metadata.status;

        // Update status with timestamp
        metadata.status = newStatus;
        
        _emitStatusEvents(credentialId, oldStatus, newStatus);
    }

    /**
     * @dev Reduces external calls while maintaining security
     * @notice Consolidated external validation
     * @param caller The address to validate
     */
    function _validateExternalRequirements(address caller) internal view {

        // External call: DID validation (single call with all data)
        (bool exists, bool active, address owner) = _didRegistry.validateDid(caller);
        
        if (!exists) {
            revert IdentityNotFound(caller);
        }
        
        if (!active) {
            revert IdentityHasBeenDeactivated(caller, "Cannot use deactivated DID");
        }
        
        if (owner != caller) {
            revert InvalidIdentity(caller, "DID not controlled by caller address");
        }
    }

    /**
     * @dev Simple, clean, readable status validation logic for W3C VC lifecycle compliance
     * @param credentialId The credential identifier for error reporting
     * @param current Current status of the credential
     * @param target Desired new status
     */
    function _validateStatusTransition(
        bytes32 credentialId,
        CredentialStatus current,
        CredentialStatus target
    ) internal pure {
        
        // Prevent transition to NONE (invalid operational status)
        if (target == CredentialStatus.NONE) {
            revert InvalidStatusTransition(
                credentialId,
                uint8(current),
                uint8(target),
                "Cannot transition to NONE status"
            );
        }
        
        // Validate transitions based on current status
        if (current == CredentialStatus.ACTIVE) {
            if (target != CredentialStatus.SUSPENDED && target != CredentialStatus.REVOKED) {
                revert InvalidStatusTransition(
                    credentialId,
                    uint8(current),
                    uint8(target),
                    "ACTIVE can only transition to SUSPENDED or REVOKED"
                );
            }
        } else if (current == CredentialStatus.SUSPENDED) {
            if (target != CredentialStatus.ACTIVE && target != CredentialStatus.REVOKED) {
                revert InvalidStatusTransition(
                    credentialId,
                    uint8(current),
                    uint8(target),
                    "SUSPENDED can only transition to ACTIVE or REVOKED"
                );
            }
        } else if (current == CredentialStatus.REVOKED) {
            // REVOKED is a terminal state - no transitions allowed
            revert InvalidStatusTransition(
                credentialId,
                uint8(current),
                uint8(target),
                "REVOKED is a terminal state - no further transitions allowed"
            );
        }
        // If current is NONE, allow transitions to any valid status except NONE
    }

    /**
     * @dev Efficient event emission with minimal conditional logic
     * @notice Clean event emission
     * @param credentialId The credential identifier
     * @param oldStatus Previous status of the credential
     * @param newStatus New status of the credential
     */
    function _emitStatusEvents(
        bytes32 credentialId,
        CredentialStatus oldStatus,
        CredentialStatus newStatus
    ) internal {
        
        // Primary event for status update with detailed information (always emitted)
        emit CredentialStatusUpdated(
            credentialId,
            oldStatus,
            newStatus,
            msg.sender
        );
        
        // Specific events with direct enum comparison for better indexing and monitoring
        uint40 timestamp = uint40(block.timestamp);
        
        if (newStatus == CredentialStatus.REVOKED) {
            emit CredentialRevoked(credentialId, timestamp);
        } else if (newStatus == CredentialStatus.SUSPENDED) {
            emit CredentialSuspended(credentialId, timestamp);
        } else if (newStatus == CredentialStatus.ACTIVE && oldStatus == CredentialStatus.SUSPENDED) {
            // Emit reactivation event when credential is restored from suspended state
            emit CredentialReactivated(credentialId, timestamp);
        }
    }

    /**
    * @dev Converts CredentialStatus enum to human-readable string
    * @param status The credential status to convert
    * @return string representation of the status
    * @notice Used for generating descriptive error messages
    */
    function _statusToString(CredentialStatus status) internal pure returns (string memory) {
        if (status == CredentialStatus.NONE) return "NONE";
        if (status == CredentialStatus.ACTIVE) return "ACTIVE";
        if (status == CredentialStatus.REVOKED) return "REVOKED";
        if (status == CredentialStatus.SUSPENDED) return "SUSPENDED";
        return "UNKNOWN";
    }
}