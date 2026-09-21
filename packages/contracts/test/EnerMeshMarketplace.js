const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("EnerMeshMarketplace (S4)", () => {
  async function deploy() {
    const [admin, seller, buyer, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("EnerMeshMarketplace");
    const market = await Factory.deploy(admin.address);
    await market.waitForDeployment();
    return { market, admin, seller, buyer, other };
  }

  it("grants admin and operator roles to constructor admin", async () => {
    const { market, admin } = await deploy();
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
    const { market, seller } = await deploy();
    await expect(market.pause()).to.emit(market, "Paused");
    await expect(market.connect(seller).createListing(100, 1, 0)).to.be.revertedWithCustomError(
      market,
      "EnforcedPause",
    );
    await expect(market.unpause()).to.emit(market, "Unpaused");
    await expect(market.connect(seller).createListing(100, 1, 0)).to.emit(market, "ListingCreated");
  });

  it("creates a listing and records remaining quantity", async () => {
    const { market, seller } = await deploy();
    await expect(market.connect(seller).createListing(100, 2, 42))
      .to.emit(market, "ListingCreated")
      .withArgs(1, seller.address, 100, 2);

    const listing = await market.listings(1);
    expect(listing.seller).to.equal(seller.address);
    expect(listing.remainingKwh).to.equal(100n);
    expect(listing.pricePerKwh).to.equal(2n);
    expect(listing.externalId).to.equal(42n);
    expect(listing.status).to.equal(1);
  });

  it("rejects empty quantity or zero price on create", async () => {
    const { market, seller } = await deploy();
    await expect(market.connect(seller).createListing(0, 1, 0)).to.be.revertedWith("quantity required");
    await expect(market.connect(seller).createListing(10, 0, 0)).to.be.revertedWith("price required");
  });

  it("lets the seller update remaining quantity and cancel", async () => {
    const { market, seller } = await deploy();
    await market.connect(seller).createListing(50, 3, 0);

    await expect(market.connect(seller).updateListing(1, 40, 4, 1))
      .to.emit(market, "ListingUpdated")
      .withArgs(1, 40, 4, 1);

    await expect(market.connect(seller).cancelListing(1))
      .to.emit(market, "ListingCancelled")
      .withArgs(1, seller.address);

    const listing = await market.listings(1);
    expect(listing.status).to.equal(2);
  });

  it("blocks unauthorized listing updates and cancels", async () => {
    const { market, seller, other } = await deploy();
    await market.connect(seller).createListing(50, 3, 0);
    await expect(market.connect(other).updateListing(1, 40, 3, 1)).to.be.revertedWith("not authorized");
    await expect(market.connect(other).cancelListing(1)).to.be.revertedWith("not authorized");
  });

  it("purchases energy with exact payment and emits EnergyPurchased", async () => {
    const { market, seller, buyer } = await deploy();
    await market.connect(seller).createListing(100, 5, 0);

    await expect(market.connect(buyer).purchaseEnergy(1, 30, { value: 150 }))
      .to.emit(market, "EnergyPurchased")
      .withArgs(1, 1, buyer.address, 30, 150);

    const listing = await market.listings(1);
    expect(listing.remainingKwh).to.equal(70n);
    expect(listing.status).to.equal(1);

    const trade = await market.trades(1);
    expect(trade.seller).to.equal(seller.address);
    expect(trade.buyer).to.equal(buyer.address);
    expect(trade.quantityKwh).to.equal(30n);
    expect(trade.totalPaid).to.equal(150n);
    expect(trade.settled).to.equal(false);
  });

  it("marks a listing sold out when remaining quantity hits zero", async () => {
    const { market, seller, buyer } = await deploy();
    await market.connect(seller).createListing(10, 1, 0);
    await market.connect(buyer).purchaseEnergy(1, 10, { value: 10 });
    const listing = await market.listings(1);
    expect(listing.remainingKwh).to.equal(0n);
    expect(listing.status).to.equal(3);
  });

  it("rejects oversell, self-trade, wrong payment, and cancelled listings", async () => {
    const { market, seller, buyer } = await deploy();
    await market.connect(seller).createListing(10, 2, 0);

    await expect(market.connect(buyer).purchaseEnergy(1, 11, { value: 22 })).to.be.revertedWith(
      "insufficient quantity",
    );
    await expect(market.connect(seller).purchaseEnergy(1, 1, { value: 2 })).to.be.revertedWith("self-trade");
    await expect(market.connect(buyer).purchaseEnergy(1, 1, { value: 1 })).to.be.revertedWith("incorrect payment");

    await market.connect(seller).cancelListing(1);
    await expect(market.connect(buyer).purchaseEnergy(1, 1, { value: 2 })).to.be.revertedWith("listing not active");
  });

  it("settles a trade by paying the seller exactly once", async () => {
    const { market, seller, buyer } = await deploy();
    await market.connect(seller).createListing(20, 7, 0);
    await market.connect(buyer).purchaseEnergy(1, 4, { value: 28 });

    const before = await ethers.provider.getBalance(seller.address);
    await expect(market.connect(buyer).settleTrade(1))
      .to.emit(market, "TradeSettled")
      .withArgs(1, seller.address, buyer.address, 4);
    const after = await ethers.provider.getBalance(seller.address);
    expect(after - before).to.equal(28n);

    const trade = await market.trades(1);
    expect(trade.settled).to.equal(true);
    await expect(market.connect(buyer).settleTrade(1)).to.be.revertedWith("already settled");
  });

  it("blocks unauthorized settlement and missing trades", async () => {
    const { market, seller, buyer, other } = await deploy();
    await market.connect(seller).createListing(8, 3, 0);
    await market.connect(buyer).purchaseEnergy(1, 2, { value: 6 });
    await expect(market.connect(other).settleTrade(1)).to.be.revertedWith("not authorized");
    await expect(market.connect(buyer).settleTrade(99)).to.be.revertedWith("trade not found");
  });
});
