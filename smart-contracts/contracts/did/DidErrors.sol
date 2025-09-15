// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @title DID Errors
 * @dev Custom errors for DID-related operations in SSI systems
 * @notice Defining errors in a single file improves gas efficiency and maintainability
 */

//--------------------------------------------------------------------------
// DID EXISTENCE ERRORS
//--------------------------------------------------------------------------

/**
 * @dev Error that occurs when the specified DID is not found
 * @param identity The address of the DID that doesn't exist
 */
error DidNotFound(address identity);

/**
 * @dev Error that occurs when trying to create an already existing DID
 * @param identity The address of the DID that already exists
 */
error DidAlreadyExist(address identity);

//--------------------------------------------------------------------------
// DID STATE ERRORS
//--------------------------------------------------------------------------

/**
 * @dev Error that occurs when trying to perform an operation with a deactivated DID
 * @param identity The address of the deactivated DID
 * @param operationName The name of the operation that was attempted
 */
error DidHasBeenDeactivated(address identity, string operationName);

//--------------------------------------------------------------------------
// DID FORMAT ERRORS
//--------------------------------------------------------------------------

/**
 * @dev Error that occurs when the DID document structure is invalid
 * @param reason Description of what validation failed
 */
error InvalidDidDocument(string reason);

/**
 * @dev Error that occurs when a DID document hash verification fails
 * @param providedHash The hash that was provided
 * @param storedHash The hash that was stored
 */
error DidHashMismatch(bytes32 providedHash, bytes32 storedHash, string reason);

//--------------------------------------------------------------------------
// AUTHORIZATION ERRORS
//--------------------------------------------------------------------------

/**
 * @dev Error that occurs when an identity operation is performed by a non-owner account
 * @param actor The address that attempted the operation
 * @param identity The address of the DID being operated on
 */
error NotIdentityOwner(address actor, address identity);

/**
 * @dev Error that occurs when the issuer and holder DIDs are identical
 * @param issuerDid The issuer Decentralized Identifier (DID)
 * @param holderDid The holder Decentralized Identifier (DID)
 */
error IdenticalDidAddress(bytes32 issuerDid, bytes32 holderDid, string reason);