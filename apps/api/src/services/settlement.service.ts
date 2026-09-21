import type { Match, Prisma, Trade } from "@prisma/client";
import type { ReportTradeInput, TradePublic } from "@enermesh/shared";
import { roundPrice } from "@enermesh/shared";
import { env } from "../config/env.js";
import { recordAudit } from "../lib/audit.js";
import {
  configuredContractAddress,
  getChainRpc,
  parseHexBigInt,
  parseHexNumber,
  receiptFailed,
  receiptSucceeded,
  type RpcReceipt,
  type RpcTransaction,
} from "../lib/chain-rpc.js";
import {
  isConfiguredContractAddress,
  parseEnergyPurchasedLogs,
  parseTradeSettledLogs,
  priceToWeiPerMilliKwh,
  purchaseValueWei,
  sameAddress,
  toMilliKwh,
} from "../lib/marketplace-events.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { decimalNumber } from "./matching.service.js";

const TERMINAL_MATCH = new Set(["REJECTED", "EXPIRED", "SETTLED", "FAILED"]);
const TERMINAL_TRADE = new Set(["CONFIRMED", "COMPLETED", "FAILED", "REJECTED"]);

type MatchRow = Match & {
  listing: { status: string; availableUntil: Date };
  bid: { status: string; requiredUntil: Date };
};

export function explorerTxUrl(txHash: string | null | undefined): string | undefined {
  if (!txHash) return undefined;
  const hash = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
  return `${env.BLOCK_EXPLORER_URL.replace(/\/+$/, "")}/tx/${hash}`;
}

export function toPublicTrade(trade: Trade): TradePublic {
  return {
    id: trade.id,
    matchId: trade.matchId,
    buyerId: trade.buyerId,
    sellerId: trade.sellerId,
    quantityKwh: decimalNumber(trade.quantityKwh),
    pricePerKwh: decimalNumber(trade.pricePerKwh),
    totalAmount: decimalNumber(trade.totalAmount),
    status: trade.status,
    blockchainTxStatus: trade.blockchainTxStatus,
    txHash: trade.txHash ?? undefined,
    blockNumber: trade.blockNumber ?? undefined,
    contractAddress: trade.contractAddress ?? undefined,
    network: trade.network ?? undefined,
    explorerUrl: explorerTxUrl(trade.txHash),
  };
}

function normalizeTxHash(hash: string): string {
  return hash.toLowerCase();
}

function configuredContract(): string {
  const address = configuredContractAddress();
  if (!isConfiguredContractAddress(address)) {
    throw new HttpError(409, "CONTRACT_REQUIRED", "CONTRACT_ADDRESS is not configured");
  }
  return address;
}

async function loadMatch(matchId: string): Promise<MatchRow> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      listing: { select: { status: true, availableUntil: true } },
      bid: { select: { status: true, requiredUntil: true } },
    },
  });
  if (!match) throw new HttpError(404, "MATCH_NOT_FOUND", "Match not found");
  return match;
}

function assertParticipant(
  actor: { id: string; role: string },
  match: Match,
  action: ReportTradeInput["action"],
) {
  if (actor.role === "ADMIN") return;
  if (action === "purchase" && actor.id !== match.buyerId) {
    throw new HttpError(403, "FORBIDDEN", "Only the buyer can report a purchase");
  }
  if (action === "settle" && actor.id !== match.buyerId && actor.id !== match.sellerId) {
    throw new HttpError(403, "FORBIDDEN", "Only match participants can report settlement");
  }
  if (action === "reject" && actor.id !== match.buyerId && actor.id !== match.sellerId) {
    throw new HttpError(403, "FORBIDDEN", "Only match participants can report a wallet rejection");
  }
}

