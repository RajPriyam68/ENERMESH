import type { Wallet } from "@prisma/client";
import { verifyMessage } from "ethers";
import { env } from "../config/env.js";
import { recordAudit } from "../lib/audit.js";
import { randomHex } from "../lib/crypto.js";
import { buildWalletChallenge } from "../lib/wallet-message.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { emitDashboard } from "../socket/index.js";
import { createNotification } from "./notification.service.js";

const NONCE_TTL_MS = 5 * 60 * 1000;

export interface PublicWallet {
  id: string;
  address: string;
  chainId: number;
  isPrimary: boolean;
  isVerified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}

export function toPublicWallet(wallet: Wallet): PublicWallet {
  return {
    id: wallet.id,
    address: wallet.address,
    chainId: wallet.chainId,
    isPrimary: wallet.isPrimary,
    isVerified: wallet.verifiedAt !== null,
    verifiedAt: wallet.verifiedAt?.toISOString() ?? null,
    createdAt: wallet.createdAt.toISOString(),
  };
}

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

/**
 * Issues a single-use, time-boxed challenge for a wallet address. The nonce is
 * rotated on every request so a previously captured signature cannot be replayed.
 */
export async function requestWalletNonce(
  userId: string,
  input: { address: string; chainId?: number },
): Promise<{ address: string; chainId: number; nonce: string; message: string; expiresAt: string }> {
  const address = normalizeAddress(input.address);
  const chainId = input.chainId ?? env.CHAIN_ID;

  const existing = await prisma.wallet.findUnique({ where: { address } });
  if (existing && existing.userId !== userId) {
    throw new HttpError(409, "WALLET_ALREADY_LINKED", "This wallet is already linked to another account");
  }

  const nonce = randomHex(16);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_MS);

  if (existing) {
    await prisma.wallet.update({
      where: { address },
      data: { nonce, nonceIssuedAt: now, nonceExpiresAt: expiresAt, chainId },
    });
  } else {
    await prisma.wallet.create({
      data: {
        userId,
        address,
        chainId,
        isPrimary: true,
        nonce,
        nonceIssuedAt: now,
        nonceExpiresAt: expiresAt,
      },
    });
  }

  return {
    address,
    chainId,
    nonce,
    message: buildWalletChallenge({ address, nonce, chainId, issuedAt: now }),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Verifies an EIP-191 personal_sign signature against the stored challenge.
 * The nonce is consumed regardless of outcome to prevent brute-force retries.
 */
export async function verifyWalletSignature(
  userId: string,
  input: { address: string; signature: string; nonce: string },
): Promise<PublicWallet> {
  const address = normalizeAddress(input.address);

  const wallet = await prisma.wallet.findUnique({ where: { address } });
  if (!wallet) {
    throw new HttpError(404, "WALLET_NOT_FOUND", "Request a verification challenge first");
  }
  if (wallet.userId !== userId) {
    throw new HttpError(403, "FORBIDDEN", "This wallet belongs to another account");
  }
  if (!wallet.nonce || !wallet.nonceExpiresAt || !wallet.nonceIssuedAt) {
    throw new HttpError(409, "NONCE_MISSING", "No active verification challenge for this wallet");
  }
  if (wallet.nonceExpiresAt.getTime() <= Date.now()) {
    await prisma.wallet.update({
      where: { address },
      data: { nonce: null, nonceIssuedAt: null, nonceExpiresAt: null },
    });
    throw new HttpError(410, "NONCE_EXPIRED", "Verification challenge has expired");
  }
  if (wallet.nonce !== input.nonce) {
    throw new HttpError(422, "NONCE_MISMATCH", "Verification challenge does not match the issued nonce");
  }

  const message = buildWalletChallenge({
    address,
    nonce: wallet.nonce,
    chainId: wallet.chainId,
    issuedAt: wallet.nonceIssuedAt,
  });

  let recovered: string | null = null;
  try {
    recovered = verifyMessage(message, input.signature);
  } catch {
    recovered = null;
  }

  // Consume the challenge now: it is valid exactly once, pass or fail.
  await prisma.wallet.update({
    where: { address },
    data: { nonce: null, nonceIssuedAt: null, nonceExpiresAt: null },
  });

  if (!recovered || normalizeAddress(recovered) !== address) {
    throw new HttpError(401, "SIGNATURE_INVALID", "Signature does not match the wallet address");
  }

  const verified = await prisma.wallet.update({
    where: { address },
    data: { verifiedAt: new Date() },
  });

  await recordAudit({
    userId,
    action: "WALLET_LINKED",
    entityType: "Wallet",
    entityId: verified.id,
    metadata: { address, chainId: verified.chainId },
  });

  emitDashboard([userId], { reason: "wallet" });
  await createNotification({
    userId,
    type: "WALLET_CONNECTED",
    title: "Wallet verified",
    body: `Wallet ${address} is linked and ready for marketplace actions.`,
    metadata: { address, chainId: verified.chainId },
  });

  return toPublicWallet(verified);
}

export async function listWallets(userId: string): Promise<PublicWallet[]> {
  const wallets = await prisma.wallet.findMany({
    where: { userId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
  });
  return wallets.map(toPublicWallet);
}

export async function unlinkWallet(userId: string, address: string): Promise<{ removed: true }> {
  const normalized = normalizeAddress(address);
  const wallet = await prisma.wallet.findUnique({ where: { address: normalized } });
  if (!wallet || wallet.userId !== userId) {
    throw new HttpError(404, "WALLET_NOT_FOUND", "Wallet not found for this account");
  }
  await prisma.wallet.delete({ where: { address: normalized } });
  return { removed: true };
}
