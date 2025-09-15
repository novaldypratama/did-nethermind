// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @dev Error thrown when an account is not authorized to perform an action
 * @param sender The unauthorized account address
 */
error Unauthorized(address sender);

/**
 * @dev Error thrown when attempting to assign an invalid role
 * @param role The invalid role ID
 */
error InvalidRole(uint8 role);

/**
 * @dev Error thrown when attempting to perform an action on a non-existent role
 * @param role The role ID that does not exist
 */
error RoleNotFound(uint8 role);

/**
 * @dev Error thrown when attempting to assign a role to an address that already has it
 * @param account The account address
 * @param role The role ID
 */
error RoleAlreadyAssigned(address account, uint8 role);