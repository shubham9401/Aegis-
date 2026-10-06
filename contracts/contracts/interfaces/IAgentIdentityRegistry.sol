// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice ERC-721 ownership surface of the ERC-8004 identity registry.
/// @dev Aegis v0.1 accepts only the registered owner as the agent's transaction signer.
interface IAgentIdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
}
