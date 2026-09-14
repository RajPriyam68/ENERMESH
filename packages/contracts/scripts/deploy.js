const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) {
    throw new Error("No deployer signer. Configure network credentials outside source control.");
  }
  const Factory = await ethers.getContractFactory("EnerMeshMarketplace");
  const market = await Factory.deploy(deployer.address);
  await market.waitForDeployment();
  console.log("EnerMeshMarketplace deployed:", await market.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
