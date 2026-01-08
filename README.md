
ZZJ-2025

### 阶段一：基础 ETH 银行 (40%)

开发一个名为 `EtherBank` 的智能合约，实现以下功能：

#### 功能需求

1. **用户存款**

   - 用户可以调用 `deposit()` 函数存入 ETH
   - 用户也可以直接向合约地址转账 ETH（自动触发存款）
   - 每次存款需要大于 0
   - 记录每个用户的总存款金额

2. **存款排行榜**

   - 系统自动追踪存款金额最高的前 3 名用户
   - 每次有新存款时，自动更新排行榜
   - 提供查询函数获取当前前 3 名用户地址

3. **管理员权限**

   - 合约部署者自动成为管理员
   - 只有管理员可以从合约提取 ETH
   - 使用 `modifier` 实现权限检查

4. **查询功能**
   - 查询合约的总余额
   - 查询指定用户的存款余额
   - 查询前 3 名存款用户

---

### 阶段二：银行升级版 (30%)

创建一个名为 `BigBank` 的合约，继承自 `EtherBank`，增加以下功能：

#### 功能需求

1. **最低存款限制**

   - BigBank 要求每次存款至少 0.001 ETH
   - 小于此金额的存款应该被拒绝
   - 使用 `modifier` 实现检查
   - 使用 `override` 改写父合约的 `deposit()` 函数

2. **管理员权限转移**

   - 当前管理员可以将权限转移给新地址
   - 新管理员地址不能是零地址
   - 实现 `transferOwnership(address newAdmin)` 函数

3. **接口标准化**
   - 定义一个 `IBank` 接口，包含 `withdraw` 函数
   - `BigBank` 应该实现这个接口

---

### 阶段三：多代币银行 (30%)

创建一个新的 `TokenBank` 合约，支持用户存入和提取 ERC20 代币：

#### 功能需求

1. **多代币支持**

   - 用户可以存入任何 ERC20 代币
   - 系统需要同时追踪多种代币的余额
   - 每个用户对每种代币都有独立的余额

2. **存款功能**

   - 实现 `deposit(address token, uint256 amount)` 函数
   - 用户需要先授权 TokenBank 使用其代币
   - 使用 `transferFrom` 将代币从用户转移到合约
   - 更新用户在该代币的余额记录

3. **提款功能**

   - 实现 `withdraw(address token, uint256 amount)` 函数
   - 检查用户余额是否充足
   - 使用 `transfer` 将代币转回给用户

4. **事件记录**
   - 存款时触发 `Deposit` 事件
   - 提款时触发 `Withdraw` 事件
   - 事件应该包含代币地址、用户地址、金额

---

## 加分项：高级功能 (可选，+20%)

如果你完成了基础功能，可以尝试以下高级特性：

### 1. transferAndCall 机制

创建一个增强版的 ERC20 代币 `SmartToken`，支持 `transferAndCall` 功能：

**需求：**

- 用户调用 `token.transferAndCall(bankAddress, amount)`
- 代币自动转账到 TokenBank
- 同时触发 TokenBank 的回调函数 `onTransferReceived`
- TokenBank 自动记录用户余额，无需用户再调用 `deposit`

**技术要点：**

- 实现 `ITokenRecipient` 接口
- 检测接收地址是否为合约
- 安全处理回调失败情况

### 2. 利息计算

为 EtherBank 添加简单的利息机制：

- 记录用户存款时间
- 按存款时长计算利息（例如：每天 0.1%）
- 提款时自动发放利息

### 3. 紧急暂停

添加紧急暂停功能：

- 管理员可以暂停所有存款和提款操作
- 使用 `Pausable` 模式
- 只有管理员可以恢复


最新
 修改 TokenBank 合约 
添加 permitDeposit 函数，支持离线签名授权进行存款
创建支持 permit 的 ERC20 代币用于测试
测试用例：
正常签名存款成功
签名过期应失败
无效签名应失败
(hardhat使用ts/js测试，foundry使用solidity测试)