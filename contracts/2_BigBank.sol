// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./1_EtherBank.sol";
import "./2_IBank.sol";

contract BigBank is EtherBank, IBank {
    uint256 public constant MIN_DEPOSIT = 0.001 ether;

    event OwnershipTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    modifier minDepositAmount() {
        require(
            msg.value >= MIN_DEPOSIT,
            "Deposit amount must be at least 0.001 ETH"
        );
        _;
    }

    function deposit() public payable override minDepositAmount {
        super.deposit();
    }

    function withdraw(
        uint256 amount
    ) public override(EtherBank, IBank) onlyAdmin {
        super.withdraw(amount);
    }

    function transferOwnership(address newAdmin) public onlyAdmin {
        require(newAdmin != address(0), "New admin cannot be zero address");
        require(newAdmin != admin, "New admin is the same as current admin");

        address previousAdmin = admin;
        admin = newAdmin;

        emit OwnershipTransferred(previousAdmin, newAdmin);
    }
}