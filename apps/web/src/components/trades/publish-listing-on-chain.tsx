"use client";

import type { ListingPublic } from "@enermesh/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { TxStatusBanner } from "@/components/wallet/tx-status";
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
import {
  encodeCreateListing,
  formatWeiAmount,
  getStoredOnChainListingId,
  listingIdFromCreatedLog,
  priceToWeiPerMilliKwh,
  storeOnChainListingId,
  toMilliKwh,
  uuidToUint256,
} from "@/lib/marketplace";
import { formatKwh, formatPrice } from "@/lib/utils";

export function PublishListingOnChain({ listing }: { listing: ListingPublic }) {
  const user = useAuthStore((state) => state.user);
  const wallet = useWallet();
  const config = getChainConfig();
  const [phase, setPhase] = useState<WalletTxPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onChainListingId, setOnChainListingId] = useState<string | null>(null);

  useEffect(() => {
    setOnChainListingId(getStoredOnChainListingId(listing.id));
  }, [listing.id]);

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

  const submit = useCallback(async () => {
    setError(null);
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
      const receipt = await waitForReceipt(provider, hash);
      if (!receiptSucceeded(receipt)) {
        setPhase("failed");
        setError("The listing transaction reverted on-chain.");
        return;
      }
      const created = (receipt.logs ?? []).map(listingIdFromCreatedLog).find((id) => id !== null);
      if (created !== undefined && created !== null) {
        const stored = created.toString();
        storeOnChainListingId(listing.id, stored);
        setOnChainListingId(stored);
      }
      setPhase("mined");
    } catch (caught) {
      const next = walletPhaseFromError(caught);
      setPhase(next);
      setError(isUserRejected(caught) ? "You rejected the request in MetaMask." : describeWalletError(caught));
    }
  }, [config, contractReady, encoded, listing.id, wallet]);

  if (!owned || !live) return null;

  return (
    <section className="mt-4 space-y-3 rounded-md border border-border bg-background p-4">
      <div>
        <h3 className="font-medium">Publish listing on-chain</h3>
        <p className="mt-1 text-sm text-muted">
          Records remaining energy and price on EnerMeshMarketplace. This is digital evidence, not physical delivery.
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
      {onChainListingId ? <p className="text-xs text-muted">On-chain listing id {onChainListingId}</p> : null}
      <TxStatusBanner
        phase={phase === "idle" ? "review" : phase}
        txHash={txHash}
        explorerUrl={config.explorerUrl}
        chainName={config.chainName}
        error={error ?? wallet.error}
        blockchainTxStatus={blockchainStatusFromPhase(phase) ?? "WAITING_FOR_SIGNATURE"}
      />
      <Button onClick={() => void submit()} disabled={busy || !contractReady || wallet.hasProvider === false || Boolean(encoded.encodeError)}>
        {phase === "awaiting_signature" ? "Waiting for signature…" : phase === "pending" ? "Pending…" : "Sign createListing"}
      </Button>
    </section>
  );
}