function assertMatchSettleable(
  match: MatchRow,
  action: ReportTradeInput["action"],
  existingStatus?: Trade["status"],
) {
  const retrying =
    existingStatus === "FAILED" ||
    existingStatus === "PENDING" ||
    existingStatus === "AWAITING_SIGNATURE" ||
    existingStatus === "REJECTED";
  if (TERMINAL_MATCH.has(match.status) && match.status !== "SETTLED" && !(retrying && match.status === "FAILED")) {
    throw new HttpError(409, "STALE_TRADE", `A ${match.status} match cannot be settled`);
  }
  if (action === "purchase") {
    if (match.listing.status === "CANCELLED" || match.listing.status === "EXPIRED") {
      throw new HttpError(409, "STALE_TRADE", "The listing is no longer active");
    }
    if (match.bid.status === "CANCELLED" || match.bid.status === "EXPIRED") {
      throw new HttpError(409, "STALE_TRADE", "The bid is no longer active");
    }
    if (match.listing.availableUntil.getTime() <= Date.now()) {
      throw new HttpError(409, "STALE_TRADE", "The listing window has expired");
    }
    if (match.bid.requiredUntil.getTime() <= Date.now()) {
      throw new HttpError(409, "STALE_TRADE", "The bid window has expired");
    }
  }
  if (action === "purchase" && match.status === "SETTLED") {
    throw new HttpError(409, "ALREADY_SETTLED", "This match is already settled");
  }
  if (action === "purchase" && match.status === "SETTLEMENT_PENDING" && !retrying) {
    throw new HttpError(409, "ALREADY_SETTLED", "This match already has a purchase in progress");
  }
  if (action === "settle" && match.status === "SETTLED") {
    throw new HttpError(409, "ALREADY_SETTLED", "This match is already settled");
  }
}

async function verifiedAddresses(userId: string): Promise<string[]> {
  const wallets = await prisma.wallet.findMany({
    where: { userId, verifiedAt: { not: null } },
    select: { address: true },
  });
  return wallets.map((wallet) => wallet.address.toLowerCase());
}

function requireWallet(addresses: string[], role: string): string[] {
  if (addresses.length === 0) {
    throw new HttpError(409, "WALLET_REQUIRED", `Verify a ${role} wallet before reporting a trade`);
  }
  return addresses;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

interface TradeWrite {
  status: Trade["status"];
  blockchainTxStatus: Trade["blockchainTxStatus"];
  confirmationStatus?: string | null;
  blockNumber?: number | null;
  contractAddress?: string | null;
  network?: string | null;
  chainId?: number | null;
  gasUsed?: string | null;
  settledAt?: Date | null;
  txHash?: string | null;
}

async function persistTrade(
  match: Match,
  input: ReportTradeInput,
  data: TradeWrite,
  existing: Trade | null,
): Promise<Trade> {
  const quantityKwh = decimalNumber(match.matchedKwh);
  const pricePerKwh = decimalNumber(match.pricePerKwh);
  const totalAmount = roundPrice(quantityKwh * pricePerKwh);
  const txHash = input.txHash ? normalizeTxHash(input.txHash) : data.txHash ?? null;

  try {
    if (existing) {
      return await prisma.trade.update({
        where: { id: existing.id },
        data: {
          status: data.status,
          blockchainTxStatus: data.blockchainTxStatus,
          confirmationStatus: data.confirmationStatus ?? input.action,
          blockNumber: data.blockNumber ?? existing.blockNumber,
          contractAddress: data.contractAddress ?? existing.contractAddress,
          network: data.network ?? existing.network,
          chainId: data.chainId ?? existing.chainId,
          gasUsed: data.gasUsed ?? existing.gasUsed,
          settledAt: data.settledAt ?? existing.settledAt,
          txHash: txHash ?? existing.txHash,
        },
      });
    }
    return await prisma.trade.create({
      data: {
        matchId: match.id,
        buyerId: match.buyerId,
        sellerId: match.sellerId,
        quantityKwh,
        pricePerKwh,
        totalAmount,
        idempotencyKey: input.idempotencyKey,
        txHash,
        status: data.status,
        blockchainTxStatus: data.blockchainTxStatus,
        blockNumber: data.blockNumber ?? null,
        contractAddress: data.contractAddress ?? null,
        network: data.network ?? null,
        chainId: data.chainId ?? null,
        gasUsed: data.gasUsed ?? null,
        confirmationStatus: data.confirmationStatus ?? input.action,
        settledAt: data.settledAt ?? null,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const duplicate = await prisma.trade.findFirst({
      where: {
        OR: [
          { idempotencyKey: input.idempotencyKey },
          ...(txHash ? [{ txHash }] : []),
        ],
      },
    });
    if (duplicate && duplicate.matchId === match.id && duplicate.idempotencyKey === input.idempotencyKey) {
      return duplicate;
    }
    throw new HttpError(409, "DUPLICATE_TX", "This transaction or idempotency key was already used");
  }
}

async function syncMatch(matchId: string, action: ReportTradeInput["action"], trade: Trade) {
  if (trade.blockchainTxStatus === "PENDING" || trade.status === "PENDING") {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "SETTLEMENT_PENDING" },
    });
    return;
  }
  if (trade.blockchainTxStatus === "FAILED" || trade.status === "FAILED") {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: action === "settle" ? "SETTLEMENT_PENDING" : "FAILED" },
    });
    return;
  }
  if (trade.blockchainTxStatus === "CONFIRMED") {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: action === "settle" ? "SETTLED" : "SETTLEMENT_PENDING" },
    });
  }
}

