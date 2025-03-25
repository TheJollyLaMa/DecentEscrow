// js/contract.js
import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.esm.min.js";

export const contractAddress = "0x9d2CdE04A233A556469f0226B7c0EEEfD8820276";
let contractABI = null;

/**
 * Loads the contract ABI from the JSON file.
 */
export async function loadABI() {
  try {
    const response = await fetch('../abis/DecentEscrow_v0.1_ABI.json');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    contractABI = await response.json();
    console.log("ABI loaded:", contractABI);
    return contractABI;
  } catch (error) {
    console.error("Failed to load ABI:", error);
    throw error;
  }
}

/**
 * Initializes and returns the contract instance using the provided signer.
 */
export async function initContract(signer) {
  if (!contractABI) {
    await loadABI();
  }
  return new ethers.Contract(contractAddress, contractABI, signer);
}