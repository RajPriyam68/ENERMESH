import { expect } from "chai";
import { ethers } from "hardhat";

describe("EnerMeshMarketplace (S0)", () => {
  it("grants admin and operator roles to constructor admin", async () => {
    const [admin] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EnerMeshMarketplace");
    const market = await Factory.deploy(admin.address);
    await market.waitForDeployment();

    const adminRole = await market.DEFAULT_ADMIN_ROLE();
    const operatorRole = await market.OPERATOR_ROLE();
    expect(await market.hasRole(adminRole, admin.address)).to.equal(true);
    expect(await market.hasRole(operatorRole, admin.address)).to.equal(true);
  });

  it("rejects zero-address admin", async () => {
    const Factory = await ethers.getContractFactory("EnerMeshMarketplace");
    await expect(Factory.deploy(ethers.ZeroAddress)).to.be.revertedWith("admin required");
  });

  it("pauses and unpauses as admin", async () => {
    const [admin] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EnerMeshMarketplace");
    const market = await Factory.deploy(admin.address);
    await market.waitForDeployment();

    await expect(market.pause()).to.emit(market, "Paused");
    await expect(market.createListing(1, 1, 1)).to.be.revertedWithCustomError(market, "EnforcedPause");
    await expect(market.unpause()).to.emit(market, "Unpaused");
  });
});
