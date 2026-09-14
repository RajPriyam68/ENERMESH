const secp = require("ethereum-cryptography/secp256k1.js");
if (!secp.secp256k1 && secp.CURVE) {
  Object.defineProperty(secp, "secp256k1", { value: secp, enumerable: true });
}

require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");

const rpcUrl = process.env.RPC_URL ?? "https://rpc-amoy.polygon.technology";
const chainId = Number(process.env.CHAIN_ID ?? 80002);

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {},
    amoy: {
      url: rpcUrl,
      chainId,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
