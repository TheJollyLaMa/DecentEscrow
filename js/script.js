// Replace with your deployed contract address
const contractAddress = "0x9d2CdE04A233A556469f0226B7c0EEEfD8820276";

// Global variables
let provider;
let escrowContract;
let userAddress;
let contractABI; // This will be loaded from the JSON file
let isOwner = false;
const contractAddressDisplay = document.getElementById("contract-address-display");

// Contract addresses for different networks
const CONTRACT_ADDRESSES = {
  1: "?", // Ethereum Mainnet
  10: "?", // Optimism
  137: contractAddress,  // Polygon (example)
  42161: "?", // Arbitrum
  24734: "?" // MintMe
};

// Block Explorers for different networks
const BLOCK_EXPLORERS = {
  1: "https://etherscan.io/",
  10: "https://optimistic.etherscan.io/",
  137: "https://polygonscan.com/",
  42161: "https://arbiscan.io/",
  24734: "https://www.mintme.com/explorer/"
};

// Load the ABI from the external JSON file
async function loadABI() {
  try {
    const response = await fetch('../abis/DecentEscrow_v0.1_ABI.json');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    contractABI = await response.json();
    console.log("ABI loaded:", contractABI);
  } catch (error) {
    console.error("Failed to load ABI:", error);
  }
}
loadABI();

// Detect current chain
async function detectChain() {
  try {
    const providerInstance = new ethers.providers.Web3Provider(window.ethereum);
    const network = await providerInstance.getNetwork();
    console.log("Network detected:", network);
    return network.chainId;
  } catch (error) {
    console.error("Error detecting chain:", error);
    return null;
  }
}

// Get current contract address based on network
async function getCurrentContractAddress() {
  const chainId = await detectChain();
  return CONTRACT_ADDRESSES[chainId] || null;
}

