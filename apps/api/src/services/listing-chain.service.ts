import type { Listing } from "@prisma/client";
import type { ListingPublic, ReportOnChainListingInput } from "@enermesh/shared";
import { env } from "../config/env.js";
import { recordAudit } from "../lib/audit.js";
import {
  configuredContractAddress,
  explorerTxUrl,
  getChainRpc,
  parseHexNumber,
  receiptFailed,
  receiptSucceeded,
  type RpcReceipt,
  type RpcTransaction,
} from "../lib/chain-rpc.js";
import {
  isConfiguredContractAddress,
  parseCreateListingInput,
  parseListingCreatedLogs,
  priceToWeiPerMilliKwh,
  sameAddress,
  toMilliKwh,
  uuidToUint256,
} from "../lib/marketplace-events.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { emitListingUpdated } from "../socket/index.js";
import { listingInclude, toPublicListing } from "./listing.service.js";
import { createNotification } from "./notification.service.js";

const TERMINAL_CONFIRMED = new Set(["CONFIRMED"]);

type ListingWithSeller = Listing & { seller: { displayName: string } };

interface OnChainWrite {
  onChainListingId?: string | null;
  onChainTxHash?: string | null;
  onChainIdempotencyKey?: string | null;
  onChainContractAddress?: string | null;
  onChainNetwork?: string | null;
  onChainChainId?: number | null;
  onChainBlockNumber?: number | null;
  onChainConfirmationStatus: string;
  onChainConfirmedAt?: Date | null;
}

function failVerification(code: string, message: string): never {
  throw new HttpError(409, code, message);
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

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

function uniqueTarget(error: unknown): string | undefined {
  const meta = typeof error === "object" && error !== null ? (error as { meta?: { target?: unknown } }).meta : undefined;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String).join(",");
  if (typeof target === "string") return target;
  return undefined;
}

function decimalNumber(value: { toString(): string } | number | string): number {
  return typeof value === "number" ? value : Number(value.toString());
}

function senderAllowed(from: string, allowed: string[]): boolean {
  return allowed.some((address) => sameAddress(address, from));
}

async function verifiedAddresses(userId: string): Promise<string[]> {
  const wallets = await prisma.wallet.findMany({
    where: { userId, verifiedAt: { not: null } },
    select: { address: true },
  });
  return wallets.map((wallet) => wallet.address.toLowerCase());
}

function requireWallet(addresses: string[]): string[] {
  if (addresses.length === 0) {
    throw new HttpError(409, "WALLET_REQUIRED", "Verify a wallet before publishing a listing on-chain");
  }
  return addresses;
}

async function verifyNetwork(): Promise<number> {
  const rpc = getChainRpc();
  const chainId = await rpc.getChainId();
  if (chainId !== env.CHAIN_ID) {
    failVerification("WRONG_NETWORK", `RPC chain ${chainId} does not match configured chain ${env.CHAIN_ID}`);
  }
  return chainId;
}

function assertOwner(actor: { id: string; role: string }, listing: Listing) {
  if (actor.role === "ADMIN") return;
  if (listing.sellerId !== actor.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only confirm on-chain ids for your own listings");
  }
}

