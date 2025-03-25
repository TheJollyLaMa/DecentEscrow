// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

// Minimal ERC20 interface
interface IERC20 {
    function transfer(address recipient, uint256 amount) external returns (bool);
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) external returns (bool);
}

contract EscrowMultiWorkOrder is Ownable {
    struct WorkOrder {
        address client;
        address worker;
        IERC20 token;
        string workUrl;
        string workDescription;
        uint256 depositAmount;
        uint256 timeLockEnd;
        bool fundsReleased;
        bool cancelled;
    }
    
    // Work order ID counter
    uint256 public orderCount;
    
    // Mapping from order ID to WorkOrder details
    mapping(uint256 => WorkOrder) public orders;
    
    // Events for logging work order activity
    event WorkOrderCreated(
        uint256 indexed orderId,
        address indexed client,
        address indexed worker,
        address token,
        uint256 depositAmount,
        uint256 timeLockEnd,
        string workUrl,
        string workDescription
    );
    event WorkVerified(uint256 indexed orderId, uint256 amountReleased);
    event ManualRelease(uint256 indexed orderId, uint256 payoutToWorker, uint256 refundToClient);
    event WorkOrderCancelled(uint256 indexed orderId, uint256 refundAmount);
    event EmergencyWithdrawal(address indexed token, uint256 amount);
    
    constructor() Ownable(msg.sender) {}

    /**
     * @notice Creates a new work order escrow with deposit.
     * @dev Only the contract owner can call this.
     * IMPORTANT: The contract owner must approve this contract to spend at least _depositAmount tokens prior to calling this function.
     * @param _worker The address of the worker who will receive funds.
     * @param _token The address of the ERC20 token to be used.
     * @param _depositAmount The amount of tokens to deposit.
     * @param _workUrl The URL representing the work order.
     * @param _workDescription A description of the work order.
     * @param _lockDuration The duration (in seconds) for which the funds remain locked.
     * @return orderId The unique identifier of the new work order.
     */
    function createWorkOrder(
        address _worker,
        address _token,
        uint256 _depositAmount,
        string memory _workUrl,
        string memory _workDescription,
        uint256 _lockDuration
    ) external onlyOwner returns (uint256 orderId) {
        require(_depositAmount > 0, "Deposit amount must be greater than zero");
        orderCount++;
        orderId = orderCount;
        IERC20 token = IERC20(_token);
        
        // Ensure the contract owner has approved this contract to spend _depositAmount tokens.
        require(token.transferFrom(msg.sender, address(this), _depositAmount), "Token transfer failed");

        orders[orderId] = WorkOrder({
            client: msg.sender,
            worker: _worker,
            token: token,
            workUrl: _workUrl,
            workDescription: _workDescription,
            depositAmount: _depositAmount,
            timeLockEnd: block.timestamp + _lockDuration,
            fundsReleased: false,
            cancelled: false
        });
        
        emit WorkOrderCreated(
            orderId,
            msg.sender,
            _worker,
            _token,
            _depositAmount,
            block.timestamp + _lockDuration,
            _workUrl,
            _workDescription
        );
    }
    
    /**
     * @notice Verifies that the work is complete and releases the full escrow to the worker.
     * @dev Only the contract owner can call this.
     * @param _orderId The ID of the work order.
     */
    function verifyWork(uint256 _orderId) external onlyOwner {
        WorkOrder storage order = orders[_orderId];
        require(!order.fundsReleased, "Funds already released");
        require(!order.cancelled, "Work order has been cancelled");
        require(order.depositAmount > 0, "No deposit made");
        
        order.fundsReleased = true;
        require(order.token.transfer(order.worker, order.depositAmount), "Transfer to worker failed");
        
        emit WorkVerified(_orderId, order.depositAmount);
    }
    
    /**
     * @notice After the time lock expires, allows the owner to release a partial payout.
     * @dev Only the contract owner can call this.
     * @param _orderId The ID of the work order.
     * @param _payout The amount to pay out to the worker.
     * The remaining tokens (if any) are refunded to the owner.
     */
    function manualRelease(uint256 _orderId, uint256 _payout) external onlyOwner {
        WorkOrder storage order = orders[_orderId];
        require(block.timestamp >= order.timeLockEnd, "Time lock not yet expired");
        require(!order.fundsReleased, "Funds already released");
        require(!order.cancelled, "Work order has been cancelled");
        require(_payout <= order.depositAmount, "Payout exceeds deposit");
        
        order.fundsReleased = true;
        if (_payout > 0) {
            require(order.token.transfer(order.worker, _payout), "Transfer to worker failed");
        }
        uint256 refund = order.depositAmount - _payout;
        if (refund > 0) {
            require(order.token.transfer(order.client, refund), "Refund to client failed");
        }
        
        emit ManualRelease(_orderId, _payout, refund);
    }
    
    /**
     * @notice Cancels a work order that has not been completed.
     * @dev Only the contract owner can call this. It refunds the full deposit to the owner.
     * @param _orderId The ID of the work order to cancel.
     */
    function cancelWorkOrder(uint256 _orderId) external onlyOwner {
        WorkOrder storage order = orders[_orderId];
        require(!order.fundsReleased, "Funds already released");
        require(!order.cancelled, "Work order already cancelled");
        
        order.cancelled = true;
        order.fundsReleased = true; // Mark as resolved to prevent future calls.
        require(order.token.transfer(order.client, order.depositAmount), "Refund to client failed");
        
        emit WorkOrderCancelled(_orderId, order.depositAmount);
    }
    
    /**
     * @notice Emergency function to withdraw tokens mistakenly sent to the contract.
     * @dev Only the contract owner can call this.
     * @param _tokenAddress The address of the token to withdraw.
     * @param _amount The amount of tokens to withdraw.
     */
    function emergencyWithdraw(address _tokenAddress, uint256 _amount) external onlyOwner {
        IERC20 token = IERC20(_tokenAddress);
        require(token.transfer(msg.sender, _amount), "Emergency withdrawal failed");
        
        emit EmergencyWithdrawal(_tokenAddress, _amount);
    }
}