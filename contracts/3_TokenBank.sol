// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

contract TokenBank {
    using SafeERC20 for IERC20;

    // user -> token -> balances
    mapping(address => mapping(address => uint256)) public balances;

    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token, address indexed user, uint256 amount);

    /**
     * @dev 用户需要先调用代币合约的 approve() 授权
     */
    function deposit(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        balances[msg.sender][token] += amount;
        emit Deposit(token, msg.sender, amount);
    }

    /**
     * @dev 使用 EIP-2612 permit 签名进行授权 + 存款
     * @param token 代币地址
     * @param amount 存款数量
     * @param deadline 签名过期时间戳
     * @param v,r,s 签名组件
     * @param owner 签名所属的用户（通常是存款人自己）
     */
    function permitDeposit(
        address token,        //合约地址
        uint256 amount,       //数量
        uint256 deadline,     //签名最晚什么时候有效
        uint8 v,              //
        bytes32 r,
        bytes32 s,
        address owner         //这个签名是“谁”签的，谁的代币会被扣除、谁的余额会增加
    ) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(block.timestamp <= deadline, "Permit expired");

        // 1. 调用目标代币的 permit 函数，让它记录 owner 授权 TokenBank 转移 amount
        IERC20Permit(token).permit(
            owner,              // 签名人
            address(this),      // 授权给 TokenBank 合约
            amount,             // 授权数量
            deadline,
            v,
            r,
            s
        );

        // 2. 现在授权已经生效，可以安全转账，IERC20Permit没有safeTransferFrom这个函数的，就像人可以说普通话和英文
        IERC20(token).safeTransferFrom(owner, address(this), amount);

        // 3. 更新银行内部记账（注意：记账用 owner，而不是 msg.sender）
        balances[owner][token] += amount;

        // 4. 发出事件（记录 owner 而不是 msg.sender）
        emit Deposit(token, owner, amount);
    }

    function withdraw(address token, uint256 amount) external {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Amount must be greater than 0");
        require(balances[msg.sender][token] >= amount, "Insufficient balance");

        balances[msg.sender][token] -= amount;

        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdraw(token, msg.sender, amount);
    }

    function getBalance(
        address token,
        address user
    ) external view returns (uint256) {
        return balances[user][token];
    }

    function getBalances(
        address[] calldata tokens,
        address user
    ) external view returns (uint256[] memory) {
        uint256[] memory userBalances = new uint256[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            userBalances[i] = balances[user][tokens[i]];
        }

        return userBalances;
    }
}