// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./4_ITokenRecipient.sol";

contract SmartToken is ERC20 {
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }

    function _isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }

    function transferAndCall(
        address to,
        uint256 value
    ) external returns (bool) {
        transfer(to, value);
        _invokeTokenReceived(msg.sender, to, value, "");
        return true;
    }

    function transferFromAndCall(
        address from,
        address to,
        uint256 value,
        bytes calldata data
    ) external returns (bool) {
        transferFrom(from, to, value); // 需要先approve
        _invokeTokenReceived(from, to, value, data);
        return true;
    }

    function _invokeTokenReceived(
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (_isContract(to)) {
            try
                ITokenRecipient(to).onTransferReceived(
                    msg.sender,
                    from,
                    value,
                    data
                )
            returns (bytes4 response) {
                require(
                    response == ITokenRecipient.onTransferReceived.selector,
                    "SmartToken: invalid return value"
                );
            } catch Error(string memory reason) {
                revert(reason);
            } catch {
                revert(
                    "SmartToken: onTransferReceived failed or not implemented"
                );
            }
        }
    }
}