function failVerification(code: string, message: string): never {
  throw new HttpError(409, code, message);
}

function senderAllowed(from: string, allowed: string[]): boolean {
  return allowed.some((address) => sameAddress(address, from));
}

async function verifyNetwork(): Promise<number> {
  const rpc = getChainRpc();
  const chainId = await rpc.getChainId();
  if (chainId !== env.CHAIN_ID) {
    failVerification("WRONG_NETWORK", `RPC chain ${chainId} does not match configured chain ${env.CHAIN_ID}`);
  }
  return chainId;
}

function assertSuccessfulReceipt(receipt: RpcReceipt, contract: string) {
  if (!receipt.to || !sameAddress(receipt.to, contract)) {
    failVerification("WRONG_CONTRACT", "Receipt is not from the configured marketplace contract");
  }
  if (receiptFailed(receipt)) {
    failVerification("TX_REVERTED", "Transaction reverted on-chain");
  }
  if (!receiptSucceeded(receipt)) {
    failVerification("INVALID_EVENT", "Transaction receipt is not successful");
  }
}

function verifyPurchase(
  receipt: RpcReceipt,
  tx: RpcTransaction,
  match: Match,
  contract: string,
  buyerWallets: string[],
) {
  assertSuccessfulReceipt(receipt, contract);
  if (!senderAllowed(tx.from, buyerWallets)) {
    failVerification("WRONG_WALLET", "Transaction sender is not the buyer's verified wallet");
  }
  const events = parseEnergyPurchasedLogs(receipt, contract);
  const expectedQty = toMilliKwh(decimalNumber(match.matchedKwh));
  const expectedPaid = purchaseValueWei(expectedQty, priceToWeiPerMilliKwh(decimalNumber(match.pricePerKwh)));
  const matched = events.find(
    (event) =>
      event.quantityKwh === expectedQty &&
      event.totalPaid === expectedPaid &&
      senderAllowed(event.buyer, buyerWallets),
  );
  if (!matched) {
    if (events.length === 0) failVerification("INVALID_EVENT", "Receipt is missing EnergyPurchased from the marketplace");
    const event = events[0]!;
    if (event.quantityKwh !== expectedQty) {
      failVerification("QUANTITY_MISMATCH", "On-chain quantity does not match the intended trade");
    }
    if (event.totalPaid !== expectedPaid) {
      failVerification("PAYMENT_MISMATCH", "On-chain payment does not match the intended trade");
    }
    failVerification("WRONG_WALLET", "EnergyPurchased buyer does not match the verified wallet");
  }
  if (parseHexBigInt(tx.value) !== expectedPaid) {
    failVerification("PAYMENT_MISMATCH", "Transaction value does not match the intended payment");
  }
}

