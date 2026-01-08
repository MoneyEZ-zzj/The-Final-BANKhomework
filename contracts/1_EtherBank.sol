// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract EtherBank {
    mapping(address => uint256) public balances;
    address[3] public topDepositors;
    address public admin;

    event Deposit(address indexed user, uint256 amount);
    event Withdraw(address indexed admin, uint256 amount);

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can call this function");
        _;
    }

    function deposit() public payable virtual {
        require(msg.value > 0, "Deposit amount must be greater than 0");

        balances[msg.sender] += msg.value;
        updateTopDepositors(msg.sender, balances[msg.sender]);
        emit Deposit(msg.sender, msg.value);
    }

    function updateTopDepositors(
        address depositor,
        uint256 newBalance
    ) private {
        // 1. 检查是否已在榜单中
        for (uint256 i = 0; i < topDepositors.length; i++) {
            if (topDepositors[i] == depositor) {
                // 用户已在榜单，只需要检查是否需要"向上冒泡"
                // 因为是存款，余额只会增加，排名只可能上升，不可能下降
                for (uint256 j = i; j > 0; j--) {
                    address preUser = topDepositors[j - 1];
                    if (balances[preUser] < newBalance) {
                        // 需要向上冒泡
                        topDepositors[j] = preUser;
                        topDepositors[j - 1] = depositor;
                    } else {
                        // 已经到位，无需继续
                        break;
                    }
                }

                return;
            }
        }

        // 2. 如果不在榜单中，检查是否够资格进入
        // 只有比第 3 名（最后一名）大才能进
        address lastUser = topDepositors[topDepositors.length - 1];
        if (newBalance <= balances[lastUser] && lastUser != address(0)) {
            return;
        }

        // 3. 插入新用户（正序查找插入点）
        // 此时我们确定他比最后一名大，或者最后一名是空
        for (uint256 i = 0; i < topDepositors.length; i++) {
            if (balances[topDepositors[i]] < newBalance || topDepositors[i] == address(0)) {
                // 找到插入点 i
                // 将 i 及之后的用户后移一位
                for (uint256 j = topDepositors.length - 1; j > i; j--) {
                    topDepositors[j] = topDepositors[j - 1];
                }
                // 插入新用户
                topDepositors[i] = depositor;
                return;
            }
        }
    }

    function withdraw(uint256 amount) public virtual onlyAdmin {
        require(
            amount <= address(this).balance,
            "Insufficient contract balance"
        );
        payable(admin).transfer(amount);
        emit Withdraw(admin, amount);                                               
    }

    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function getTopDepositors() public view returns (address[3] memory) {
        return topDepositors;
    }

    receive() external payable {
        deposit();
    }

    fallback() external payable {
        deposit();
    }
}

// 完成作业