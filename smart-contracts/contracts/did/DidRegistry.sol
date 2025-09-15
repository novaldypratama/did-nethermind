// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { IRoleControl } from "../auth/IRoleControl.sol";
import { Unauthorized } from "../auth/AuthErrors.sol";
import { DidAlreadyExist, DidHasBeenDeactivated, DidNotFound, NotIdentityOwner, InvalidDidDocument } from "./DidErrors.sol";
import { DidRecord, DidMetadata, DidStatus } from "./DidType.sol";
import { IDidRegistry } from "./IDidRegistry.sol";

/**
 * @title DidRegistry
 * @dev Implementation of DID operations following W3C DID Core specification
 * with optimized storage and gas efficiency
 */
contract DidRegistry is IDidRegistry {
    // Role control contract for authorization
    IRoleControl internal _roleControl;

    // DID records storage - maps identity address to DID record
    mapping(address identity => DidRecord didRecord) private _dids;

    // MODIFIERS

    /**
     * @dev Ensures the DID exists
     */
    modifier _didExist(address identity) {
        if (_dids[identity].metadata.created == 0) revert DidNotFound(identity);
        _;
    }

    /**
     * @dev Ensures the DID does not exist
     */
    modifier _didNotExist(address identity) {
        if (_dids[identity].metadata.created != 0) revert DidAlreadyExist(identity);
        _;
    }

    /**
     * @dev Ensures the DID is active
     */
    modifier _didIsActive(address identity) {
        if (_dids[identity].metadata.status != DidStatus.ACTIVE) 
            revert DidHasBeenDeactivated(identity, "Access");
        _;
    }

    /**
     * @dev Ensures caller is either Trustee or Issuer
     */
    modifier _senderIsTrusteeOrIssuerOrHolder() {
        try _roleControl.isTrusteeOrIssuerOrHolder(msg.sender) {
            // Successfully validated as either Trustee or Issuer
        } catch (bytes memory) {
            revert Unauthorized(msg.sender);
        }
        _;
    }

    /**
     * @dev Ensures caller is either DID owner or a trustee
     */
    modifier _senderIsIdentityOwnerOrTrustee(address identity) {
        if (msg.sender == identity) {
            // Caller is the identity owner
        } else {
            try _roleControl.isTrustee(msg.sender) {
                // Successfully validated as Trustee
            } catch (bytes memory) {
                revert Unauthorized(msg.sender);
            }
        }
        _;
    }

    /**
     * @dev Ensures actor is the DID owner
     */
    modifier _identityOwner(address identity, address actor) {
        if (identity != actor) revert NotIdentityOwner(actor, identity);
        _;
    }

    /**
     * @dev Constructor to initialize role control contract
     * @param roleControlContractAddress Address of role control contract
     */
    constructor(address roleControlContractAddress) {
        require(roleControlContractAddress != address(0), "Role control address cannot be zero");
        _roleControl = IRoleControl(roleControlContractAddress);
    }

    // EXTERNAL FUNCTIONS - IMPLEMENTATION OF INTERFACE

    /// @inheritdoc IDidRegistry
    function createDid(address identity, bytes32 docHash, string calldata docCid) external override {
        _createDid(identity, msg.sender, docHash, docCid);
    }

    /// @inheritdoc IDidRegistry
    function createDidSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS,
        bytes32 docHash,
        string calldata docCid
    ) external override {
        // Recreate the signed message hash
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0x19), bytes1(0), address(this), identity, "createDid", docHash, docCid)
        );

        // Recover the signer from signature
        address signer = ecrecover(hash, sigV, sigR, sigS);

        // Call internal function with recovered signer
        _createDid(identity, signer, docHash, docCid);
    }

    /// @inheritdoc IDidRegistry
    function updateDid(address identity, bytes32 docHash, string calldata docCid) external override {
        _updateDid(identity, msg.sender, docHash, docCid);
    }

    /// @inheritdoc IDidRegistry
    function updateDidSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS,
        bytes32 docHash,
        string calldata docCid
    ) external override {
        // Recreate the signed message hash
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0x19), bytes1(0), address(this), identity, "updateDid", docHash, docCid)
        );

        // Recover the signer from signature
        address signer = ecrecover(hash, sigV, sigR, sigS);

        // Call internal function with recovered signer
        _updateDid(identity, signer, docHash, docCid);
    }

    /// @inheritdoc IDidRegistry
    function deactivateDid(address identity) external override {
        _deactivateDid(identity, msg.sender);
    }

    /// @inheritdoc IDidRegistry
    function deactivateDidSigned(
        address identity,
        uint8 sigV,
        bytes32 sigR,
        bytes32 sigS
    ) external override {
        // Recreate the signed message hash
        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0x19), bytes1(0), address(this), identity, "deactivateDid")
        );

        // Recover the signer from signature
        address signer = ecrecover(hash, sigV, sigR, sigS);

        // Call internal function with recovered signer
        _deactivateDid(identity, signer);
    }

    /// @inheritdoc IDidRegistry
    function resolveDid(address identity) external view override _didExist(identity) _didIsActive(identity) returns (DidRecord memory didRecord) {
        return _dids[identity];
    }

    /// @inheritdoc IDidRegistry
    function validateDid(address identity) external view returns (
        bool exists,
        bool active,
        address owner
    ) {
        // Check if DID record exists by looking at the created timestamp
        // This is more gas efficient than calling didExists() which would be a separate function call
        bool doesExist = _dids[identity].metadata.created > 0;
        
        // If DID doesn't exist, return early with default values
        if (!doesExist) {
            return (false, false, address(0));
        }
        
        // Access the DID record directly from storage
        DidRecord storage record = _dids[identity];
        
        // Check if active (status is ACTIVE which is enum value 1)
        bool isActive = record.metadata.status == DidStatus.ACTIVE;
        
        // Return all validation data at once
        return (
            true,                                // exists
            isActive,                            // active status
            record.metadata.owner                // owner address
        );
    }

    /// @inheritdoc IDidRegistry
    function validateDocumentHash(address identity, bytes32 hash) external view override _didExist(identity) returns (bool valid) {
        return _dids[identity].docHash == hash;
    }

    // INTERNAL FUNCTIONS

    /**
     * @dev Internal function to create a new DID
     * @param identity Address of the DID
     * @param actor Address of the actor (sender or recovered signer)
     * @param docHash Hash of the DID document
     * @param docCid CID of the DID document for storage
     */
    function _createDid(
        address identity,
        address actor,
        bytes32 docHash,
        string calldata docCid
    )
        internal
        _senderIsTrusteeOrIssuerOrHolder
    {
        // Validate inputs first
        if (docHash == bytes32(0)) revert InvalidDidDocument("Empty document hash not allowed");

        // Update state variables - packing optimization occurs here
        _dids[identity].docHash = docHash;
        
        // Set metadata fields in the most efficient order for storage packing
        DidMetadata storage metadata = _dids[identity].metadata;
        metadata.owner = identity;
        metadata.created = uint64(block.timestamp);
        metadata.updated = uint64(block.timestamp);
        metadata.versionId = uint32(block.number);
        metadata.status = DidStatus.ACTIVE;

        // Emit event
        emit DIDCreated(identity, docHash, docCid);
    }

    /**
     * @dev Internal function to update a DID
     * @param identity Address of the DID
     * @param actor Address of the actor (sender or recovered signer)
     * @param docHash Updated hash of the DID document
     */
    function _updateDid(
        address identity,
        address actor,
        bytes32 docHash,
        string calldata docCid
    )
        internal
        _didExist(identity)
        _didIsActive(identity)
        _identityOwner(identity, actor)
        _senderIsIdentityOwnerOrTrustee(identity)
    {
        // Validate inputs first
        if (docHash == bytes32(0)) revert InvalidDidDocument("Empty document hash not allowed");

        // Update state variables
        _dids[identity].docHash = docHash;

        // Update metadata fields - packing optimization occurs here
        DidMetadata storage metadata = _dids[identity].metadata;
        metadata.updated = uint64(block.timestamp);
        metadata.versionId = uint32(block.number);

        // Emit event with new version ID for tracking
        emit DIDUpdated(identity, docHash, _dids[identity].metadata.versionId, docCid);
    }

    /**
     * @dev Internal function to deactivate a DID
     * @param identity Address of the DID
     * @param actor Address of the actor (sender or recovered signer)
     */
    function _deactivateDid(
        address identity,
        address actor
    )
        internal
        _didExist(identity)
        _didIsActive(identity)
        _identityOwner(identity, actor)
        _senderIsIdentityOwnerOrTrustee(identity)
    {
        // Update state variables - packing optimization occurs here
        DidMetadata storage metadata = _dids[identity].metadata;
        metadata.status = DidStatus.DEACTIVATED;
        metadata.updated = uint64(block.timestamp);
        metadata.versionId = uint32(block.number);

        // Emit event
        emit DIDDeactivated(identity);
    }
}