// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @dev Conservative exact-amount assets only. Zero address denotes native coin.
abstract contract PaymentAsset {
    uint256 private entered;

    modifier nonReentrant() {
        require(entered == 0, "Reentrant call");
        entered = 1;
        _;
        entered = 0;
    }

    function _asset(address asset) internal view {
        require(asset == address(0) || asset.code.length > 0, "Invalid asset");
    }

    function _balance(address asset, address account) private view returns (uint256) {
        (bool ok, bytes memory data) = asset.staticcall(
            abi.encodeWithSignature("balanceOf(address)", account)
        );
        require(ok && data.length == 32, "Invalid balance");
        return abi.decode(data, (uint256));
    }

    function _tokenCall(address asset, bytes memory data) private {
        (bool ok, bytes memory result) = asset.call(data);
        require(ok && (result.length == 0 || (result.length == 32 && abi.decode(result, (bool)))), "Token transfer failed");
    }

    function _collect(address asset, uint256 amount) internal {
        if (asset == address(0)) {
            require(msg.value == amount, "Incorrect native value");
        } else {
            require(msg.value == 0, "Unexpected native value");
            uint256 beforeBalance = _balance(asset, address(this));
            uint256 beforePayer = _balance(asset, msg.sender);
            _tokenCall(asset, abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), amount));
            require(_balance(asset, address(this)) == beforeBalance + amount && _balance(asset, msg.sender) + amount == beforePayer, "Non-exact asset");
        }
    }

    function _send(address asset, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (asset == address(0)) {
            (bool ok,) = payable(to).call{value: amount}("");
            require(ok, "Native transfer failed");
        } else {
            uint256 beforeBalance = _balance(asset, to);
            uint256 held = _balance(asset, address(this));
            _tokenCall(asset, abi.encodeWithSignature("transfer(address,uint256)", to, amount));
            require(_balance(asset, to) == beforeBalance + amount && _balance(asset, address(this)) + amount == held, "Non-exact asset");
        }
    }
}
