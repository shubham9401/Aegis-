// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Freely mintable demo asset; no dollar value, backing or production use.
contract MockUSD is ERC20 {
    constructor() ERC20("Aegis Test USD - No Value", "aUSD-TEST") {}
    function decimals() public pure override returns (uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}