function verifySettle(
  receipt: RpcReceipt,
  tx: RpcTransaction,
  match: Match,
  contract: string,
  buyerWallets: string[],
  sellerWallets: string[],
) {
  assertSuccessfulReceipt(receipt, contract);
  const allowedSenders = [...buyerWallets, ...sellerWallets];
  if (!senderAllowed(tx.from, allowedSenders)) {
    failVerification("WRONG_WALLET", "Transaction sender is not a participant wallet");
  }
  const events = parseTradeSettledLogs(receipt, contract);
  const expectedQty = toMilliKwh(decimalNumber(match.matchedKwh));
  const matched = events.find(
    (event) =>
      event.quantityKwh === expectedQty &&
      senderAllowed(event.buyer, buyerWallets) &&
      senderAllowed(event.seller, sellerWallets),
  );
  if (!matched) {
    if (events.length === 0) failVerification("INVALID_EVENT", "Receipt is missing TradeSettled from the marketplace");
    const event = events[0]!;
    if (event.quantityKwh !== expectedQty) {
      failVerification("QUANTITY_MISMATCH", "On-chain quantity does not match the intended trade");
    }
    failVerification("WRONG_WALLET", "TradeSettled wallets do not match the verified participants");
  }
}

async function markFailed(
  match: MatchRow,
  input: ReportTradeInput,
  existing: Trade | null,
  error: HttpError,
  extras: Partial<TradeWrite> = {},
): Promise<Trade> {
  const trade = await persistTrade(
    match,
    input,
    {
      status: "FAILED",
      blockchainTxStatus: "FAILED",
      confirmationStatus: `${input.action}:${error.code}`,
      contractAddress: configuredContract().toLowerCase(),
      network: env.CHAIN_NAME,
      chainId: env.CHAIN_ID,
      ...extras,
    },
    existing,
  );
  await syncMatch(match.id, input.action, trade);
  return trade;
}

