// js/app.js
import { formatAddress } from "./wallet.js";
import { loadABI, initContract, contractAddress } from "./contract.js";
import { displayOpenWorkOrders } from "./timeline.js";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

let provider;
let escrowContract;
let userAddress;
let isOwner = false;

/**
 * Connects the user's wallet, initializes the contract, and sets up the UI.
 */
async function connectWallet() {
  const walletButton = document.getElementById("connect-wallet");

  if (!window.ethereum) {
    alert("MetaMask is not installed!");
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    userAddress = accounts[0];

    const providerInstance = new ethers.providers.Web3Provider(window.ethereum);
    provider = providerInstance; // assign globally
    const network = await providerInstance.getNetwork();
    console.log("Connected on network:", network);

    await displayContractAddress(); // defined below

    walletButton.classList.add("connected");
    walletButton.classList.remove("disconnected");

    // Display formatted wallet address using wallet.js utility
    const formattedWallet = formatAddress(userAddress);
    document.getElementById("account").innerHTML = formattedWallet;

    console.log("Wallet Connected:", userAddress);

    // Initialize escrow contract
    escrowContract = await initContract(providerInstance.getSigner());

    // Check if connected wallet is contract owner
    const ownerAddress = await escrowContract.owner();
    isOwner = (userAddress.toLowerCase() === ownerAddress.toLowerCase());
    const ownerFormsContainer = document.getElementById("owner-forms");
    if (isOwner) {
      ownerFormsContainer.classList.remove("hidden");
      // For owner, display all open work orders
      displayOpenWorkOrders(escrowContract, userAddress, "all");
    } else {
      ownerFormsContainer.classList.add("hidden");
      // For non-owner (worker), display only work orders for which they are the worker
      displayOpenWorkOrders(escrowContract, userAddress, "worker");
    }
  } catch (error) {
    console.error("Error connecting wallet:", error);
    walletButton.classList.remove("connected");
    walletButton.classList.add("disconnected");
  }
}

document.getElementById("connect-wallet").addEventListener("click", connectWallet);

/**
 * Displays the contract address in the footer.
 */
async function displayContractAddress() {
  const contractAddressDisplay = document.getElementById("contract-address-display");
  const network = await provider.getNetwork();
  const chainId = network.chainId;

  const BLOCK_EXPLORERS = {
    1: "https://etherscan.io/",
    10: "https://optimistic.etherscan.io/",
    137: "https://polygonscan.com/",
    42161: "https://arbiscan.io/",
    24734: "https://www.mintme.com/explorer/"
  };
  const CONTRACT_ADDRESSES = {
    1: "?",
    10: "?",
    137: contractAddress,
    42161: "?",
    24734: "?"
  };

  const explorerBaseUrl = BLOCK_EXPLORERS[chainId] || "#";
  const contractAddr = CONTRACT_ADDRESSES[chainId] || contractAddress;
  const shortAddressStart = contractAddr.slice(0, 6);
  const shortAddressEnd = contractAddr.slice(-4);
  const chainIcons = {
    1: "./img/Ethereum.png",
    10: "./img/Optimism.png",
    137: "./img/Polygon.png",
    24734: "./img/MintMe.png"
  };
  const chainIcon = chainIcons[chainId] || "./img/Eth.gif";

  contractAddressDisplay.innerHTML = `
    <div id="contract-address-display">
      <a href="${explorerBaseUrl + "address/" + contractAddr}" target="_blank" class="contract-link">
        <span id="contract-address-start">${shortAddressStart}</span>
        <span class="icons">
          <img src="./img/Eth.gif" alt="Chain Icon" class="icon">
          <img src="${chainIcon}" alt="Chain Icon" class="icon">
          <img src="./img/SecretPyramid.png" alt="Pyramid Icon" class="icon">
          <img src="${chainIcon}" alt="Chain Icon" class="icon">
          <img src="./img/Eth.gif" alt="Chain Icon" class="icon">
        </span>
        <span id="contract-address-end">${shortAddressEnd}</span>
      </a>
    </div>
  `;
}

// ----------------- Owner-Only Form Event Listeners ----------------- //

