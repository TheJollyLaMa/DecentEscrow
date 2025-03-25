// js/timeline.js
import { formatAddress } from "./wallet.js";
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

/**
 * Fetches open work orders (where funds are still locked and not cancelled)
 * viewType: "all" for owner view (all orders) or "worker" for non-owner view (only orders where order.worker equals userAddress).
 */
export async function fetchOpenWorkOrders(escrowContract, userAddress, viewType) {
  let openOrders = [];
  try {
    const count = await escrowContract.orderCount();
    const orderCountNumber = count.toNumber();
    for (let i = 1; i <= orderCountNumber; i++) {
      const order = await escrowContract.orders(i);
      // Only include orders that are not resolved
      if (!order.fundsReleased && !order.cancelled) {
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

/**
 * Displays the open work orders in the timeline container.
 * The worker address is formatted, the deposit amount is converted to a human‐readable number (assuming 18 decimals),
 * a token icon (SHT.png) appears next to the deposit, and the URL + description are combined into a hyperlink.
 */
export async function displayOpenWorkOrders(escrowContract, userAddress, viewType) {
    const container = document.getElementById("timeline-container");
    container.innerHTML = ""; // Clear container
  
    const openOrders = await fetchOpenWorkOrders(escrowContract, userAddress, viewType);
    if (openOrders.length === 0) {
      container.innerHTML = `<p style="color: gold; font-size: 1.5rem; text-align: center; text-shadow: 0 0 10px gold;">No open work orders.</p>`;
      return;
    }
  
    openOrders.forEach(order => {
      // Format worker address using wallet.js utility
      const formattedWorker = formatAddress(order.worker);
      // Format deposit amount to human-readable (assuming 18 decimals)
      const formattedDeposit = ethers.utils.formatUnits(order.depositAmount, 18);
      // Create combined hyperlink for workUrl and workDescription
      const hyperlink = `<a href="${order.workUrl}" target="_blank">${order.workDescription}</a>`;
  
      const card = document.createElement("div");
      card.className = "workorder-card";
      card.innerHTML = `
        <div class="card-title">
            🪙 ⚸ 📜 <br>
            Work Order #${order.orderId}
        </div>
        <div class="card-details">
            <p><strong>Worker:</strong> ${formattedWorker}</p>
            <p><strong>Deposit:</strong> <img src="./img/SHT.png" alt="Token Icon" class="inline-favicon"> ${formattedDeposit}</p>
            <p><strong>Ends:</strong> ${new Date(order.timeLockEnd * 1000).toLocaleString()}</p>
            <p><strong>Hyper Link ⚸🖲️:</strong> ${hyperlink}</p>
        </div>
        `;
      container.appendChild(card);
    });
  
    setupObserver("timeline-container");
  }
  

/**
 * Sets up an IntersectionObserver on the cards within the specified container.
 * The card that is at least 50% visible will be given the "focused" class.
 */
export function setupObserver(containerId) {
  const container = document.getElementById(containerId);
  const cards = container.querySelectorAll(".workorder-card");

  const observerOptions = {
    root: container,
    threshold: 0.5
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("focused");
      } else {
        entry.target.classList.remove("focused");
      }
    });
  }, observerOptions);

  cards.forEach(card => observer.observe(card));
}