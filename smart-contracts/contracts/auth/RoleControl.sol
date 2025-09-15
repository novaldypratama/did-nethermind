// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import { Unauthorized, InvalidRole, RoleNotFound } from "./AuthErrors.sol";
import { IRoleControl } from "./IRoleControl.sol";

/**
 * @title RoleControl
 * @dev Implementation of the SSI Trust Triangle role system.
 * Manages roles for Issuers, Holders, and Trustees in a W3C-compliant SSI ecosystem.
 */
contract RoleControl is IRoleControl {
    /**
     * @dev Mapping of accounts to their assigned roles
     */
    mapping(address account => ROLES role) private _roles;

    /**
     * @dev Mapping of roles to their manager roles
     */
    mapping(ROLES role => ROLES ownerRole) private _roleOwners;

    /**
     * @dev Count of accounts with each role
     */
    mapping(ROLES role => uint32 count) private _roleCounts;

    /**
     * @dev Modifier that checks if the sender has permission to manage a role
     */
    modifier onlyRoleOwner(ROLES role) {
        ROLES ownerRole = _roleOwners[role];
        if (!hasRole(ownerRole, msg.sender)) revert Unauthorized(msg.sender);
        _;
    }

    /**
     * @dev Constructor that sets up the initial role hierarchy and assigns
     * the deployer as a TRUSTEE.
     */
    constructor() {
        // Set up role management hierarchy
        _roleOwners[ROLES.TRUSTEE] = ROLES.TRUSTEE;
        _roleOwners[ROLES.ISSUER] = ROLES.TRUSTEE;
        _roleOwners[ROLES.HOLDER] = ROLES.TRUSTEE;

        // Assign deployer as TRUSTEE
        _roles[msg.sender] = ROLES.TRUSTEE;
        _roleCounts[ROLES.TRUSTEE]++;

        emit RoleAssigned(ROLES.TRUSTEE, msg.sender, msg.sender);
    }

    /// @inheritdoc IRoleControl
    function assignRole(ROLES role, address account)
        public
        virtual
        onlyRoleOwner(role)
        returns (ROLES)
    {
        // Validate role is within enum range
        if (uint8(role) == 0 || uint8(role) > 3) revert InvalidRole(uint8(role));

        // Check if account already has this role
        if (_roles[account] == role) return role;

        // If account has a different role, revoke it first
        if (_roles[account] != ROLES.EMPTY) {
            ROLES oldRole = _roles[account];
            _roleCounts[oldRole]--;
        }

        // Assign new role
        _roles[account] = role;
        _roleCounts[role]++;

        emit RoleAssigned(role, account, msg.sender);
        return role;
    }

    /// @inheritdoc IRoleControl
    function revokeRole(ROLES role, address account)
        public
        virtual
        onlyRoleOwner(role)
        returns (bool)
    {
        if (_roles[account] == role) {
            delete _roles[account];
            _roleCounts[role]--;

            emit RoleRevoked(role, account, msg.sender);
            return true;
        }
        return false;
    }

    /// @inheritdoc IRoleControl
    function hasRole(ROLES role, address account) public view virtual returns (bool) {
        return _roles[account] == role;
    }

    /// @inheritdoc IRoleControl
    function getRole(address account) public view virtual returns (ROLES) {
        return _roles[account];
    }

    /// @inheritdoc IRoleControl
    function getRoleCount(ROLES role) public view virtual returns (uint32) {
        return _roleCounts[role];
    }

    /// @inheritdoc IRoleControl
    function isTrustee(address identity) public view virtual {
        if (_roles[identity] != ROLES.TRUSTEE) revert Unauthorized(identity);
    }

    /// @inheritdoc IRoleControl
    function isIssuer(address identity) public view virtual {
        if (_roles[identity] != ROLES.ISSUER) revert Unauthorized(identity);
    }

    /// @inheritdoc IRoleControl
    function isHolder(address identity) public view virtual {
        if (_roles[identity] != ROLES.HOLDER) revert Unauthorized(identity);
    }

    /// @inheritdoc IRoleControl
    function isTrusteeOrIssuer(address identity) public view virtual {
        ROLES role = _roles[identity];
        if (role != ROLES.TRUSTEE && role != ROLES.ISSUER) {
            revert Unauthorized(identity);
        }
    }

    /// @inheritdoc IRoleControl
    function isTrusteeOrIssuerOrHolder(address identity) public view virtual {
        ROLES role = _roles[identity];
        if (role != ROLES.ISSUER && role != ROLES.TRUSTEE && role != ROLES.HOLDER) revert Unauthorized(identity);
    }
}
