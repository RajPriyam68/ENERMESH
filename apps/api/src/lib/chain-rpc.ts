import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";

export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
}

export interface RpcReceipt {
  status: string | number | null;
  transactionHash: string;
  blockNumber: string | number | null;
  to: string | null;
  from?: string | null;
  logs: RpcLog[];
  gasUsed?: string | number | null;
  contractAddress?: string | null;
}

export interface RpcTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  input: string;
  blockNumber: string | number | null;
}

export interface ChainRpc {
  getChainId(): Promise<number>;
  getTransactionReceipt(txHash: string): Promise<RpcReceipt | null>;
  getTransaction(txHash: string): Promise<RpcTransaction | null>;
}

let rpcOverride: ChainRpc | null = null;
let contractOverride: string | null = null;

export function setChainRpcForTests(rpc: ChainRpc | null) {
  rpcOverride = rpc;
}

export function setContractAddressForTests(address: string | null) {
  contractOverride = address;
}

export function configuredContractAddress(): string {
  return (contractOverride ?? env.CONTRACT_ADDRESS).trim();
}

export function getChainRpc(): ChainRpc {
  return rpcOverride ?? jsonRpcClient;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseLogs(value: unknown): RpcLog[] {
  if (!Array.isArray(value)) return [];
  const logs: RpcLog[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const address = asString(row.address);
    const data = asString(row.data) ?? "0x";
    const topics = Array.isArray(row.topics)
      ? row.topics.filter((topic): topic is string => typeof topic === "string")
      : [];
    if (!address) continue;
    logs.push({ address, topics, data });
  }
  return logs;
}

function parseReceipt(value: unknown): RpcReceipt | null {
  const row = asRecord(value);
  if (!row) return null;
  const transactionHash = asString(row.transactionHash) ?? asString(row.hash);
  if (!transactionHash) return null;
  return {
    status: (row.status as string | number | null | undefined) ?? null,
    transactionHash,
    blockNumber: (row.blockNumber as string | number | null | undefined) ?? null,
    to: asString(row.to),
    from: asString(row.from),
    logs: parseLogs(row.logs),
    gasUsed: (row.gasUsed as string | number | null | undefined) ?? null,
    contractAddress: asString(row.contractAddress),
  };
}

function parseTransaction(value: unknown): RpcTransaction | null {
  const row = asRecord(value);
  if (!row) return null;
  const hash = asString(row.hash);
  const from = asString(row.from);
  if (!hash || !from) return null;
  return {
    hash,
    from,
    to: asString(row.to),
    value: asString(row.value) ?? "0x0",
    input: asString(row.input) ?? "0x",
    blockNumber: (row.blockNumber as string | number | null | undefined) ?? null,
  };
}

async function jsonRpc(method: string, params: unknown[]): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(env.RPC_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "RPC_FAILURE", "Blockchain RPC is unreachable");
  }

  let payload: { result?: unknown; error?: { message?: string } };
  try {
    payload = (await response.json()) as { result?: unknown; error?: { message?: string } };
  } catch {
    throw new HttpError(502, "RPC_FAILURE", "Blockchain RPC returned an invalid response");
  }

  if (!response.ok || payload.error) {
    throw new HttpError(502, "RPC_FAILURE", payload.error?.message ?? "Blockchain RPC request failed");
  }
  return payload.result ?? null;
}

const jsonRpcClient: ChainRpc = {
  async getChainId() {
    const result = await jsonRpc("eth_chainId", []);
    if (typeof result === "string" && result.startsWith("0x")) {
      return Number.parseInt(result, 16);
    }
    if (typeof result === "number") return result;
    throw new HttpError(502, "RPC_FAILURE", "Blockchain RPC did not return a chain id");
  },
  async getTransactionReceipt(txHash: string) {
    return parseReceipt(await jsonRpc("eth_getTransactionReceipt", [txHash]));
  },
  async getTransaction(txHash: string) {
    return parseTransaction(await jsonRpc("eth_getTransactionByHash", [txHash]));
  },
};

export function parseHexNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = value.startsWith("0x") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function parseHexBigInt(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "number") return BigInt(value);
  const trimmed = value.startsWith("0x") ? value : `0x${value}`;
  if (trimmed === "0x") return 0n;
  return BigInt(trimmed);
}

export function receiptSucceeded(receipt: RpcReceipt | null | undefined): boolean {
  if (!receipt) return false;
  const status = receipt.status;
  return status === 1 || status === "0x1" || status === "1";
}

export function receiptFailed(receipt: RpcReceipt | null | undefined): boolean {
  if (!receipt) return false;
  const status = receipt.status;
  return status === 0 || status === "0x0" || status === "0";
}
