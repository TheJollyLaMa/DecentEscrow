// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import "./PaymentAsset.sol";

/// @notice Client-controlled work escrow, not arbitration or lending collateral.
contract DecentEscrowV1 is PaymentAsset {
    struct Order {
        address payer;
        address payee;
        address asset;
        uint256 amount;
        uint256 deadline;
        bool settled;
        string context;
    }

    uint256 public orderCount;
    mapping(uint256 => Order) public orders;

    event Created(uint256 indexed id, address indexed payer, address indexed payee, address asset, uint256 amount, uint256 deadline, string context);
    event Settled(uint256 indexed id, address indexed actor, uint256 paid, uint256 refunded);

    function create(address payee, address asset, uint256 amount, uint256 deadline, string calldata context) external payable nonReentrant returns (uint256 id) {
        require(payee != address(0) && payee != address(this) && payee != msg.sender, "Invalid payee");
        require(amount > 0 && deadline > block.timestamp, "Invalid terms");
        require(bytes(context).length <= 512, "Reference too long");
        _asset(asset);
        id = ++orderCount;
        orders[id] = Order(msg.sender, payee, asset, amount, deadline, false, context);
        _collect(asset, amount);
        emit Created(id, msg.sender, payee, asset, amount, deadline, context);
    }

    function release(uint256 id) external nonReentrant {
        Order storage order = orders[id];
        require(msg.sender == order.payer, "Only payer");
        _settle(id, order.amount);
    }

    function settleAfterDeadline(uint256 id, uint256 paid) external nonReentrant {
        Order storage order = orders[id];
        require(msg.sender == order.payer, "Only payer");
        require(block.timestamp >= order.deadline, "Deadline not reached");
        _settle(id, paid);
    }

    function refund(uint256 id) external nonReentrant {
        require(msg.sender == orders[id].payee, "Only payee");
        _settle(id, 0);
    }

    function _settle(uint256 id, uint256 paid) private {
        Order storage order = orders[id];
        require(order.amount > 0 && !order.settled, "Not open");
        require(paid <= order.amount, "Excess payout");
        order.settled = true;
        uint256 returned = order.amount - paid;
        _send(order.asset, order.payee, paid);
        _send(order.asset, order.payer, returned);
        emit Settled(id, msg.sender, paid, returned);
    }
}
