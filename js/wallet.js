// js/wallet.js
// Utility functions related to wallet formatting

/**
 * Formats an Ethereum address to a shortened version with inline icons.
 * Example output: "0x123456 <img src=...> 7890"
 */
export function formatAddress(address) {
    if (!address) return "";
    return address.slice(0, 6) +
      ' <img src="./img/Eth.gif" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/favicon.png" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/SecretPyramid.png" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/favicon.png" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/Eth.gif" class="inline-favicon" alt="icon" /> ' +
      address.slice(-4);
  }