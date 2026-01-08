// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./4_ITokenRecipient.sol";

contract SmartTokenBank is ITokenRecipient {
    using SafeERC20 for IERC20;

    address public admin;
    bool public paused;

    // token -> user -> principal
    mapping(address => mapping(address => uint256)) public balances;              //本金
    // token -> user -> accrued interest
    mapping(address => mapping(address => uint256)) public accruedInterest;       //结算好的利息
    // token -> user -> last deposit/settlement timestamp
    mapping(address => mapping(address => uint256)) public depositTimestamps;     //上次结算时间
    // token -> total actual deposits
    mapping(address => uint256) public totalDeposits;                             //代币总存款
    
    //利息相关的常量
    // 0.1% per day = 1/1000 per day
    uint256 public constant INTEREST_RATE_NUMERATOR = 1;
    uint256 public constant INTEREST_RATE_DENOMINATOR = 1000;
    uint256 public constant SECONDS_PER_DAY = 86400;

    event Deposit(address indexed token, address indexed user, uint256 amount);   //五个事件
    event Withdraw(
        address indexed token,
        address indexed user,
        uint256 principal,
        uint256 interest
    );
    event Paused(address indexed admin);
    event Unpaused(address indexed admin);
    event OwnershipTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    //修饰器

    modifier onlyAdmin() {
        require(msg.sender == admin, "SmartTokenBank: caller is not admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "SmartTokenBank: contract is paused");
        _;
    }

    modifier whenPaused() {
        require(paused, "SmartTokenBank: contract is not paused");
        _;
    }

    //构造函数
    constructor() {
        admin = msg.sender;
        paused = false;
    }

    // ==================== Admin Functions ====================   管理员函数

    function pause() external onlyAdmin whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyAdmin whenPaused {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function transferOwnership(address newAdmin) external onlyAdmin {
        require(
            newAdmin != address(0),
            "SmartTokenBank: new admin is zero address"
        );
        require(
            newAdmin != admin,
            "SmartTokenBank: new admin is same as current"
        );

        address previousAdmin = admin;
        admin = newAdmin;

        emit OwnershipTransferred(previousAdmin, newAdmin);
    }

    // ==================== Core Functions ====================  核心函数

    function deposit(address token, uint256 amount) external whenNotPaused {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Deposit amount must be greater than 0");

        // Settle pending interest before adding new deposit
        _settleInterest(token, msg.sender);

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        balances[token][msg.sender] += amount;
        totalDeposits[token] += amount;
        depositTimestamps[token][msg.sender] = block.timestamp;

        emit Deposit(token, msg.sender, amount);
    }

    function withdraw(address token, uint256 amount) external whenNotPaused {
        require(token != address(0), "Invalid token address");
        require(amount > 0, "Withdraw amount must be greater than 0");

        // Settle pending interest first
        _settleInterest(token, msg.sender);

        uint256 principal = balances[token][msg.sender];         //本金
        uint256 interest = accruedInterest[token][msg.sender];   //利息
        uint256 totalAvailable = principal + interest;           //总金额

        require(amount <= totalAvailable, "Insufficient balance");

        // Deduct from interest first, then from principal
        uint256 interestUsed = 0;
        uint256 principalUsed = 0;

        if (amount <= interest) {
            // Only use interest
            interestUsed = amount;
        } else {
            // Use all interest + some principal
            interestUsed = interest;
            principalUsed = amount - interest;
        }

        // Update state
        accruedInterest[token][msg.sender] -= interestUsed;
        balances[token][msg.sender] -= principalUsed;
        totalDeposits[token] -= principalUsed;

        // Reset timestamp if still has principal
        if (balances[token][msg.sender] > 0) {
            depositTimestamps[token][msg.sender] = block.timestamp;
        } else {
            depositTimestamps[token][msg.sender] = 0;
        }

        // Transfer to user
        IERC20(token).safeTransfer(msg.sender, amount);

        emit Withdraw(token, msg.sender, principalUsed, interestUsed);
    }

    function onTransferReceived(
        address,
        address from,
        uint256 value,
        bytes calldata
    ) external whenNotPaused returns (bytes4) {
        require(
            _isContract(msg.sender),
            "SmartTokenBank: caller must be a contract"
        );

        address token = msg.sender;

        // Validate actual token transfer
        uint256 contractBalance = IERC20(token).balanceOf(address(this));
        uint256 expectedBalance = totalDeposits[token] + value;
        require(
            contractBalance >= expectedBalance,
            "SmartTokenBank: actual received less than claimed value"
        );

        // Settle pending interest before adding new deposit
        _settleInterest(token, from);

        balances[token][from] += value;
        totalDeposits[token] += value;
        depositTimestamps[token][from] = block.timestamp;

        emit Deposit(token, from, value);

        return ITokenRecipient.onTransferReceived.selector;
    }

    // ==================== Interest Functions ====================

    /**
     * @notice Calculate pending interest (not yet settled)
     */
     //待结算利息计算器：只算完整天、基于当前本金和上次结算时间，返回你“还没落袋但已经赚到”的利息。
    function calculatePendingInterest(
        address token,
        address user
    ) public view returns (uint256) {
        uint256 principal = balances[token][user];
        uint256 depositTime = depositTimestamps[token][user];

        if (principal == 0 || depositTime == 0) {
            return 0;
        }

        uint256 timeElapsed = block.timestamp - depositTime;
        uint256 daysElapsed = timeElapsed / SECONDS_PER_DAY;

        if (daysElapsed == 0) {
            return 0;
        }

        uint256 interest = (principal * daysElapsed * INTEREST_RATE_NUMERATOR) /
            INTEREST_RATE_DENOMINATOR;

        return interest;
    }

    /**
     * @notice Get total interest (settled + pending)
     */
     //总收益是多少
    function getTotalInterest(
        address token,
        address user
    ) public view returns (uint256) {
        return
            accruedInterest[token][user] +
            calculatePendingInterest(token, user);
    }

    /**
     * @notice Get complete balance info
     */
    function getBalanceInfo(
        address token,
        address user
    )
        external
        view
        returns (
            uint256 principal,
            uint256 settledInterest,
            uint256 pendingInterest,
            uint256 totalInterest,
            uint256 total
        )
    {
        principal = balances[token][user];
        settledInterest = accruedInterest[token][user];
        pendingInterest = calculatePendingInterest(token, user);
        totalInterest = settledInterest + pendingInterest;
        total = principal + totalInterest;
    }

    /**
     * @dev Settle pending interest to accruedInterest
     */
     //一次性返回本金、已赚利息、正在赚的利息、总收益、总资产，让用户和前端对存款情况一目了然
    function _settleInterest(address token, address user) internal {
        uint256 pending = calculatePendingInterest(token, user);
        if (pending > 0) {
            accruedInterest[token][user] += pending;
        }
        // Reset timestamp for next calculation period
        if (balances[token][user] > 0) {
            depositTimestamps[token][user] = block.timestamp;
        }
    }

    // ==================== View Functions ==================== 查看函数

    function _isContract(address account) internal view returns (bool) {
        return account.code.length > 0;
    }

    function getBalance(
        address token,
        address user
    ) external view returns (uint256) {
        return balances[token][user];
    }

    function getBalances(
        address[] calldata tokens,
        address user
    ) external view returns (uint256[] memory) {
        uint256[] memory userBalances = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            userBalances[i] = balances[tokens[i]][user];
        }
        return userBalances;
    }

    function getDepositTimestamp(
        address token,
        address user
    ) external view returns (uint256) {
        return depositTimestamps[token][user];
    }
}
