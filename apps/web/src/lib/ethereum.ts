import { addEthereumChainParams, getChainConfig, type ChainConfig } from "./chain";

export type WalletBlockchainStatus = "WAITING_FOR_SIGNATURE" | "PENDING" | "FAILED" | "REJECTED";

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
}

interface WindowWithEthereum {
  ethereum?: Eip1193Provider & { isMetaMask?: boolean };
}

export type WalletTxPhase =
  | "idle"
  | "connecting"
  | "wrong_network"
  | "review"
  | "awaiting_signature"
  | "pending"
  | "mined"
  | "failed"
  | "rejected";

export interface TransactionReceiptLike {
  status: string | number | null;
  transactionHash: string;
  blockNumber: string | number | null;
  logs: Array<{ address?: string; topics?: string[]; data?: string }>;
}

export class WalletUserRejectedError extends Error {
  readonly code = 4001;
  constructor(message = "The wallet request was rejected.") {
    super(message);
    this.name = "WalletUserRejectedError";
  }
}

export class WalletNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletNetworkError";
  }
}

export function getInjectedProvider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const { ethereum } = window as unknown as WindowWithEthereum;
  return ethereum ?? null;
}

export function chainIdToHex(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function parseChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function shortAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function isUserRejected(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: number | string }).code;
  return code === 4001 || code === "4001" || code === "ACTION_REJECTED";
}

export function describeWalletError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: number }).code;
    if (code === 4001) return "Signature request was rejected in your wallet.";
    if (code === -32002) return "Your wallet already has a pending request. Open it and try again.";
    if (code === 4902) return "This network is not configured in your wallet.";
    const message = (error as { message?: string }).message;
    if (message) return message;
  }
  return "Wallet interaction failed. Please try again.";
}

export function walletPhaseFromError(error: unknown): Extract<WalletTxPhase, "rejected" | "failed"> {
  return isUserRejected(error) ? "rejected" : "failed";
}

export function blockchainStatusFromPhase(phase: WalletTxPhase): WalletBlockchainStatus | null {
  switch (phase) {
    case "awaiting_signature":
    case "connecting":
    case "review":
      return "WAITING_FOR_SIGNATURE";
    case "pending":
      return "PENDING";
    case "mined":
      return "PENDING";
    case "failed":
      return "FAILED";
    case "rejected":
      return "REJECTED";
    default:
      return null;
  }
}

export function receiptSucceeded(receipt: TransactionReceiptLike | null | undefined): boolean {
  if (!receipt) return false;
  const status = receipt.status;
  if (status === 1 || status === "0x1" || status === "1") return true;
  if (status === 0 || status === "0x0" || status === "0") return false;
  return false;
}

export async function requestAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as unknown;
  if (!Array.isArray(accounts)) return [];
  return accounts.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function readAccounts(provider: Eip1193Provider): Promise<string[]> {
  const accounts = (await provider.request({ method: "eth_accounts" })) as unknown;
  if (!Array.isArray(accounts)) return [];
  return accounts.filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function readChainId(provider: Eip1193Provider): Promise<number | null> {
  const hexChain = await provider.request({ method: "eth_chainId" });
  return parseChainId(hexChain);
}

export async function ensureChain(provider: Eip1193Provider, config: ChainConfig = getChainConfig()): Promise<number> {
  const active = await readChainId(provider);
  if (active === config.chainId) return active;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdToHex(config.chainId) }],
    });
  } catch (error) {
    const code = typeof error === "object" && error !== null ? (error as { code?: number }).code : undefined;
    if (code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [addEthereumChainParams(config)],
      });
    } else if (isUserRejected(error)) {
      throw new WalletUserRejectedError("Network switch was rejected in your wallet.");
    } else {
      throw new WalletNetworkError(describeWalletError(error));
    }
  }
  const next = await readChainId(provider);
  if (next !== config.chainId) {
    throw new WalletNetworkError(`Wallet is not on ${config.chainName} (${config.chainId}).`);
  }
  return next;
}

export async function sendContractTransaction(
  provider: Eip1193Provider,
  input: { from: string; to: string; data: string; valueWei?: bigint },
): Promise<string> {
  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: input.from,
        to: input.to,
        data: input.data,
        ...(input.valueWei && input.valueWei > 0n ? { value: `0x${input.valueWei.toString(16)}` } : {}),
      },
    ],
  });
  if (typeof txHash !== "string" || !txHash.startsWith("0x")) {
    throw new Error("Wallet did not return a transaction hash.");
  }
  return txHash;
}

export async function waitForReceipt(
  provider: Eip1193Provider,
  txHash: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<TransactionReceiptLike> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const receipt = (await provider.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    })) as TransactionReceiptLike | null;
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for a transaction receipt. The hash can still be checked on the explorer.");
}

export async function ethCall(provider: Eip1193Provider, to: string, data: string): Promise<string> {
  const result = await provider.request({
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
  if (typeof result !== "string") throw new Error("Contract call returned an unexpected value.");
  return result;
}
