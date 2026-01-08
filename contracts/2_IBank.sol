// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IBank {
    /**
     * @notice 提款函数接口
     * @param amount 提款金额
     */
    function withdraw(uint256 amount) external;
}
