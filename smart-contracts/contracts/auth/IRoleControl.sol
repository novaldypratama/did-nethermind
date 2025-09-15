// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

/**
 * @dev The interface for managing account roles in the SSI Trust Triangle.
 */
interface IRoleControl {
    /**
     * @dev List of available roles in the SSI Trust Triangle.
     * EMPTY: Default for accounts with no roles
     * ISSUER: Entity that creates and issues verifiable credentials
     * HOLDER: Entity that receives and manages credentials
     * TRUSTEE: Administrative role with highest system permissions
     */
    enum ROLES {
        EMPTY,
        ISSUER,
        HOLDER,
        TRUSTEE
    }

    /**
     * @dev Event emitted when a role is assigned to an account.
     */
    event RoleAssigned(ROLES role, address indexed account, address indexed sender);

    /**
     * @dev Event emitted when a role is revoked from an account.
     */
    event RoleRevoked(ROLES role, address indexed account, address indexed sender);

    /**
     * @dev Assigns a role to an account.
     * @param role The role to be assigned
     * @param account The address to assign the role to
     * @return assignedRole The assigned role
     */
    function assignRole(ROLES role, address account) external returns (ROLES assignedRole);

    /**
     * @dev Revokes a role from an account.
     * @param role The role to be revoked
     * @param account The address to revoke the role from
     * @return success Whether the revocation was successful
     */
    function revokeRole(ROLES role, address account) external returns (bool);

    /**
     * @dev Checks if an account has a specific role.
     * @param role The role to check
     * @param account The address to check
     * @return hasRole Whether the account has the role
     */
    function hasRole(ROLES role, address account) external view returns (bool);

    /**
     * @dev Returns the number of accounts with a specific role.
     * @param role The role to count
     * @return count The number of accounts with the role
     */
    function getRoleCount(ROLES role) external view returns (uint32);

    /**
     * @dev Gets the role assigned to an account.
     * @param account The address to check
     * @return role The role assigned to the account
     */
    function getRole(address account) external view returns (ROLES);

    /**
     * @dev Checks if an account has the TRUSTEE role.
     * Reverts if the account does not have the role.
     */
    function isTrustee(address identity) external view;

    /**
     * @dev Checks if an account has the ISSUER role.
     * Reverts if the account does not have the role.
     */
    function isIssuer(address identity) external view;

    /**
     * @dev Checks if an account has the HOLDER role.
     * Reverts if the account does not have the role.
     */
    function isHolder(address identity) external view;

    /**
     * @dev Checks if an account has either TRUSTEE or ISSUER role.
     * Reverts if the account does not have either role.
     */
    function isTrusteeOrIssuer(address identity) external view;

    /**
     * @dev Function to check that identity has either TRUSTEE or ISSUER or HOLDER role.
     * Reverts if the account does not have either role.
     */
    function isTrusteeOrIssuerOrHolder(address identity) external view;

}
