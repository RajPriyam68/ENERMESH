import type { WalletBlockchainStatus, WalletTxPhase } from "./ethereum";

export interface TxUiCopy {
  title: string;
  body: string;
  tone: "info" | "warning" | "success" | "error";
}

export function copyForPhase(phase: WalletTxPhase): TxUiCopy | null {
  switch (phase) {
    case "connecting":
      return { title: "Connecting wallet", body: "Approve the connection request in MetaMask.", tone: "info" };
    case "wrong_network":
      return {
        title: "Wrong network",
        body: "Switch to the configured chain before signing. EnerMesh does not send transactions on other networks.",
        tone: "warning",
      };
    case "review":
      return {
        title: "Review trade",
        body: "Confirm quantity, price, and wallet in this page before MetaMask opens.",
        tone: "info",
      };
    case "awaiting_signature":
      return {
        title: "Waiting for signature",
        body: "Confirm or reject the request in your wallet. Closing the prompt rejects the trade.",
        tone: "info",
      };
    case "pending":
      return {
        title: "Transaction pending",
        body: "Submitted to the network. Explorer confirmation is not a marketplace settlement until the API verifies the receipt.",
        tone: "info",
      };
    case "mined":
      return {
        title: "Included on-chain",
        body: "The wallet saw a successful receipt. Marketplace confirmation still requires backend verification.",
        tone: "success",
      };
    case "failed":
      return {
        title: "Transaction failed",
        body: "The call reverted, the RPC failed, or the receipt reported failure. No funds should have settled.",
        tone: "error",
      };
    case "rejected":
      return {
        title: "Rejected in wallet",
        body: "You declined the signature. Nothing was submitted to the chain.",
        tone: "warning",
      };
    default:
      return null;
  }
}

export function neverConfirmedFromWallet(phase: WalletTxPhase): boolean {
  return phase !== "mined" && phase !== "pending";
}

export function settlementHint(status: WalletBlockchainStatus | "CONFIRMED" | null): string {
  if (status === "CONFIRMED") {
    return "Settlement is confirmed only after the API verifies the receipt and contract event.";
  }
  if (status === "PENDING") {
    return "Pending in the wallet is not a confirmed trade.";
  }
  if (status === "REJECTED") {
    return "Wallet rejection left the match unsettled.";
  }
  if (status === "FAILED") {
    return "On-chain failure left the match unsettled.";
  }
  return "This match is not confirmed on-chain yet.";
}