// Display contract address in footer
async function displayContractAddress() {
  const chainId = await detectChain();
  const contractAddr = await getCurrentContractAddress();
  const explorerBaseUrl = BLOCK_EXPLORERS[chainId] || "#";

  if (!contractAddr) {
    contractAddressDisplay.innerHTML = `<p style="color: red;">No contract available for this network.</p>`;
    return;
  }

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

// Connect wallet function
const connectWallet = async () => {
  const walletButton = document.getElementById("connect-wallet");

  if (!window.ethereum) {
    alert("MetaMask is not installed!");
    return;
  }

  try {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    userAddress = accounts[0];

    // Detect current network and update UI
    const providerInstance = new ethers.providers.Web3Provider(window.ethereum);
    provider = providerInstance; // assign to global provider
    const network = await providerInstance.getNetwork();
    console.log("Connected on network:", network);

    await displayContractAddress();

    walletButton.classList.add("connected");
    walletButton.classList.remove("disconnected");

    // Shorten the wallet address display with icons in between
    const shortAddress = userAddress.slice(0, 6) +
      ' <img src="./img/Eth.gif" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/favicon.png" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/SecretPyramid.png" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/favicon.png" class="inline-favicon" alt="icon" /> ' +
      ' <img src="./img/Eth.gif" class="inline-favicon" alt="icon" /> ' +
      userAddress.slice(-4);
    document.getElementById("account").innerHTML = shortAddress;

    console.log("Wallet Connected:", userAddress);

    // Initialize the escrow contract instance with signer
    if (!contractABI) {
      await loadABI();
    }
    escrowContract = new ethers.Contract(contractAddress, contractABI, providerInstance.getSigner());

    // Check if the connected wallet is the contract owner
    const ownerAddress = await escrowContract.owner();
    isOwner = (userAddress.toLowerCase() === ownerAddress.toLowerCase());
    const ownerFormsContainer = document.getElementById("owner-forms");
    if (isOwner) {
      ownerFormsContainer.classList.remove("hidden");
      // For owner, you might choose to display all open work orders.
      displayOpenWorkOrders("all");
    } else {
      ownerFormsContainer.classList.add("hidden");
      // For non-owner (worker), you may choose to display only work orders for which they are the worker.
      displayOpenWorkOrders("worker");
    }
  } catch (error) {
    console.error("Error connecting wallet:", error);
    walletButton.classList.remove("connected");
    walletButton.classList.add("disconnected");
  }
};

document.getElementById("connect-wallet").addEventListener("click", connectWallet);

// ----------------- Owner-Only Event Listeners ----------------- //

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
    // Approve the escrow contract (contractAddress) to spend depositAmount tokens
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

    // Update timeline display after creation
    displayOpenWorkOrders(isOwner ? "all" : "worker");
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
    displayOpenWorkOrders(isOwner ? "all" : "worker");
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
    displayOpenWorkOrders(isOwner ? "all" : "worker");
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
    displayOpenWorkOrders(isOwner ? "all" : "worker");
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

// ----------------- Timeline Functions ----------------- //

// Fetch open work orders (those with funds still locked)
// The parameter viewType determines whether to fetch "all" orders (for owner)
// or only orders where the connected wallet is the worker ("worker").
async function fetchOpenWorkOrders(viewType) {
  let openOrders = [];
  try {
    // Get the order count (assuming orders are indexed starting at 1)
    const count = await escrowContract.orderCount();
    const orderCountNumber = count.toNumber();
    for (let i = 1; i <= orderCountNumber; i++) {
      const order = await escrowContract.orders(i);
      // Check if the order is still open: fundsReleased is false and cancelled is false
      if (!order.fundsReleased && !order.cancelled) {
        // If viewType is "worker", filter to include only orders where the connected wallet is the worker.
        if (viewType === "worker" && order.worker.toLowerCase() !== userAddress.toLowerCase()) {
          continue;
        }
        openOrders.push({
          orderId: i,
          client: order.client,
          worker: order.worker,
          token: order.token,
          workUrl: order.workUrl,
          workDescription: order.workDescription,
          depositAmount: order.depositAmount.toString(),
          timeLockEnd: order.timeLockEnd.toString()
        });
      }
    }
  } catch (error) {
    console.error("Error fetching open work orders:", error);
  }
  return openOrders;
}

// Display open work orders in the timeline container
async function displayOpenWorkOrders(viewType) {
  const container = document.getElementById("timeline-container");
  // Reset contents: set timeline title
  container.innerHTML = "";
  
  const openOrders = await fetchOpenWorkOrders(viewType);
  if (openOrders.length === 0) {
    container.innerHTML = "<p style='color: gold; text-align: center;'>No open work orders.</p>";
    return;
  }
  
  openOrders.forEach(order => {
    const card = document.createElement("div");
    card.className = "workorder-card";
    card.innerHTML = `
      <div class="card-title">
        <img src="./img/script-icon.png" alt="Script Icon">
        Work Order #${order.orderId}
      </div>
      <div class="card-details">
        <p><strong>Worker:</strong> ${order.worker}</p>
        <p><strong>Deposit:</strong> ${order.depositAmount}</p>
        <p><strong>Ends:</strong> ${new Date(order.timeLockEnd * 1000).toLocaleString()}</p>
        <p><strong>URL:</strong> <a href="${order.workUrl}" target="_blank">${order.workUrl}</a></p>
        <p><strong>Description:</strong> ${order.workDescription}</p>
      </div>
    `;
    container.appendChild(card);
  });
  
  // Set up the IntersectionObserver to add the "focused" class to the card in view.
  setupObserver("timeline-container");
}

// Set up an IntersectionObserver on the cards within a specified container
function setupObserver(containerId) {
  const container = document.getElementById(containerId);
  const cards = container.querySelectorAll(".workorder-card");

  const observerOptions = {
    root: container,
    threshold: 0.5  // Adjust threshold as needed
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if(entry.isIntersecting) {
        entry.target.classList.add("focused");
      } else {
        entry.target.classList.remove("focused");
      }
    });
  }, observerOptions);

  cards.forEach(card => observer.observe(card));
}