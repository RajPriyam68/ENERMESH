// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title EnerMeshMarketplace
/// @notice Digital evidence layer for P2P renewable energy trades.
/// Physical electricity is out of scope. Sprint 0 ships the interface and
/// access control; listing/purchase logic is implemented in Sprint 4.
contract EnerMeshMarketplace is AccessControl, Pausable, ReentrancyGuard {
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

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

    function createListing(uint256, uint256, uint256) external view whenNotPaused {
        revert("Not implemented until Sprint 4");
    }

    function updateListing(uint256, uint256, uint256, uint8) external view whenNotPaused {
        revert("Not implemented until Sprint 4");
    }

    function cancelListing(uint256) external view whenNotPaused {
        revert("Not implemented until Sprint 4");
    }

    function purchaseEnergy(uint256, uint256) external payable whenNotPaused nonReentrant {
        revert("Not implemented until Sprint 4");
    }

    function settleTrade(uint256) external whenNotPaused nonReentrant {
        revert("Not implemented until Sprint 4");
    }
}
