// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EnerMeshMarketplace
/// @notice Digital evidence layer for P2P renewable energy trades.
/// Physical electricity is out of scope. Listings, purchases, and settlement
/// are recorded on-chain; the API remains the system of record for matching.
contract EnerMeshMarketplace is AccessControl, Pausable, ReentrancyGuard {
    using Address for address payable;

    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    uint8 public constant LISTING_ACTIVE = 1;
    uint8 public constant LISTING_CANCELLED = 2;
    uint8 public constant LISTING_SOLD_OUT = 3;

    struct Listing {
        address seller;
        uint256 remainingKwh;
        uint256 pricePerKwh;
        uint256 externalId;
        uint8 status;
    }

    struct Trade {
        uint256 listingId;
        address seller;
        address buyer;
        uint256 quantityKwh;
        uint256 totalPaid;
        bool settled;
    }

    uint256 public nextListingId = 1;
    uint256 public nextTradeId = 1;

    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Trade) public trades;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 quantityKwh, uint256 pricePerKwh);
    event ListingUpdated(uint256 indexed listingId, uint256 quantityKwh, uint256 pricePerKwh, uint8 status);
    event ListingCancelled(uint256 indexed listingId, address indexed seller);
    event EnergyPurchased(uint256 indexed listingId, uint256 indexed tradeId, address indexed buyer, uint256 quantityKwh, uint256 totalPaid);
    event TradeSettled(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 quantityKwh);

    constructor(address admin) {
        require(admin != address(0), "admin required");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(OPERATOR_ROLE, admin);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /// @param quantityKwh Remaining energy units (same scale as off-chain kWh * 1e3 is allowed).
    /// @param pricePerKwh Wei charged per energy unit.
    /// @param externalId Optional off-chain listing correlation id (e.g. UUID as uint256).
    function createListing(
        uint256 quantityKwh,
        uint256 pricePerKwh,
        uint256 externalId
    ) external whenNotPaused returns (uint256 listingId) {
        require(quantityKwh > 0, "quantity required");
        require(pricePerKwh > 0, "price required");

        listingId = nextListingId;
        nextListingId += 1;

        listings[listingId] = Listing({
            seller: msg.sender,
            remainingKwh: quantityKwh,
            pricePerKwh: pricePerKwh,
            externalId: externalId,
            status: LISTING_ACTIVE
        });

        emit ListingCreated(listingId, msg.sender, quantityKwh, pricePerKwh);
    }

    function updateListing(
        uint256 listingId,
        uint256 quantityKwh,
        uint256 pricePerKwh,
        uint8 status
    ) external whenNotPaused {
        Listing storage listing = listings[listingId];
        require(listing.seller != address(0), "listing not found");
        require(listing.status != LISTING_CANCELLED, "listing cancelled");
        require(_isListingManager(listing.seller), "not authorized");
        require(pricePerKwh > 0, "price required");
        require(status == LISTING_ACTIVE || status == LISTING_SOLD_OUT, "invalid status");
        if (quantityKwh == 0) {
            require(status == LISTING_SOLD_OUT, "sold out status required");
        } else {
            require(status == LISTING_ACTIVE, "active status required");
        }

        listing.remainingKwh = quantityKwh;
        listing.pricePerKwh = pricePerKwh;
        listing.status = status;

        emit ListingUpdated(listingId, quantityKwh, pricePerKwh, status);
    }

    function cancelListing(uint256 listingId) external whenNotPaused {
        Listing storage listing = listings[listingId];
        require(listing.seller != address(0), "listing not found");
        require(listing.status != LISTING_CANCELLED, "already cancelled");
        require(_isListingManager(listing.seller), "not authorized");

        listing.status = LISTING_CANCELLED;
        emit ListingCancelled(listingId, listing.seller);
    }

    function purchaseEnergy(uint256 listingId, uint256 quantityKwh) external payable whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        require(listing.seller != address(0), "listing not found");
        require(listing.status == LISTING_ACTIVE, "listing not active");
        require(quantityKwh > 0, "quantity required");
        require(quantityKwh <= listing.remainingKwh, "insufficient quantity");
        require(msg.sender != listing.seller, "self-trade");

        uint256 totalPaid = quantityKwh * listing.pricePerKwh;
        require(msg.value == totalPaid, "incorrect payment");

        listing.remainingKwh -= quantityKwh;
        if (listing.remainingKwh == 0) {
            listing.status = LISTING_SOLD_OUT;
        }

        uint256 tradeId = nextTradeId;
        nextTradeId += 1;
        trades[tradeId] = Trade({
            listingId: listingId,
            seller: listing.seller,
            buyer: msg.sender,
            quantityKwh: quantityKwh,
            totalPaid: totalPaid,
            settled: false
        });

        emit EnergyPurchased(listingId, tradeId, msg.sender, quantityKwh, totalPaid);
    }

    function settleTrade(uint256 tradeId) external whenNotPaused nonReentrant {
        Trade storage trade = trades[tradeId];
        require(trade.buyer != address(0), "trade not found");
        require(!trade.settled, "already settled");
        require(
            msg.sender == trade.seller || msg.sender == trade.buyer || hasRole(OPERATOR_ROLE, msg.sender),
            "not authorized"
        );

        trade.settled = true;
        emit TradeSettled(tradeId, trade.seller, trade.buyer, trade.quantityKwh);
        payable(trade.seller).sendValue(trade.totalPaid);
    }

    function _isListingManager(address seller) internal view returns (bool) {
        return msg.sender == seller || hasRole(OPERATOR_ROLE, msg.sender);
    }
}
