"use client";

import type { MatchPublic, TradePublic } from "@enermesh/shared";
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
  ethCall,
  getInjectedProvider,
  isUserRejected,
  normalizeAddress,
  receiptSucceeded,
  sendContractTransaction,
  waitForReceipt,
  walletPhaseFromError,
  type WalletTxPhase,
} from "@/lib/ethereum";
import { useWallet } from "@/lib/use-wallet";
import {
  encodeListingsQuery,
  encodePurchaseEnergy,
  encodeSettleTrade,
  formatWeiAmount,
  getStoredOnChainListingId,
  getStoredOnChainTradeId,
  parseOnChainListing,
  priceToWeiPerMilliKwh,
  purchaseValueWei,
  storeOnChainTradeId,
  toMilliKwh,
  tradeIdFromPurchasedLog,
} from "@/lib/marketplace";
import { useAuthStore } from "@/lib/auth-store";
import { listTradesForMatch, reportTrade, rotateTradeIdempotencyKey } from "@/lib/trades";
import { formatKwh, formatPrice } from "@/lib/utils";

type TradeAction = "purchase" | "settle";

function actionCopy(action: TradeAction) {
  if (action === "settle") {
    return { title: "Settle purchased energy", cta: "Sign settleTrade", method: "settleTrade(uint256)" };
  }
  return { title: "Review trade", cta: "Sign purchaseEnergy", method: "purchaseEnergy(uint256,uint256)" };
}