export async function reportTrade(
  actor: { id: string; role: string },
  input: ReportTradeInput,
): Promise<TradePublic> {
  const match = await loadMatch(input.matchId);
  assertParticipant(actor, match, input.action);

  const txHash = input.txHash ? normalizeTxHash(input.txHash) : null;
  const existing =
    (await prisma.trade.findUnique({ where: { idempotencyKey: input.idempotencyKey } })) ??
    (txHash ? await prisma.trade.findUnique({ where: { txHash } }) : null);

  if (existing && existing.matchId !== match.id) {
    throw new HttpError(409, "DUPLICATE_TX", "This transaction was already used on another trade");
  }
  if (existing && existing.txHash && txHash && existing.txHash !== txHash) {
    throw new HttpError(409, "DUPLICATE_TX", "Idempotency key is bound to a different transaction");
  }
  if (existing && TERMINAL_TRADE.has(existing.status) && existing.status !== "FAILED" && existing.status !== "REJECTED") {
    return toPublicTrade(existing);
  }

  if (input.action === "reject") {
    const trade = await persistTrade(
      match,
      input,
      {
        status: "REJECTED",
        blockchainTxStatus: "REJECTED",
        confirmationStatus: "reject",
      },
      existing,
    );
    return toPublicTrade(trade);
  }

  assertMatchSettleable(match, input.action, existing?.status);
  if (!txHash) {
    throw new HttpError(422, "VALIDATION_ERROR", "txHash is required");
  }
  if (input.action === "settle") {
    const confirmedPurchase = await prisma.trade.findFirst({
      where: { matchId: match.id, status: "CONFIRMED", blockchainTxStatus: "CONFIRMED" },
    });
    if (!confirmedPurchase) {
      throw new HttpError(409, "MATCH_NOT_SETTLEABLE", "Purchase must be confirmed before settleTrade");
    }
  }
  const contract = configuredContract();
  const buyerWallets = requireWallet(await verifiedAddresses(match.buyerId), "buyer");
  const sellerWallets =
    input.action === "settle" ? requireWallet(await verifiedAddresses(match.sellerId), "seller") : [];

  let chainId: number;
  try {
    chainId = await verifyNetwork();
  } catch (error) {
    if (error instanceof HttpError && error.code === "WRONG_NETWORK") {
      const trade = await markFailed(match, input, existing, error);
      throw new HttpError(error.status, error.code, error.message, { trade: toPublicTrade(trade) });
    }
    throw error;
  }

  const rpc = getChainRpc();
  const tx = await rpc.getTransaction(txHash);
  const receipt = await rpc.getTransactionReceipt(txHash);

  if (!receipt) {
    const trade = await persistTrade(
      match,
      input,
      {
        status: "PENDING",
        blockchainTxStatus: "PENDING",
        confirmationStatus: input.action,
        contractAddress: contract.toLowerCase(),
        network: env.CHAIN_NAME,
        chainId,
        txHash,
      },
      existing,
    );
    await syncMatch(match.id, input.action, trade);
    return toPublicTrade(trade);
  }

  const extras: Partial<TradeWrite> = {
    blockNumber: parseHexNumber(receipt.blockNumber),
    gasUsed: receipt.gasUsed === null || receipt.gasUsed === undefined ? null : String(parseHexNumber(receipt.gasUsed) ?? receipt.gasUsed),
    contractAddress: contract.toLowerCase(),
    network: env.CHAIN_NAME,
    chainId,
    txHash,
  };

  if (receiptFailed(receipt)) {
    const trade = await persistTrade(
      match,
      input,
      {
        status: "FAILED",
        blockchainTxStatus: "FAILED",
        confirmationStatus: `${input.action}:TX_REVERTED`,
        ...extras,
      },
      existing,
    );
    await syncMatch(match.id, input.action, trade);
    throw new HttpError(409, "TX_REVERTED", "Transaction reverted on-chain", { trade: toPublicTrade(trade) });
  }

  if (!tx) {
    const error = new HttpError(409, "INVALID_EVENT", "Transaction was not found on the configured RPC");
    const trade = await markFailed(match, input, existing, error, extras);
    throw new HttpError(error.status, error.code, error.message, { trade: toPublicTrade(trade) });
  }

  try {
    if (input.action === "purchase") verifyPurchase(receipt, tx, match, contract, buyerWallets);
    else verifySettle(receipt, tx, match, contract, buyerWallets, sellerWallets);
  } catch (error) {
    if (error instanceof HttpError) {
      const trade = await markFailed(match, input, existing, error, extras);
      throw new HttpError(error.status, error.code, error.message, { trade: toPublicTrade(trade) });
    }
    throw error;
  }

  const confirmed = await persistTrade(
    match,
    input,
    {
      status: input.action === "settle" ? "COMPLETED" : "CONFIRMED",
      blockchainTxStatus: "CONFIRMED",
      confirmationStatus: input.action,
      settledAt: input.action === "settle" ? new Date() : null,
      ...extras,
    },
    existing,
  );
  await syncMatch(match.id, input.action, confirmed);
  if (input.action === "settle") {
    await recordAudit({
      userId: actor.id,
      action: "TRADE_SETTLED",
      entityType: "Trade",
      entityId: confirmed.id,
      metadata: { matchId: match.id, txHash },
    });
  }
  return toPublicTrade(confirmed);
}

export async function getTradeById(
  actor: { id: string; role: string },
  id: string,
): Promise<TradePublic> {
  const trade = await prisma.trade.findUnique({ where: { id } });
  if (!trade) throw new HttpError(404, "TRADE_NOT_FOUND", "Trade not found");
  if (actor.role !== "ADMIN" && trade.buyerId !== actor.id && trade.sellerId !== actor.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only view trades you participate in");
  }
  return toPublicTrade(trade);
}

export async function listTrades(
  actor: { id: string; role: string },
  filter: { page: number; pageSize: number; matchId?: string; sortOrder?: "asc" | "desc" },
): Promise<{ trades: TradePublic[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const where: Prisma.TradeWhereInput = {};
  if (actor.role !== "ADMIN") {
    where.OR = [{ buyerId: actor.id }, { sellerId: actor.id }];
  }
  if (filter.matchId) where.matchId = filter.matchId;
  const page = filter.page;
  const pageSize = filter.pageSize;
  const [total, rows] = await prisma.$transaction([
    prisma.trade.count({ where }),
    prisma.trade.findMany({
      where,
      orderBy: { createdAt: filter.sortOrder ?? "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return {
    trades: rows.map(toPublicTrade),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}
