require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");  // gas
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.26",
  gasReporter: {
    enabled: true,      // 开启 gas 报告
    currency: "USD",    // 显示 USD
    // 不要 coinmarketcap 配置，用默认价格
  },
};
