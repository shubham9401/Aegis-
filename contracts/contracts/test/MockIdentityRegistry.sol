// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @notice Local tests only; NOT a full ERC-8004 registry or a testnet fallback.
contract MockIdentityRegistry is ERC721 {
    uint256 public nextAgentId;
    constructor() ERC721("Mock agent identities", "MOCK-ID") {}
    function register() external returns (uint256 id) {
        id = nextAgentId++;
        _mint(msg.sender, id);
    }
}