// Create Work Order Event Listener
document.getElementById("createWorkOrderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const worker = document.getElementById("worker").value;
  const token = document.getElementById("token").value;
  const depositAmount = document.getElementById("depositAmount").value;
  const workUrl = document.getElementById("workUrl").value;
  const workDescription = document.getElementById("workDescription").value;
  const lockDuration = document.getElementById("lockDuration").value;

  // Approve the escrow contract to spend tokens.
  try {
    const tokenContract = new ethers.Contract(token, ["function approve(address spender, uint256 amount)"], provider.getSigner());
    await tokenContract.approve(contractAddress, depositAmount);
  } catch (err) {
    console.error(err);
    document.getElementById("createResult").innerText = "Error: " + err.message;
    return;
  }

  try {
    const tx = await escrowContract.createWorkOrder(worker, token, depositAmount, workUrl, workDescription, lockDuration);
    document.getElementById("createResult").innerText = "Transaction submitted. Waiting for confirmation...";
    const receipt = await tx.wait();
    let orderId;
    for (const event of receipt.events) {
      if (event.event === "WorkOrderCreated") {
        orderId = event.args.orderId.toString();
        break;
      }
    }
    document.getElementById("createResult").innerText = "Work Order Created. Order ID: " + (orderId || "unknown");
    // Refresh timeline
    displayOpenWorkOrders(escrowContract, userAddress, isOwner ? "all" : "worker");
  } catch (err) {
    console.error(err);
    document.getElementById("createResult").innerText = "Error: " + err.message;
  }
});

// Verify Work Event Listener
document.getElementById("verifyWorkForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const orderId = document.getElementById("verifyOrderId").value;
  try {
    const tx = await escrowContract.verifyWork(orderId);
    document.getElementById("verifyResult").innerText = "Transaction submitted. Waiting for confirmation...";
    await tx.wait();
    document.getElementById("verifyResult").innerText = "Work Verified for Order ID: " + orderId;
    displayOpenWorkOrders(escrowContract, userAddress, isOwner ? "all" : "worker");
  } catch (err) {
    console.error(err);
    document.getElementById("verifyResult").innerText = "Error: " + err.message;
  }
});

// Manual Release Event Listener
document.getElementById("manualReleaseForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const orderId = document.getElementById("releaseOrderId").value;
  const payout = document.getElementById("payout").value;
  try {
    const tx = await escrowContract.manualRelease(orderId, payout);
    document.getElementById("releaseResult").innerText = "Transaction submitted. Waiting for confirmation...";
    await tx.wait();
    document.getElementById("releaseResult").innerText = "Manual Release executed for Order ID: " + orderId;
    displayOpenWorkOrders(escrowContract, userAddress, isOwner ? "all" : "worker");
  } catch (err) {
    console.error(err);
    document.getElementById("releaseResult").innerText = "Error: " + err.message;
  }
});

// Cancel Work Order Event Listener
document.getElementById("cancelWorkOrderForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const orderId = document.getElementById("cancelOrderId").value;
  try {
    const tx = await escrowContract.cancelWorkOrder(orderId);
    document.getElementById("cancelResult").innerText = "Transaction submitted. Waiting for confirmation...";
    await tx.wait();
    document.getElementById("cancelResult").innerText = "Work Order Cancelled for Order ID: " + orderId;
    displayOpenWorkOrders(escrowContract, userAddress, isOwner ? "all" : "worker");
  } catch (err) {
    console.error(err);
    document.getElementById("cancelResult").innerText = "Error: " + err.message;
  }
});

// Emergency Withdrawal Event Listener
document.getElementById("emergencyWithdrawForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const tokenAddress = document.getElementById("withdrawToken").value;
  const amount = document.getElementById("withdrawAmount").value;
  try {
    const tx = await escrowContract.emergencyWithdraw(tokenAddress, amount);
    document.getElementById("withdrawResult").innerText = "Transaction submitted. Waiting for confirmation...";
    await tx.wait();
    document.getElementById("withdrawResult").innerText = "Emergency Withdrawal executed.";
  } catch (err) {
    console.error(err);
    document.getElementById("withdrawResult").innerText = "Error: " + err.message;
  }
});