// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITokenRecipient {
    function onTransferReceived(
        address operator,
        address from,
        uint256 value,
        bytes calldata data
    ) external returns (bytes4);
}
