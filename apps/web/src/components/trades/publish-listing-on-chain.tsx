"use client";

import type { ListingPublic } from "@enermesh/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TxStatusBanner } from "@/components/wallet/tx-status";
import { ApiError } from "@/lib/api";
import { getChainConfig, isConfiguredContractAddress } from "@/lib/chain";
import {
  blockchainStatusFromPhase,
  describeWalletError,
  ensureChain,
  getInjectedProvider,
  isUserRejected,
  receiptSucceeded,
  sendContractTransaction,
  waitForReceipt,
  walletPhaseFromError,
  type WalletTxPhase,
} from "@/lib/ethereum";
import { useAuthStore } from "@/lib/auth-store";
import { useWallet } from "@/lib/use-wallet";
import { encodeCreateListing, formatWeiAmount, priceToWeiPerMilliKwh, toMilliKwh, uuidToUint256 } from "@/lib/marketplace";
import { reportOnChainListing, rotateListingIdempotencyKey } from "@/lib/listings";
import { formatKwh, formatPrice } from "@/lib/utils";

export function PublishListingOnChain({ listing }: { listing: ListingPublic }) {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const config = getChainConfig();
  const [phase, setPhase] = useState<WalletTxPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(listing.onChainTxHash ?? null);
  const [error, setError] = useState<string | null>(null);
  const [apiListing, setApiListing] = useState<ListingPublic>(listing);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    setApiListing(listing);
    setTxHash(listing.onChainTxHash ?? null);
  }, [listing]);

  const encoded = useMemo(() => {
    try {
      const quantityMilli = toMilliKwh(listing.availableQuantityKwh);
      const priceWei = priceToWeiPerMilliKwh(listing.pricePerKwh);
      return { quantityMilli, priceWei, encodeError: null as string | null };
    } catch (caught) {
      return {
        quantityMilli: 0n,
        priceWei: 0n,
        encodeError: caught instanceof Error ? caught.message : "Invalid listing amounts",
      };
    }
  }, [listing.availableQuantityKwh, listing.pricePerKwh]);

  const contractReady = isConfiguredContractAddress(config.contractAddress);
  const owned = user?.id === listing.sellerId;
  const live = listing.status === "ACTIVE" || listing.status === "PARTIALLY_FILLED";
  const busy = phase === "connecting" || phase === "awaiting_signature" || phase === "pending";
  const persistedId = apiListing.onChainListingId ?? listing.onChainListingId;
  const persistedStatus = apiListing.onChainConfirmationStatus ?? listing.onChainConfirmationStatus;
  const persistedExplorer = apiListing.explorerUrl ?? listing.explorerUrl;
  const confirmed = persistedStatus === "CONFIRMED" && Boolean(persistedId);
  const pending = persistedStatus === "PENDING";
  const failed = persistedStatus === "FAILED" || persistedStatus === "REJECTED";

  const submitReport = useCallback(
    async (action: "confirm" | "reject", hash?: string) => {
      try {
        const next = await reportOnChainListing(token, listing.id, { action, txHash: hash });
        setApiListing(next);
        setApiError(null);
        void queryClient.invalidateQueries({ queryKey: ["listings"] });
        void queryClient.invalidateQueries({ queryKey: ["listing"] });
        return next;
      } catch (caught) {
        const message = caught instanceof ApiError ? caught.message : "The API could not verify this listing transaction.";
        setApiError(message);
        if (caught instanceof ApiError && caught.details && typeof caught.details === "object" && "listing" in caught.details) {
          const reported = (caught.details as { listing?: ListingPublic }).listing;
          if (reported) setApiListing(reported);
        }
        return null;
      }
    },
    [listing.id, queryClient, token],
  );

  const submit = useCallback(async () => {
    setError(null);
    setApiError(null);
    setTxHash(null);
    if (encoded.encodeError) {
      setPhase("failed");
      setError(encoded.encodeError);
      return;
    }
    const provider = getInjectedProvider();
    if (!provider) {
      setPhase("failed");
      setError("No browser wallet detected.");
      return;
    }
    if (!contractReady) {
      setPhase("failed");
      setError("NEXT_PUBLIC_CONTRACT_ADDRESS is not set.");
      return;
    }
    try {
      setPhase("connecting");
      const account = wallet.account ?? (await wallet.connect());
      setPhase("wrong_network");
      await ensureChain(provider, config);
      const call = encodeCreateListing(encoded.quantityMilli, encoded.priceWei, uuidToUint256(listing.id));
      setPhase("awaiting_signature");
      const hash = await sendContractTransaction(provider, {
        from: account,
        to: config.contractAddress,
        data: call.data,
        valueWei: 0n,
      });
      setTxHash(hash);
      setPhase("pending");
      await submitReport("confirm", hash);
      const receipt = await waitForReceipt(provider, hash);
      if (!receiptSucceeded(receipt)) {
        setPhase("failed");
        setError("The listing transaction reverted on-chain.");
        await submitReport("confirm", hash);
        return;
      }
      setPhase("mined");
      await submitReport("confirm", hash);
    } catch (caught) {
      const next = walletPhaseFromError(caught);
      setPhase(next);
      setError(isUserRejected(caught) ? "You rejected the request in MetaMask." : describeWalletError(caught));
      if (isUserRejected(caught)) {
        await submitReport("reject");
        rotateListingIdempotencyKey(listing.id, "confirm");
      }
    }
  }, [config, contractReady, encoded, listing.id, submitReport, wallet]);

  if (!owned || !live) return null;

  return (
    <section className="mt-4 space-y-3 rounded-md border border-border bg-background p-4">
      <div>
        <h3 className="font-medium">Publish listing on-chain</h3>
        <p className="mt-1 text-sm text-muted">
          Records remaining energy and price on EnerMeshMarketplace. A mined wallet receipt is not confirmation.
        </p>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Remaining</dt>
          <dd>{formatKwh(listing.availableQuantityKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Ask</dt>
          <dd>{formatPrice(listing.pricePerKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Wei / milli-kWh</dt>
          <dd>{formatWeiAmount(encoded.priceWei, config.nativeCurrency.symbol, 18)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Network</dt>
          <dd>
            {config.chainName} ({config.chainId})
          </dd>
        </div>
      </dl>
      {!contractReady ? (
        <Alert tone="warning" role="alert" title="Contract address missing">
          Set NEXT_PUBLIC_CONTRACT_ADDRESS before signing createListing.
        </Alert>
      ) : null}
      {wallet.hasProvider === false ? <Alert tone="info">Install MetaMask to publish this listing.</Alert> : null}
      {wallet.account && !wallet.onExpectedChain ? (
        <Alert tone="warning" role="alert" title="Wrong network">
          Switch to {config.chainName} ({config.chainId}).
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => void wallet.switchToExpectedChain()} disabled={wallet.switching}>
              Switch network
            </Button>
          </div>
        </Alert>
      ) : null}
      {confirmed && persistedId ? (
        <p className="text-xs text-muted">
          On-chain listing id {persistedId}
          {persistedExplorer ? (
            <>
              {" "}
              ·{" "}
              <a className="underline" href={persistedExplorer} target="_blank" rel="noreferrer">
                Explorer
              </a>
            </>
          ) : null}
        </p>
      ) : pending ? (
        <p className="text-xs text-muted">On-chain listing id pending API verification.</p>
      ) : failed ? (
        <p className="text-xs text-muted">On-chain listing verification {persistedStatus?.toLowerCase()}.</p>
      ) : null}
      <TxStatusBanner
        phase={phase === "idle" ? "review" : phase}
        txHash={txHash ?? apiListing.onChainTxHash}
        explorerUrl={config.explorerUrl}
        chainName={config.chainName}
        error={error ?? wallet.error}
        blockchainTxStatus={
          blockchainStatusFromPhase(phase) ??
          (persistedStatus === "CONFIRMED" || persistedStatus === "PENDING"
            ? "PENDING"
            : persistedStatus === "FAILED" || persistedStatus === "REJECTED"
              ? persistedStatus
              : "WAITING_FOR_SIGNATURE")
        }
      />
      {apiListing.onChainConfirmationStatus ? (
        <p className="text-xs text-muted">
          API verification: {apiListing.onChainConfirmationStatus.replaceAll("_", " ")}
          {confirmed ? " (marketplace confirmed)" : " (wallet UI is not confirmation)"}
        </p>
      ) : null}
      {apiError ? (
        <Alert tone="error" role="alert" title="Verification failed">
          {apiError}
        </Alert>
      ) : null}
      {confirmed ? <p className="text-xs text-muted">On-chain listing id already verified. Do not sign createListing again.</p> : null}
      <Button
        onClick={() => void submit()}
        disabled={busy || confirmed || !contractReady || wallet.hasProvider === false || Boolean(encoded.encodeError)}
      >
        {phase === "awaiting_signature" ? "Waiting for signature…" : phase === "pending" ? "Pending…" : "Sign createListing"}
      </Button>
    </section>
  );
}
