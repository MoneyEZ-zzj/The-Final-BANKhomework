const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TokenBank with Permit", function () {
  let tokenBank, testToken;
  let owner, user1, user2;
  let deadline, chainId;

  beforeEach(async function () {
    // 获取账户
    [owner, user1, user2] = await ethers.getSigners();
    
    // 部署代币合约
    const TestPermitToken = await ethers.getContractFactory("TestPermitToken");
    testToken = await TestPermitToken.deploy();
    
    // 部署TokenBank合约
    const TokenBank = await ethers.getContractFactory("TokenBank");
    tokenBank = await TokenBank.deploy();
    
    // 获取链ID
    chainId = (await ethers.provider.getNetwork()).chainId;
    
    // 设置deadline为10分钟后
    deadline = Math.floor(Date.now() / 1000) + 600;
    
    // 给user1转账一些代币用于测试
    await testToken.connect(owner).transfer(user1.address, ethers.parseEther("1000"));
  });

  describe("常规存款/取款测试", function () {
    it("应该允许用户正常存款", async function () {
      const amount = ethers.parseEther("100");
      const tokenAddress = await testToken.getAddress();
      
      // 先授权
      await testToken.connect(user1).approve(await tokenBank.getAddress(), amount);
      
      // 存款
      await expect(
        tokenBank.connect(user1).deposit(tokenAddress, amount)
      )
        .to.emit(tokenBank, "Deposit")
        .withArgs(tokenAddress, user1.address, amount);
      
      // 验证余额
      const balance = await tokenBank.balances(user1.address, tokenAddress);
      expect(balance).to.equal(amount);
    });
    
    it("应该允许用户正常取款", async function () {
      const depositAmount = ethers.parseEther("100");
      const withdrawAmount = ethers.parseEther("50");
      const tokenAddress = await testToken.getAddress();
      
      // 存款
      await testToken.connect(user1).approve(await tokenBank.getAddress(), depositAmount);
      await tokenBank.connect(user1).deposit(tokenAddress, depositAmount);
      
      // 取款
      await expect(
        tokenBank.connect(user1).withdraw(tokenAddress, withdrawAmount)
      )
        .to.emit(tokenBank, "Withdraw")
        .withArgs(tokenAddress, user1.address, withdrawAmount);
      
      // 验证余额
      const balance = await tokenBank.balances(user1.address, tokenAddress);
      expect(balance).to.equal(depositAmount - withdrawAmount);
    });
    
    it("应该拒绝余额不足的取款", async function () {
      const tokenAddress = await testToken.getAddress();
      const depositAmount = ethers.parseEther("100");
      const excessAmount = ethers.parseEther("200");
      
      // 存款
      await testToken.connect(user1).approve(await tokenBank.getAddress(), depositAmount);
      await tokenBank.connect(user1).deposit(tokenAddress, depositAmount);
      
      // 尝试提取超过余额的金额
      await expect(
        tokenBank.connect(user1).withdraw(tokenAddress, excessAmount)
      ).to.be.revertedWith("Insufficient balance");
    });
  });

  describe("Permit存款测试 - 成功场景", function () {
    it("应该允许使用有效签名进行存款", async function () {
      const depositAmount = ethers.parseEther("100");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      // 准备签名数据
      const nonce = await testToken.nonces(user1.address);
      const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      const value = {
        owner: user1.address,
        spender: bankAddress,
        value: depositAmount,
        nonce: nonce,
        deadline: deadline,
      };
      
      // 签名
      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      // 使用permit存款
      await expect(
        tokenBank.connect(user1).permitDeposit(
          tokenAddress,
          depositAmount,
          deadline,
          sig.v, sig.r, sig.s,
          user1.address
        )
      )
        .to.emit(tokenBank, "Deposit")
        .withArgs(tokenAddress, user1.address, depositAmount);
      
      // 验证余额
      const balance = await tokenBank.balances(user1.address, tokenAddress);
      expect(balance).to.equal(depositAmount);
      
      // 验证nonce增加
      const newNonce = await testToken.nonces(user1.address);
      expect(newNonce).to.equal(nonce + 1n);
    });
    
    it("应该允许第三方使用签名进行存款", async function () {
      const depositAmount = ethers.parseEther("200");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      // 准备签名数据
      const nonce = await testToken.nonces(user1.address);
      const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      const value = {
        owner: user1.address,
        spender: bankAddress,
        value: depositAmount,
        nonce: nonce,
        deadline: deadline,
      };
      
      // user1签名
      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      // user2使用user1的签名进行存款
      await expect(
        tokenBank.connect(user2).permitDeposit(
          tokenAddress,
          depositAmount,
          deadline,
          sig.v, sig.r, sig.s,
          user1.address  // owner是user1
        )
      )
        .to.emit(tokenBank, "Deposit")
        .withArgs(tokenAddress, user1.address, depositAmount);
      
      // 验证user1的余额
      const balance = await tokenBank.balances(user1.address, tokenAddress);
      expect(balance).to.equal(depositAmount);
    });
    
    it("应该处理多次Permit存款", async function () {
      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("200");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      // 第一次存款
      let nonce = await testToken.nonces(user1.address);
      let domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      let types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      let value = {
        owner: user1.address,
        spender: bankAddress,
        value: amount1,
        nonce: nonce,
        deadline: deadline,
      };
      
      let signature = await user1.signTypedData(domain, types, value);
      let sig = ethers.Signature.from(signature);
      
      await tokenBank.connect(user1).permitDeposit(
        tokenAddress,
        amount1,
        deadline,
        sig.v, sig.r, sig.s,
        user1.address
      );
      
      // 第二次存款
      nonce = await testToken.nonces(user1.address);
      value = {
        owner: user1.address,
        spender: bankAddress,
        value: amount2,
        nonce: nonce,
        deadline: deadline,
      };
      
      signature = await user1.signTypedData(domain, types, value);
      sig = ethers.Signature.from(signature);
      
      await tokenBank.connect(user1).permitDeposit(
        tokenAddress,
        amount2,
        deadline,
        sig.v, sig.r, sig.s,
        user1.address
      );
      
      // 验证总余额
      const balance = await tokenBank.balances(user1.address, tokenAddress);
      expect(balance).to.equal(amount1 + amount2);
    });
  });

  describe("Permit存款测试 - 失败场景", function () {
    it("应该拒绝过期的签名", async function () {
      const depositAmount = ethers.parseEther("100");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      const expiredDeadline = Math.floor(Date.now() / 1000) - 600;
      
      const nonce = await testToken.nonces(user1.address);
      const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      const value = {
        owner: user1.address,
        spender: bankAddress,
        value: depositAmount,
        nonce: nonce,
        deadline: expiredDeadline,
      };
      
      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      // 应该失败
      await expect(
        tokenBank.connect(user1).permitDeposit(
          tokenAddress,
          depositAmount,
          expiredDeadline,
          sig.v, sig.r, sig.s,
          user1.address
        )
      ).to.be.revertedWith("Permit expired");
    });
    
    it("应该拒绝无效的签名（错误的签名者）", async function () {
      const depositAmount = ethers.parseEther("100");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      const nonce = await testToken.nonces(user1.address);
      const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      const value = {
        owner: user1.address,
        spender: bankAddress,
        value: depositAmount,
        nonce: nonce,
        deadline: deadline,
      };
      
      // user2尝试使用user1的数据签名
      const signature = await user2.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      // 应该失败（签名验证失败）
      await expect(
        tokenBank.connect(user1).permitDeposit(
          tokenAddress,
          depositAmount,
          deadline,
          sig.v, sig.r, sig.s,
          user1.address
        )
      ).to.be.reverted; // 签名验证失败
    });
    
    it("应该拒绝重放攻击（重复使用签名）", async function () {
      const depositAmount = ethers.parseEther("100");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      const nonce = await testToken.nonces(user1.address);
      const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      const value = {
        owner: user1.address,
        spender: bankAddress,
        value: depositAmount,
        nonce: nonce,
        deadline: deadline,
      };
      
      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      // 第一次使用签名 - 应该成功
      await tokenBank.connect(user1).permitDeposit(
        tokenAddress,
        depositAmount,
        deadline,
        sig.v, sig.r, sig.s,
        user1.address
      );
      
      // 第二次使用相同的签名 - 应该失败（nonce已增加）
      await expect(
        tokenBank.connect(user1).permitDeposit(
          tokenAddress,
          depositAmount,
          deadline,
          sig.v, sig.r, sig.s,
          user1.address
        )
      ).to.be.reverted; // 签名验证失败
    });
    
    it("应该拒绝金额为0的存款", async function () {
      const tokenAddress = await testToken.getAddress();
      
      // 应该失败
      await expect(
        tokenBank.connect(user1).permitDeposit(
          tokenAddress,
          0,
          deadline,
          27,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          user1.address
        )
      ).to.be.revertedWith("Amount must be greater than 0");
    });
    
    it("应该拒绝无效的代币地址", async function () {
      const depositAmount = ethers.parseEther("100");
      
      // 使用零地址
      await expect(
        tokenBank.connect(user1).permitDeposit(
          ethers.ZeroAddress,
          depositAmount,
          deadline,
          27,
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          "0x0000000000000000000000000000000000000000000000000000000000000000",
          user1.address
        )
      ).to.be.revertedWith("Invalid token address");
    });
    
    it("应该拒绝签名金额与存款金额不匹配", async function () {
      const signedAmount = ethers.parseEther("100");
      const depositAmount = ethers.parseEther("200"); // 不同的金额
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      const nonce = await testToken.nonces(user1.address);
      const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      // 为100金额签名
      const value = {
        owner: user1.address,
        spender: bankAddress,
        value: signedAmount,
        nonce: nonce,
        deadline: deadline,
      };
      
      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      // 尝试存款200 - 应该失败
      await expect(
        tokenBank.connect(user1).permitDeposit(
          tokenAddress,
          depositAmount, // 传递不同的金额
          deadline,
          sig.v, sig.r, sig.s,
          user1.address
        )
      ).to.be.reverted; // 签名验证失败
    });
  });

  describe("查询功能测试", function () {
    it("应该正确查询单个代币余额", async function () {
      const tokenAddress = await testToken.getAddress();
      const amount = ethers.parseEther("100");
      
      // 存款
      await testToken.connect(user1).approve(await tokenBank.getAddress(), amount);
      await tokenBank.connect(user1).deposit(tokenAddress, amount);
      
      // 查询余额
      const balance = await tokenBank.getBalance(tokenAddress, user1.address);
      expect(balance).to.equal(amount);
    });
    
    it("应该正确查询多个代币余额", async function () {
      // 部署第二个代币
      const TestPermitToken2 = await ethers.getContractFactory("TestPermitToken");
      const testToken2 = await TestPermitToken2.deploy();
      const token2Address = await testToken2.getAddress();
      
      // 给user1转账第二个代币
      await testToken2.connect(owner).transfer(user1.address, ethers.parseEther("500"));
      
      const token1Address = await testToken.getAddress();
      const amount1 = ethers.parseEther("100");
      const amount2 = ethers.parseEther("200");
      
      // 存款第一个代币
      await testToken.connect(user1).approve(await tokenBank.getAddress(), amount1);
      await tokenBank.connect(user1).deposit(token1Address, amount1);
      
      // 存款第二个代币
      await testToken2.connect(user1).approve(await tokenBank.getAddress(), amount2);
      await tokenBank.connect(user1).deposit(token2Address, amount2);
      
      // 查询多个代币余额
      const tokens = [token1Address, token2Address];
      const balances = await tokenBank.getBalances(tokens, user1.address);
      
      expect(balances[0]).to.equal(amount1);
      expect(balances[1]).to.equal(amount2);
      expect(balances.length).to.equal(2);
    });
  });

  describe("边缘情况测试", function () {
    it("应该正确处理Permit后余额计算", async function () {
      const depositAmount = ethers.parseEther("300");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      // 获取user1代币余额
      const initialTokenBalance = await testToken.balanceOf(user1.address);
      
      // 准备并执行Permit存款
      const nonce = await testToken.nonces(user1.address);
      const domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      const value = {
        owner: user1.address,
        spender: bankAddress,
        value: depositAmount,
        nonce: nonce,
        deadline: deadline,
      };
      
      const signature = await user1.signTypedData(domain, types, value);
      const sig = ethers.Signature.from(signature);
      
      await tokenBank.connect(user1).permitDeposit(
        tokenAddress,
        depositAmount,
        deadline,
        sig.v, sig.r, sig.s,
        user1.address
      );
      
      // 验证TokenBank中的余额
      const bankBalance = await tokenBank.balances(user1.address, tokenAddress);
      expect(bankBalance).to.equal(depositAmount);
      
      // 验证代币实际余额
      const finalTokenBalance = await testToken.balanceOf(user1.address);
      expect(finalTokenBalance).to.equal(initialTokenBalance - depositAmount);
      
      // 验证TokenBank合约持有的代币余额
      const contractBalance = await testToken.balanceOf(await tokenBank.getAddress());
      expect(contractBalance).to.equal(depositAmount);
    });
    
    it("应该允许混合使用Permit和传统存款", async function () {
      const permitAmount = ethers.parseEther("100");
      const normalAmount = ethers.parseEther("200");
      const tokenAddress = await testToken.getAddress();
      const bankAddress = await tokenBank.getAddress();
      const tokenName = await testToken.name();
      
      // 1. 使用Permit存款
      let nonce = await testToken.nonces(user1.address);
      let domain = {
        name: tokenName,
        version: "1",
        chainId: chainId,
        verifyingContract: tokenAddress,
      };
      
      let types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      
      let value = {
        owner: user1.address,
        spender: bankAddress,
        value: permitAmount,
        nonce: nonce,
        deadline: deadline,
      };
      
      let signature = await user1.signTypedData(domain, types, value);
      let sig = ethers.Signature.from(signature);
      
      await tokenBank.connect(user1).permitDeposit(
        tokenAddress,
        permitAmount,
        deadline,
        sig.v, sig.r, sig.s,
        user1.address
      );
      
      // 2. 使用传统方式存款
      await testToken.connect(user1).approve(bankAddress, normalAmount);
      await tokenBank.connect(user1).deposit(tokenAddress, normalAmount);
      
      // 验证总余额
      const totalBalance = await tokenBank.balances(user1.address, tokenAddress);
      expect(totalBalance).to.equal(permitAmount + normalAmount);
    });
  });
});