export function ReviewTrade({ match, action }: { match: MatchPublic; action: TradeAction }) {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const config = getChainConfig();
  const labels = actionCopy(action);
  const [phase, setPhase] = useState<WalletTxPhase>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onChainListingId, setOnChainListingId] = useState<string | null>(null);
  const [onChainTradeId, setOnChainTradeId] = useState<string | null>(null);
  const [apiTrade, setApiTrade] = useState<TradePublic | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    setOnChainListingId(getStoredOnChainListingId(match.listingId));
    setOnChainTradeId(getStoredOnChainTradeId(match.id));
  }, [match.id, match.listingId]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void listTradesForMatch(token, match.id)
      .then((trades) => {
        if (cancelled) return;
        const latest =
          trades.find((trade) => (action === "settle" ? trade.status === "COMPLETED" : trade.status !== "COMPLETED")) ??
          trades[0];
        if (latest) setApiTrade(latest);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [action, match.id, token]);

  const submitReport = useCallback(
    async (reportAction: TradeAction | "reject", hash?: string) => {
      try {
        const trade = await reportTrade(token, {
          matchId: match.id,
          action: reportAction,
          txHash: hash,
        });
        setApiTrade(trade);
        setApiError(null);
        void queryClient.invalidateQueries({ queryKey: ["matches"] });
        return trade;
      } catch (caught) {
        const message = caught instanceof ApiError ? caught.message : "The API could not verify this transaction.";
        setApiError(message);
        return null;
      }
    },
    [match.id, queryClient, token],
  );

  const encoded = useMemo(() => {
    try {
      const quantityMilli = toMilliKwh(match.matchedKwh);
      const priceWei = priceToWeiPerMilliKwh(match.pricePerKwh);
      return { quantityMilli, priceWei, valueWei: purchaseValueWei(quantityMilli, priceWei), encodeError: null as string | null };
    } catch (caught) {
      return {
        quantityMilli: 0n,
        priceWei: 0n,
        valueWei: 0n,
        encodeError: caught instanceof Error ? caught.message : "Invalid trade amounts",
      };
    }
  }, [match.matchedKwh, match.pricePerKwh]);

  const contractReady = isConfiguredContractAddress(config.contractAddress);
  const blockchainTxStatus = blockchainStatusFromPhase(phase);
  const isBuyer = user?.id === match.buyerId;
  const isSeller = user?.id === match.sellerId;
  const purchaseLocked =
    action === "purchase" &&
    (match.status === "SETTLEMENT_PENDING" ||
      match.status === "SETTLED" ||
      apiTrade?.status === "PENDING" ||
      apiTrade?.status === "CONFIRMED" ||
      apiTrade?.status === "COMPLETED");
  const settleLocked =
    action === "settle" && (match.status === "SETTLED" || apiTrade?.status === "COMPLETED");
  const settleReady =
    action !== "settle" ||
    match.status === "SETTLEMENT_PENDING" ||
    match.status === "SETTLED" ||
    apiTrade?.status === "CONFIRMED" ||
    apiTrade?.status === "COMPLETED";
  const allowed =
    ((action === "purchase" && isBuyer) || (action === "settle" && (isBuyer || isSeller))) &&
    (action !== "settle" || settleReady);
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
      setError("NEXT_PUBLIC_CONTRACT_ADDRESS is not set. Configure the marketplace contract before signing.");
      return;
    }

    try {
      setPhase("connecting");
      const account = wallet.account ?? (await wallet.connect());
      setPhase("wrong_network");
      await ensureChain(provider, config);

      let call: { data: string; valueWei: bigint };
      if (action === "purchase") {
        const listingId = onChainListingId ?? getStoredOnChainListingId(match.listingId);
        if (!listingId) {
          throw new Error("This listing has no on-chain id yet. The seller must publish it first.");
        }
        const listingData = await ethCall(provider, config.contractAddress, encodeListingsQuery(BigInt(listingId)));
        const onChain = parseOnChainListing(listingData);
        if (!onChain) throw new Error("On-chain listing was not found.");
        if (onChain.status !== 1) throw new Error("On-chain listing is not active.");
        if (onChain.remainingKwh < encoded.quantityMilli) {
          throw new Error("On-chain remaining quantity is too low.");
        }
        if (normalizeAddress(onChain.seller) === normalizeAddress(account)) {
          throw new Error("The connected wallet is the listing seller. Self-trade is blocked.");
        }
        call = encodePurchaseEnergy(BigInt(listingId), encoded.quantityMilli, encoded.valueWei);
      } else {
        const tradeId = onChainTradeId ?? getStoredOnChainTradeId(match.id);
        if (!tradeId) throw new Error("No on-chain trade id yet. Purchase the match before settling.");
        call = encodeSettleTrade(BigInt(tradeId));
      }

      setPhase("awaiting_signature");
      const hash = await sendContractTransaction(provider, {
        from: account,
        to: config.contractAddress,
        data: call.data,
        valueWei: call.valueWei,
      });
      setTxHash(hash);
      setPhase("pending");
      await submitReport(action, hash);

      const receipt = await waitForReceipt(provider, hash);
      if (!receiptSucceeded(receipt)) {
        setPhase("failed");
        setError("The transaction reverted on-chain. The match is not confirmed.");
        await submitReport(action, hash);
        return;
      }
      if (action === "purchase") {
        const purchased = (receipt.logs ?? []).map(tradeIdFromPurchasedLog).find((id) => id !== null);
        if (purchased !== undefined && purchased !== null) {
          const stored = purchased.toString();
          storeOnChainTradeId(match.id, stored);
          setOnChainTradeId(stored);
        }
      }
      setPhase("mined");
      await submitReport(action, hash);
    } catch (caught) {
      const next = walletPhaseFromError(caught);
      setPhase(next);
      setError(isUserRejected(caught) ? "You rejected the request in MetaMask." : describeWalletError(caught));
      if (isUserRejected(caught)) {
        await submitReport("reject");
        rotateTradeIdempotencyKey(match.id, action);
      }
    }
  }, [action, config, contractReady, encoded, match.id, match.listingId, onChainListingId, onChainTradeId, submitReport, wallet]);

  if (!allowed) return null;

  return (
    <section className="mt-4 space-y-3 rounded-md border border-border bg-background p-4">
      <div>
        <h3 className="font-medium">{labels.title}</h3>
        <p className="mt-1 text-sm text-muted">
          Confirm quantity, price, and network, then sign in MetaMask. A mined receipt is not marketplace CONFIRMED.
        </p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Quantity</dt>
          <dd>{formatKwh(match.matchedKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Price</dt>
          <dd>{formatPrice(match.pricePerKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">{action === "purchase" ? "Pay (estimate)" : "Release (estimate)"}</dt>
          <dd>{formatWeiAmount(encoded.valueWei, config.nativeCurrency.symbol)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Network</dt>
          <dd>
            {config.chainName} ({config.chainId})
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted">Contract</dt>
          <dd className="font-mono text-xs break-all">{contractReady ? config.contractAddress : "Not configured"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted">Method</dt>
          <dd className="font-mono text-xs">{labels.method}</dd>
        </div>
      </dl>

      {!contractReady ? (
        <Alert tone="warning" role="alert" title="Contract address missing">
          Set NEXT_PUBLIC_CONTRACT_ADDRESS to the deployed EnerMeshMarketplace. Nothing is sent until it is configured.
        </Alert>
      ) : null}

      {wallet.hasProvider === false ? (
        <Alert tone="info">Install MetaMask (or another EIP-1193 wallet) to sign this trade.</Alert>
      ) : null}

      {wallet.account && !wallet.onExpectedChain ? (
        <Alert tone="warning" role="alert" title="Wrong network">
          Wallet is on chain {wallet.chainId ?? "unknown"}. Switch to {config.chainName} ({config.chainId}) before signing.
          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={() => void wallet.switchToExpectedChain()} disabled={wallet.switching}>
              {wallet.switching ? "Switching…" : "Switch network"}
            </Button>
          </div>
        </Alert>
      ) : null}

      {wallet.account ? (
        <p className="text-xs text-muted">Connected: {wallet.account}</p>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void wallet.connect()} disabled={wallet.connecting}>
          {wallet.connecting ? "Connecting…" : "Connect wallet"}
        </Button>
      )}

      {onChainListingId ? (
        <p className="text-xs text-muted">On-chain listing id {onChainListingId}</p>
      ) : action === "purchase" ? (
        <p className="text-xs text-muted">Waiting for the seller to publish this listing on-chain.</p>
      ) : null}
      {onChainTradeId ? <p className="text-xs text-muted">On-chain trade id {onChainTradeId}</p> : null}

      <TxStatusBanner
        phase={phase === "idle" ? "review" : phase}
        txHash={txHash}
        explorerUrl={config.explorerUrl}
        chainName={config.chainName}
        error={error ?? wallet.error}
        blockchainTxStatus={blockchainTxStatus ?? "WAITING_FOR_SIGNATURE"}
      />
      {apiTrade ? (
        <p className="text-xs text-muted">
          API verification: {apiTrade.blockchainTxStatus.replaceAll("_", " ")}
          {apiTrade.status === "CONFIRMED" || apiTrade.status === "COMPLETED" ? " (marketplace confirmed)" : " (wallet UI is not confirmation)"}
        </p>
      ) : null}
      {apiError ? (
        <Alert tone="error" role="alert" title="Verification failed">
          {apiError}
        </Alert>
      ) : null}

      {purchaseLocked ? (
        <p className="text-xs text-muted">Purchase already reported. Wait for API verification; do not sign again.</p>
      ) : null}
      {settleLocked ? (
        <p className="text-xs text-muted">Settlement already verified. Do not sign settleTrade again.</p>
      ) : null}

      <Button
        onClick={() => void submit()}
        disabled={
          busy ||
          purchaseLocked ||
          settleLocked ||
          !contractReady ||
          wallet.hasProvider === false ||
          Boolean(encoded.encodeError) ||
          (action === "purchase" && !onChainListingId) ||
          (action === "settle" && !onChainTradeId)
        }
      >
        {phase === "awaiting_signature" ? "Waiting for signature…" : phase === "pending" ? "Pending…" : labels.cta}
      </Button>
    </section>
  );
}
