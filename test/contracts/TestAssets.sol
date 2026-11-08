// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

contract TestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public fail;
    bool public fee;
    bool public senderFee;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function configure(bool fail_, bool fee_) external { fail = fail_; fee = fee_; }
    function configureSenderFee(bool value) external { senderFee = value; }
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        if (fail) return false;
        _transfer(msg.sender, to, amount);
        return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (fail) return false;
        require(allowance[from][msg.sender] >= amount, "Allowance");
        allowance[from][msg.sender] -= amount;
        _transfer(from, to, amount);
        return true;
    }
    function _transfer(address from, address to, uint256 amount) private {
        uint256 debit = senderFee ? amount + 1 : amount;
        require(balanceOf[from] >= debit, "Balance");
        balanceOf[from] -= debit;
        balanceOf[to] += fee ? amount - 1 : amount;
    }
}

contract NoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 amount) external { balanceOf[to] += amount; }
    function approve(address spender, uint256 amount) external { allowance[msg.sender][spender] = amount; }
    function transfer(address to, uint256 amount) external {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
    }
    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract Receiver {
    bool public reject;
    address public target;
    bytes public callback;
    bool public callbackSucceeded;
    function configure(bool reject_, address target_, bytes calldata callback_) external {
        reject = reject_; target = target_; callback = callback_;
    }
    function execute(address to, bytes calldata data) external payable returns (bytes memory) {
        (bool ok, bytes memory result) = to.call{value: msg.value}(data);
        require(ok, "Execution failed");
        return result;
    }
    receive() external payable {
        require(!reject, "Rejected");
        if (target != address(0)) (callbackSucceeded,) = target.call(callback);
    }
}