function assertConfirmable(listing: Listing, existingStatus?: string | null) {
  const retrying = existingStatus === "FAILED" || existingStatus === "PENDING" || existingStatus === "REJECTED";
  if (listing.status === "CANCELLED" || listing.status === "EXPIRED") {
    throw new HttpError(409, "STALE_LISTING", "The listing is no longer active");
  }
  if (listing.onChainListingId && existingStatus === "CONFIRMED" && !retrying) {
    return;
  }
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

function verifyListingCreated(
  receipt: RpcReceipt,
  tx: RpcTransaction,
  listing: Listing,
  contract: string,
  sellerWallets: string[],
): string {
  assertSuccessfulReceipt(receipt, contract);
  if (!senderAllowed(tx.from, sellerWallets)) {
    failVerification("WRONG_WALLET", "Transaction sender is not the seller's verified wallet");
  }
  const events = parseListingCreatedLogs(receipt, contract);
  if (events.length === 0) {
    failVerification("INVALID_EVENT", "Receipt is missing ListingCreated from the marketplace");
  }
  if (events.length !== 1) {
    failVerification("INVALID_EVENT", "Receipt has more than one ListingCreated event");
  }
  const event = events[0]!;
  if (!senderAllowed(event.seller, sellerWallets)) {
    failVerification("WRONG_WALLET", "ListingCreated seller does not match the verified wallet");
  }

  const call = parseCreateListingInput(tx.input);
  if (!call) {
    failVerification("INVALID_EVENT", "Transaction is not a createListing call");
  }
  const expectedExternalId = uuidToUint256(listing.id);
  if (call.externalId !== expectedExternalId) {
    failVerification("WRONG_LISTING", "On-chain createListing externalId does not match this listing");
  }

  const expectedQty = toMilliKwh(decimalNumber(listing.availableQuantityKwh));
  const expectedPrice = priceToWeiPerMilliKwh(decimalNumber(listing.pricePerKwh));
  if (event.quantityKwh !== expectedQty || call.quantityKwh !== expectedQty) {
    failVerification("QUANTITY_MISMATCH", "On-chain quantity does not match this listing");
  }
  if (event.pricePerKwh !== expectedPrice || call.pricePerKwh !== expectedPrice) {
    failVerification("PAYMENT_MISMATCH", "On-chain price does not match this listing");
  }
  if (event.listingId <= 0n) {
    failVerification("INVALID_EVENT", "ListingCreated listingId is missing");
  }
  return event.listingId.toString();
}

async function persistOnChain(
  listing: ListingWithSeller,
  input: ReportOnChainListingInput,
  data: OnChainWrite,
): Promise<ListingWithSeller> {
  const txHash =
    input.txHash !== undefined
      ? normalizeTxHash(input.txHash)
      : data.onChainTxHash === undefined
        ? listing.onChainTxHash
        : data.onChainTxHash;
  try {
    return await prisma.listing.update({
      where: { id: listing.id },
      data: {
        onChainListingId: data.onChainListingId === undefined ? listing.onChainListingId : data.onChainListingId,
        onChainTxHash: txHash,
        onChainIdempotencyKey: data.onChainIdempotencyKey ?? input.idempotencyKey,
        onChainContractAddress: data.onChainContractAddress ?? listing.onChainContractAddress,
        onChainNetwork: data.onChainNetwork ?? listing.onChainNetwork,
        onChainChainId: data.onChainChainId ?? listing.onChainChainId,
        onChainBlockNumber: data.onChainBlockNumber === undefined ? listing.onChainBlockNumber : data.onChainBlockNumber,
        onChainConfirmationStatus: data.onChainConfirmationStatus,
        onChainConfirmedAt: data.onChainConfirmedAt === undefined ? listing.onChainConfirmedAt : data.onChainConfirmedAt,
      },
      include: listingInclude,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const current = await prisma.listing.findUnique({ where: { id: listing.id }, include: listingInclude });
    if (
      current &&
      (data.onChainListingId ? current.onChainListingId === data.onChainListingId : true) &&
      (txHash ? current.onChainTxHash === txHash : true)
    ) {
      return current;
    }
    if (data.onChainListingId) {
      const other = await prisma.listing.findUnique({ where: { onChainListingId: data.onChainListingId } });
      if (other && other.id !== listing.id) {
        throw new HttpError(409, "DUPLICATE_ONCHAIN_ID", "This on-chain listing id is already mapped to another listing");
      }
    }
    const target = uniqueTarget(error) ?? "";
    if (target.includes("onChainListingId")) {
      throw new HttpError(409, "DUPLICATE_ONCHAIN_ID", "This on-chain listing id is already mapped to another listing");
    }
    throw new HttpError(409, "DUPLICATE_TX", "This transaction or idempotency key was already used");
  }
}

async function notifyListing(listing: ListingWithSeller, publicListing: ListingPublic, failed: boolean) {
  emitListingUpdated(publicListing);
  const confirmed = publicListing.onChainConfirmationStatus === "CONFIRMED" && Boolean(publicListing.onChainListingId);
  await createNotification({
    userId: listing.sellerId,
    type: "LISTING_UPDATED",
    title: confirmed ? "On-chain listing id verified" : failed ? "On-chain listing verification failed" : "On-chain listing pending",
    body: confirmed
      ? `Listing ${listing.id} is mapped to on-chain id ${publicListing.onChainListingId}.`
      : failed
        ? `On-chain listing verification for ${listing.id} failed and was not confirmed.`
        : `On-chain listing transaction for ${listing.id} is pending API verification.`,
    metadata: {
      listingId: listing.id,
      onChainListingId: publicListing.onChainListingId ?? null,
      onChainConfirmationStatus: publicListing.onChainConfirmationStatus ?? null,
      explorerUrl: publicListing.explorerUrl ?? explorerTxUrl(publicListing.onChainTxHash),
    },
  });
}

export async function reportOnChainListing(
  actor: { id: string; role: string },
  listingId: string,
  input: ReportOnChainListingInput,
): Promise<ListingPublic> {
  const existing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: listingInclude,
  });
  if (!existing) throw new HttpError(404, "LISTING_NOT_FOUND", "Listing not found");
  assertOwner(actor, existing);

  const txHash = input.txHash ? normalizeTxHash(input.txHash) : null;
  if (existing.onChainIdempotencyKey && existing.onChainIdempotencyKey !== input.idempotencyKey) {
    const other = await prisma.listing.findUnique({ where: { onChainIdempotencyKey: input.idempotencyKey } });
    if (other && other.id !== existing.id) {
      throw new HttpError(409, "DUPLICATE_TX", "This idempotency key was already used on another listing");
    }
  }

  if (txHash) {
    const byHash = await prisma.listing.findUnique({ where: { onChainTxHash: txHash } });
    if (byHash && byHash.id !== existing.id) {
      throw new HttpError(409, "DUPLICATE_TX", "This transaction was already used on another listing");
    }
  }

  const byKey = await prisma.listing.findUnique({ where: { onChainIdempotencyKey: input.idempotencyKey } });
  if (byKey && byKey.id !== existing.id) {
    throw new HttpError(409, "DUPLICATE_TX", "This idempotency key was already used on another listing");
  }

  if (
    existing.onChainListingId &&
    existing.onChainConfirmationStatus &&
    TERMINAL_CONFIRMED.has(existing.onChainConfirmationStatus)
  ) {
    if (txHash && existing.onChainTxHash && existing.onChainTxHash !== txHash) {
      throw new HttpError(409, "DUPLICATE_TX", "This listing is already mapped to a different transaction");
    }
    return toPublicListing(existing);
  }

  if (input.action === "reject") {
    const updated = await persistOnChain(existing, input, {
      onChainListingId: null,
      onChainTxHash: null,
      onChainConfirmationStatus: "REJECTED",
      onChainConfirmedAt: null,
    });
    const publicListing = toPublicListing(updated);
    await notifyListing(updated, publicListing, true);
    return publicListing;
  }

  assertConfirmable(existing, existing.onChainConfirmationStatus);
  if (!txHash) {
    throw new HttpError(422, "VALIDATION_ERROR", "txHash is required");
  }

  const contract = configuredContract();
  const sellerWallets = requireWallet(await verifiedAddresses(existing.sellerId));

  let chainId: number;
  try {
    chainId = await verifyNetwork();
  } catch (error) {
    if (error instanceof HttpError && error.code === "WRONG_NETWORK") {
      const updated = await persistOnChain(existing, input, {
        onChainConfirmationStatus: "FAILED",
        onChainContractAddress: contract.toLowerCase(),
        onChainNetwork: env.CHAIN_NAME,
        onChainChainId: env.CHAIN_ID,
        onChainTxHash: txHash,
      });
      const publicListing = toPublicListing(updated);
      await notifyListing(updated, publicListing, true);
      throw new HttpError(error.status, error.code, error.message, { listing: publicListing });
    }
    throw error;
  }

  const rpc = getChainRpc();
  const tx = await rpc.getTransaction(txHash);
  const receipt = await rpc.getTransactionReceipt(txHash);

  if (!receipt) {
    const updated = await persistOnChain(existing, input, {
      onChainConfirmationStatus: "PENDING",
      onChainContractAddress: contract.toLowerCase(),
      onChainNetwork: env.CHAIN_NAME,
      onChainChainId: chainId,
      onChainTxHash: txHash,
      onChainListingId: null,
      onChainConfirmedAt: null,
    });
    const publicListing = toPublicListing(updated);
    await notifyListing(updated, publicListing, false);
    return publicListing;
  }

  const extras: OnChainWrite = {
    onChainBlockNumber: parseHexNumber(receipt.blockNumber),
    onChainContractAddress: contract.toLowerCase(),
    onChainNetwork: env.CHAIN_NAME,
    onChainChainId: chainId,
    onChainTxHash: txHash,
    onChainConfirmationStatus: "FAILED",
  };

  if (receiptFailed(receipt)) {
    const updated = await persistOnChain(existing, input, {
      ...extras,
      onChainConfirmationStatus: "FAILED",
      onChainListingId: null,
      onChainConfirmedAt: null,
    });
    const publicListing = toPublicListing(updated);
    await notifyListing(updated, publicListing, true);
    throw new HttpError(409, "TX_REVERTED", "Transaction reverted on-chain", { listing: publicListing });
  }

  if (!tx) {
    const error = new HttpError(409, "INVALID_EVENT", "Transaction was not found on the configured RPC");
    const updated = await persistOnChain(existing, input, {
      ...extras,
      onChainListingId: null,
      onChainConfirmedAt: null,
    });
    const publicListing = toPublicListing(updated);
    await notifyListing(updated, publicListing, true);
    throw new HttpError(error.status, error.code, error.message, { listing: publicListing });
  }

  let onChainListingId: string;
  try {
    onChainListingId = verifyListingCreated(receipt, tx, existing, contract, sellerWallets);
  } catch (error) {
    if (error instanceof HttpError) {
      const updated = await persistOnChain(existing, input, {
        ...extras,
        onChainListingId: null,
        onChainConfirmedAt: null,
        onChainConfirmationStatus: "FAILED",
      });
      const publicListing = toPublicListing(updated);
      await notifyListing(updated, publicListing, true);
      throw new HttpError(error.status, error.code, error.message, { listing: publicListing });
    }
    throw error;
  }

  const confirmed = await persistOnChain(existing, input, {
    ...extras,
    onChainListingId,
    onChainConfirmationStatus: "CONFIRMED",
    onChainConfirmedAt: new Date(),
  });
  await recordAudit({
    userId: actor.id,
    action: "LISTING_UPDATED",
    entityType: "Listing",
    entityId: confirmed.id,
    metadata: { onChainListingId, txHash, contract: contract.toLowerCase(), chainId },
  });
  const publicListing = toPublicListing(confirmed);
  await notifyListing(confirmed, publicListing, false);
  return publicListing;
}
